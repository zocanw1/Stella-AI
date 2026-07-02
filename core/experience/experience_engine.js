const fs = require('fs');
const path = require('path');

const EXP_FILE = path.join(__dirname, '..', '..', 'data', 'experience', 'experiences.json');
const MODEL_DIR = path.join(__dirname, '..', '..', 'data', 'experience', 'models');

const ASSET_TYPES = ['episode', 'skill', 'rule', 'knowledge', 'discard'];
const RETRAIN_THRESHOLD = 20;

class ExperienceEngine {
    constructor(deepBrain, knowledgeBase, eventBus, EVENTS) {
        this.deepBrain = deepBrain;
        this.knowledge = knowledgeBase;
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.tf = null;
        this.classifier = null;
        this.isReady = false;
        this.experiences = this._load();
        this._initTF();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(EXP_FILE, 'utf-8'));
        } catch {
            return {
                episodes: [],
                trainingData: [],
                verifiedData: [],
                stats: { total: 0, converted: 0, discarded: 0 }
            };
        }
    }

    _save() {
        this.experiences.stats.total = this.experiences.episodes.length;
        if (!fs.existsSync(path.dirname(EXP_FILE))) {
            fs.mkdirSync(path.dirname(EXP_FILE), { recursive: true });
        }
        fs.writeFileSync(EXP_FILE, JSON.stringify(this.experiences, null, 2));
    }

    async _initTF() {
        try {
            this.tf = require('@tensorflow/tfjs');
            await this._loadModel();
            this.isReady = true;
        } catch {
            this.isReady = false;
        }
    }

    async _loadModel() {
        try {
            const mp = path.join(MODEL_DIR, 'classifier', 'model.json');
            if (fs.existsSync(mp)) {
                this.classifier = await this.tf.loadLayersModel({
                    load: async () => {
                        const modelJson = JSON.parse(fs.readFileSync(mp));
                        const wb = fs.readFileSync(path.join(MODEL_DIR, 'classifier', 'weights.bin'));
                        return {
                            modelTopology: modelJson.modelTopology,
                            weightSpecs: modelJson.weightsManifest[0].weights,
                            weightData: new Uint8Array(wb).buffer
                        };
                    }
                });
            }
        } catch {}
    }

    _features(task, result, reflection) {
        const text = (task + ' ' + (result || '') + ' ' + (reflection || '')).toLowerCase();
        const isError = /\b(error|fail|gagal|bug|salah)\b/.test(text) ? 1 : 0;
        const isSuccess = /\b(berhasil|success|done|selesai|complete)\b/i.test(text) ? 1 : 0;
        const hasToolPattern = /\b(use|pakai|run|jalankan|execute|call)\b/.test(text) ? 1 : 0;
        const hasCode = /(`{3}|function|class|const|let|var|def |import)/.test(text) ? 1 : 0;
        const isRepeatable = /\b(every|each|always|selalu|setiap|routine)\b/.test(text) ? 1 : 0;
        const hasKnowledge = /\b(fact|tahu|know|ingat|remember|cara|how.to|tutorial)\b/.test(text) ? 1 : 0;
        const taskLen = Math.min(1, (task.length / 500));
        const resultLen = Math.min(1, ((result || '').length / 500));
        return [isError, isSuccess, hasToolPattern, hasCode, isRepeatable, hasKnowledge, taskLen, resultLen];
    }

    async classify(task, result, reflection) {
        const features = this._features(task, result, reflection);

        if (this.isReady && this.classifier) {
            try {
                const input = this.tf.tensor2d([features]);
                const output = this.classifier.predict(input);
                const scores = Array.from(await output.data());
                input.dispose();
                output.dispose();

                const bestIdx = scores.indexOf(Math.max(...scores));
                return {
                    type: ASSET_TYPES[bestIdx] || 'discard',
                    confidence: scores[bestIdx] || 0,
                    allScores: ASSET_TYPES.reduce((acc, t, i) => {
                        acc[t] = scores[i] || 0;
                        return acc;
                    }, {})
                };
            } catch {}
        }

        return this._fallbackClassify(features);
    }

    _fallbackClassify(features) {
        const [isError, isSuccess, hasTool, hasCode, isRepeatable, hasKnowledge, taskLen, resultLen] = features;

        let type = 'discard';
        let confidence = 0.5;

        if (isError && resultLen > 0) {
            type = 'episode'; confidence = 0.7;
        } else if (hasTool && isSuccess && (hasCode || isRepeatable)) {
            type = 'skill'; confidence = 0.75;
        } else if (hasKnowledge && isSuccess) {
            type = 'knowledge'; confidence = 0.7;
        } else if (isRepeatable || (hasTool && isSuccess && taskLen > 0.3)) {
            type = 'rule'; confidence = 0.6;
        } else if (isSuccess && resultLen > 0.2) {
            type = 'episode'; confidence = 0.5;
        }

        return { type, confidence, allScores: {} };
    }

    async record(task, result, reflection = '', context = {}) {
        const classification = await this.classify(task, result, reflection);

        const experience = {
            id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            task: task.substring(0, 500),
            result: (result || '').substring(0, 1000),
            reflection: reflection.substring(0, 500),
            assetType: classification.type,
            confidence: classification.confidence,
            features: this._features(task, result, reflection),
            toolsUsed: context.tools || [],
            verified: context.verified || false,
            timestamp: new Date().toISOString(),
            processed: false
        };

        this.experiences.episodes.push(experience);

        if (experience.verified) {
            this.experiences.verifiedData.push({
                features: experience.features,
                label: ASSET_TYPES.indexOf(classification.type),
                source: context.source || 'verified_outcome',
                timestamp: Date.now()
            });
            if (this.experiences.verifiedData.length > 500) {
                this.experiences.verifiedData = this.experiences.verifiedData.slice(-500);
            }
            if (this.experiences.verifiedData.length >= RETRAIN_THRESHOLD && this.tf) {
                this._trainClassifier().catch(() => {});
            }
        }

        this._save();

        await this._convertToAsset(experience, classification);

        if (this.bus) {
            this.bus.emit(this.EVENTS.EXPERIENCE_RECORDED, {
                experienceId: experience.id,
                assetType: classification.type,
                confidence: classification.confidence,
                verified: experience.verified
            });
        }

        return { experience, classification };
    }

    addVerifiedTrainingSample(features, labelIndex, source = 'manual') {
        if (!Number.isFinite(labelIndex) || labelIndex < 0 || labelIndex >= ASSET_TYPES.length) return;
        this.experiences.verifiedData.push({
            features, label: labelIndex, source, timestamp: Date.now()
        });
        if (this.experiences.verifiedData.length > 500) {
            this.experiences.verifiedData = this.experiences.verifiedData.slice(-500);
        }
        this._save();
        if (this.experiences.verifiedData.length >= RETRAIN_THRESHOLD && this.tf) {
            this._trainClassifier().catch(() => {});
        }
    }

    async _convertToAsset(experience, classification) {
        const { type, confidence } = classification;

        if (type === 'discard' || confidence < 0.3) {
            this.experiences.stats.discarded++;
            this._save();
            return;
        }

        experience.processed = true;

        switch (type) {
            case 'episode':
                await this._storeAsEpisode(experience);
                break;
            case 'skill':
                await this._storeAsSkill(experience);
                break;
            case 'rule':
                await this._storeAsRule(experience);
                break;
            case 'knowledge':
                await this._storeAsKnowledge(experience);
                break;
        }

        this.experiences.stats.converted++;
        this._save();
    }

    async _storeAsEpisode(experience) {
        if (this.knowledge) {
            const category = experience.toolsUsed.length > 0 ? 'tool_episode' : 'conversation_episode';
            await this.knowledge.learn(
                `Episode: ${experience.task.substring(0, 200)} → ${experience.result.substring(0, 200)}`,
                category,
                'experience',
                experience.confidence
            );
        }
    }

    async _storeAsSkill(experience) {
        if (this.knowledge) {
            await this.knowledge.learn(
                `Skill: When handling "${experience.task.substring(0, 100)}", use tools [${(experience.toolsUsed || []).join(', ')}]`,
                'learned_skill',
                'experience',
                experience.confidence
            );
        }
    }

    async _storeAsRule(experience) {
        if (this.knowledge) {
            const rule = experience.reflection
                ? `Rule: ${experience.reflection.substring(0, 200)}`
                : `Pattern: ${experience.task.substring(0, 100)} → ${experience.result.substring(0, 100)}`;
            await this.knowledge.learn(rule, 'learned_rule', 'experience', experience.confidence);
        }
    }

    async _storeAsKnowledge(experience) {
        if (this.knowledge) {
            await this.knowledge.learn(
                experience.result.substring(0, 300),
                'learned_knowledge',
                'experience',
                experience.confidence
            );
        }
    }

    async _trainClassifier() {
        const data = this.experiences.verifiedData.length >= 5
            ? this.experiences.verifiedData
            : this.experiences.trainingData;
        if (!this.tf || data.length < 5) return;
        try {
            const model = this.tf.sequential();
            model.add(this.tf.layers.dense({
                inputShape: [8],
                units: 16,
                activation: 'relu'
            }));
            model.add(this.tf.layers.dropout({ rate: 0.2 }));
            model.add(this.tf.layers.dense({
                units: ASSET_TYPES.length,
                activation: 'softmax'
            }));
            model.compile({
                optimizer: this.tf.train.adam(0.001),
                loss: 'sparseCategoricalCrossentropy',
                metrics: ['accuracy']
            });

            const xs = data.map(d => d.features);
            const ys = data.map(d => d.label);
            const xT = this.tf.tensor2d(xs);
            const yT = this.tf.tensor1d(ys);

            await model.fit(xT, yT, { epochs: 10, batchSize: 8, verbose: 0 });
            xT.dispose();
            yT.dispose();

            if (this.classifier) this.classifier.dispose();
            this.classifier = model;

            const saveDir = path.join(MODEL_DIR, 'classifier');
            if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
            fs.writeFileSync(path.join(saveDir, 'model.json'), JSON.stringify({
                modelTopology: model.modelTopology,
                weightsManifest: [{ paths: ['weights.bin'], weights: model.weightSpecs }]
            }));
            const saveWeights = await model.getWeights();
            const weightData = [];
            for (const w of saveWeights) {
                weightData.push(...Array.from(await w.data()));
            }
            const buf = Buffer.from(new Float32Array(weightData).buffer);
            fs.writeFileSync(path.join(saveDir, 'weights.bin'), buf);
        } catch (err) {
            console.log('[Experience] Train error:', err.message);
        }
    }

    getStats() {
        return {
            total: this.experiences.stats.total,
            converted: this.experiences.stats.converted,
            discarded: this.experiences.stats.discarded,
            classifierReady: !!this.classifier,
            trainingSamples: this.experiences.trainingData.length,
            verifiedSamples: (this.experiences.verifiedData || []).length
        };
    }
}

module.exports = ExperienceEngine;
