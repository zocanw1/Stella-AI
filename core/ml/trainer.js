const fs = require('fs');
const path = require('path');

const METRICS_DIR = path.join(__dirname, '..', '..', 'data', 'ml', 'metrics');
const MODELS_DIR = path.join(__dirname, '..', '..', 'data', 'ml', 'models');

class Trainer {
    constructor({ datasetManager, groundTruthManager, modelRegistry, evaluator } = {}) {
        this.datasetManager = datasetManager;
        this.groundTruth = groundTruthManager;
        this.modelRegistry = modelRegistry;
        this.evaluator = evaluator;
    }

    async train(params) {
        const {
            modelName,
            modelAdapter,
            dataset,
            config = {}
        } = params;

        const epochs = config.epochs || 20;
        const batchSize = config.batchSize || 16;
        const validationSplit = config.validationSplit || 0.2;
        const shuffleBeforeSplit = config.shuffleBeforeSplit !== false;

        if (!modelAdapter || typeof modelAdapter.encode !== 'function') {
            throw new Error('modelAdapter must implement encode(text) => features');
        }
        if (typeof modelAdapter.createModel !== 'function') {
            throw new Error('modelAdapter must implement createModel(inputShape, numClasses)');
        }

        const startTime = Date.now();

        const datasets = this._prepareDatasets(dataset, validationSplit, shuffleBeforeSplit);
        const classes = datasets.train.getClasses();
        const numClasses = classes.length;

        if (numClasses < 2) {
            console.log(`[Trainer] ${modelName}: need at least 2 classes, got ${numClasses}`);
            return null;
        }

        const tf = this._loadTF();
        if (!tf) {
            console.log(`[Trainer] ${modelName}: TF.js not available`);
            return null;
        }

        let inputShape = null;
        try {
            const sampleEncoded = modelAdapter.encode(datasets.train.samples[0].text);
            inputShape = Array.isArray(sampleEncoded) ? sampleEncoded.length : 1;
        } catch (err) {
            console.log(`[Trainer] ${modelName}: encode error -`, err.message);
            return null;
        }

        const tfModel = modelAdapter.createModel(inputShape, numClasses, tf);

        const { xs, ys } = this._encodeDataset(datasets.train, modelAdapter, numClasses, classes);
        const trainX = tf.tensor2d(xs);
        const trainY = tf.tensor2d(ys);

        console.log(`[Trainer] ${modelName}: training on ${xs.length} samples, ${classes.length} classes`);
        const history = await tfModel.fit(trainX, trainY, {
            epochs,
            batchSize: Math.min(batchSize, xs.length),
            shuffle: true,
            verbose: 0,
            validationSplit: xs.length < 100 ? 0 : validationSplit
        });

        const trainingLoss = history.history.loss[history.history.loss.length - 1];
        const validationLoss = history.history.val_loss
            ? history.history.val_loss[history.history.val_loss.length - 1]
            : null;

        trainX.dispose();
        trainY.dispose();

        const metrics = await this._evaluate(tfModel, modelAdapter, datasets.test, classes, numClasses, tf);

        const modelSizeBytes = await this._getModelSize(tfModel, tf);

        const inferenceTimes = await this._benchmarkInference(tfModel, modelAdapter, datasets.test.samples.slice(0, 50), tf);
        const avgInferenceMs = inferenceTimes.length > 0
            ? inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length
            : null;

        const modelDir = path.join(MODELS_DIR, modelName, `v${(await this._getNextVersion(modelName))}`);
        await this._saveModel(tfModel, modelAdapter, modelDir);

        tfModel.dispose();

        const versionData = {
            datasetVersion: 1,
            trainingDate: new Date().toISOString(),
            sampleCount: datasets.train.samples.length,
            accuracy: metrics.accuracy,
            precision: metrics.precision,
            recall: metrics.recall,
            f1Score: metrics.f1Score,
            trainingLoss,
            validationLoss,
            inferenceTimeMs: avgInferenceMs ? +avgInferenceMs.toFixed(2) : null,
            modelSizeBytes,
            confusionMatrix: metrics.confusionMatrix
        };

        if (this.modelRegistry) {
            this.modelRegistry.registerModel(modelName, {
                architecture: 'dense',
                inputShape,
                outputClasses: classes
            });
            this.modelRegistry.recordVersion(modelName, versionData);
        }

        const durationMs = Date.now() - startTime;
        this._saveMetrics(modelName, versionData, durationMs);

        return {
            modelName,
            version: versionData,
            metrics: versionData,
            durationMs,
            classes,
            sampleCount: datasets.train.samples.length,
            testSampleCount: datasets.test.samples.length,
            modelPath: modelDir
        };
    }

    _loadTF() {
        try { return require('@tensorflow/tfjs'); }
        catch { return null; }
    }

    _prepareDatasets(dataset, validationSplit, shuffle) {
        if (shuffle) dataset.shuffle();
        const hasEnough = dataset.samples.length >= 10;
        const split = hasEnough ? validationSplit : 0;
        if (split > 0) {
            const splitRatio = 1 - split;
            return dataset.balancedSplit(splitRatio);
        }
        const copy = new (require('./dataset_manager'))('eval_copy');
        copy.addAll(dataset.samples);
        return { train: dataset, test: copy };
    }

    _encodeDataset(dataset, adapter, numClasses, classes) {
        const xs = [];
        const ys = [];
        for (const sample of dataset.samples) {
            try {
                const features = adapter.encode(sample.text);
                xs.push(features);
                const labelVec = new Array(numClasses).fill(0);
                const classIdx = classes.indexOf(sample.label);
                if (classIdx >= 0) labelVec[classIdx] = 1;
                ys.push(labelVec);
            } catch {}
        }
        return { xs, ys };
    }

    async _evaluate(tfModel, adapter, testDataset, classes, numClasses, tf) {
        const predictions = [];
        const labels = [];

        for (const sample of testDataset.samples.slice(0, 200)) {
            try {
                const features = adapter.encode(sample.text);
                const input = tf.tensor2d([features]);
                const output = tfModel.predict(input);
                const scores = await output.data();
                input.dispose();
                output.dispose();

                let maxIdx = 0;
                for (let i = 1; i < scores.length; i++) {
                    if (scores[i] > scores[maxIdx]) maxIdx = i;
                }
                predictions.push(classes[maxIdx] || 'unknown');
                labels.push(sample.label);
            } catch {}
        }

        const Evaluator = require('./evaluator');
        return Evaluator.fullEvaluate(predictions, labels, classes);
    }

    async _getModelSize(tfModel, tf) {
        try {
            const weights = tfModel.getWeights();
            let totalBytes = 0;
            for (const w of weights) {
                totalBytes += w.size * 4;
            }
            return totalBytes;
        } catch { return null; }
    }

    async _benchmarkInference(tfModel, adapter, samples, tf) {
        const times = [];
        for (const sample of samples) {
            try {
                const features = adapter.encode(sample.text);
                const start = process.hrtime.bigint();
                const input = tf.tensor2d([features]);
                const output = tfModel.predict(input);
                await output.data();
                const end = process.hrtime.bigint();
                input.dispose();
                output.dispose();
                times.push(Number(end - start) / 1e6);
            } catch {}
        }
        return times;
    }

    async _saveModel(tfModel, adapter, modelDir) {
        if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
        if (typeof adapter.saveModel === 'function') {
            await adapter.saveModel(tfModel, modelDir);
        } else {
            await tfModel.save(this._ioHandler(modelDir));
        }
    }

    _ioHandler(dirPath) {
        return {
            save: async (artifacts) => {
                fs.writeFileSync(path.join(dirPath, 'model.json'), JSON.stringify({
                    modelTopology: artifacts.modelTopology,
                    format: artifacts.format,
                    generatedBy: artifacts.generatedBy,
                    weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
                }));
                if (artifacts.weightData) {
                    fs.writeFileSync(path.join(dirPath, 'weights.bin'), Buffer.from(artifacts.weightData));
                }
                return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
            },
            load: async () => {
                const modelJson = JSON.parse(fs.readFileSync(path.join(dirPath, 'model.json')));
                const weightData = fs.readFileSync(path.join(dirPath, 'weights.bin'));
                return {
                    modelTopology: modelJson.modelTopology,
                    weightSpecs: modelJson.weightsManifest[0].weights,
                    weightData: new Uint8Array(weightData).buffer
                };
            }
        };
    }

    async _getNextVersion(modelName) {
        if (this.modelRegistry) {
            const model = this.modelRegistry.getModel(modelName);
            return model ? (model.versions.length + 1) : 1;
        }
        const vDir = path.join(MODELS_DIR, modelName);
        try {
            const dirs = fs.readdirSync(vDir).filter(d => d.startsWith('v'));
            return dirs.length + 1;
        } catch { return 1; }
    }

    _saveMetrics(modelName, versionData, durationMs) {
        if (!fs.existsSync(METRICS_DIR)) fs.mkdirSync(METRICS_DIR, { recursive: true });
        const metricFile = path.join(METRICS_DIR, `${modelName}_v${versionData.datasetVersion || 1}.json`);
        fs.writeFileSync(metricFile, JSON.stringify({
            modelName,
            ...versionData,
            trainingDurationMs: durationMs,
            savedAt: new Date().toISOString()
        }, null, 2));
    }
}

module.exports = Trainer;
