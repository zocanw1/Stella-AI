const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '..', 'data', 'engine', 'models', 'intent');

const INTENTS = ['voice_join', 'voice_leave', 'greeting', 'question', 'conversation'];
const FEATURES = [
    'has_join', 'has_leave', 'has_question_word', 'has_question_mark',
    'has_voice_keyword', 'word_count_norm', 'is_short', 'starts_with_question',
    'has_politeness', 'has_imperative', 'has_greeting'
];

class IntentClassifier {
    constructor() {
        this.tf = null;
        this.model = null;
        this.isReady = false;
        this.trainingData = [];
        this.labels = [];
    }

    async initialize() {
        try {
            this.tf = require('@tensorflow/tfjs');
            await this._loadModel();
            this.isReady = !!this.model;
        } catch (e) {
            console.warn('[IntentClassifier] TF.js unavailable, using fallback:', e.message);
            this.isReady = false;
        }
    }

    async _loadModel() {
        try {
            const modelPath = path.join(MODEL_DIR, 'model.json');
            if (fs.existsSync(modelPath)) {
                const modelJson = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
                const weightsPath = path.join(MODEL_DIR, 'weights.bin');
                if (fs.existsSync(weightsPath)) {
                    this.model = await this.tf.loadLayersModel(this.tf.io.fromMemory(
                        modelJson.modelTopology,
                        modelJson.weightsManifest,
                        new Uint8Array(fs.readFileSync(weightsPath)).buffer
                    ));
                }
            }
        } catch {}
    }

    extractFeatures(text) {
        const t = text.toLowerCase().trim();
        const words = t.split(/\s+/);
        return [
            /\bjoin\b/.test(t) || /\bmasuk\b/.test(t) ? 1 : 0,
            /\b(leave|keluar)\b/.test(t) ? 1 : 0,
            /\b(apa|siapa|kapan|dimana|mengapa|kenapa|bagaimana|apakah|bisakah)\b/.test(t) ? 1 : 0,
            t.includes('?') ? 1 : 0,
            /\b(voice|vc|channel|suara|audio|discord|call)\b/.test(t) ? 1 : 0,
            Math.min(1, words.length / 10),
            words.length <= 3 ? 1 : 0,
            /^(apa|siapa|kapan|dimana|mengapa|kenapa|bagaimana|apakah|bisakah)/.test(t) ? 1 : 0,
            /\b(tolong|minta|bisa|boleh)\b/.test(t) ? 1 : 0,
            words.length <= 4 && !t.includes('?') ? 1 : 0,
            /\b(hai|halo|hi|hey|pagi|siang|sore|malam)\b/.test(t) ? 1 : 0,
        ].map(v => parseFloat(v));
    }

    async predict(text) {
        if (this.isReady && this.model) {
            try {
                const features = this.extractFeatures(text);
                const input = this.tf.tensor2d([features]);
                const output = this.model.predict(input);
                const probs = await output.data();
                input.dispose();
                output.dispose();

                const scores = {};
                let bestIdx = 0;
                for (let i = 0; i < INTENTS.length; i++) {
                    scores[INTENTS[i]] = probs[i];
                    if (probs[i] > probs[bestIdx]) bestIdx = i;
                }
                return { intent: INTENTS[bestIdx], confidence: probs[bestIdx], scores };
            } catch {}
        }

        return this._fallbackPredict(text);
    }

    _fallbackPredict(text) {
        const t = text.toLowerCase().trim();
        const words = t.split(/\s+/);
        const hasJoin = /\bjoin\b/.test(t);
        const hasLeave = /\b(leave|keluar)\b/.test(t);
        const hasQuestionMark = t.includes('?');
        const startsWithQuestion = /^(apa|siapa|kapan|dimana|mengapa|kenapa|bagaimana|apakah|bisakah)/.test(t);
        const hasGreeting = /\b(hai|halo|hi|hey|pagi|siang|sore|malam)\b/.test(t);
        const hasQuestionWord = /\b(apa|siapa|kapan|dimana|mengapa|kenapa|bagaimana|apakah|bisakah)\b/.test(t);

        const scores = {};
        for (const i of INTENTS) scores[i] = 0.05;

        if (hasGreeting && words.length <= 3) scores.greeting = 0.85;
        else if (hasGreeting) scores.greeting = 0.50;

        if (hasQuestionWord || hasQuestionMark) {
            scores.question = Math.min(0.85, 0.30 + (hasQuestionWord ? 0.30 : 0) + (hasQuestionMark ? 0.25 : 0));
        }

        if (hasJoin && !hasQuestionWord && !hasQuestionMark && words.length <= 4) {
            scores.voice_join = 0.80;
            scores.question = 0.10;
        } else if (hasJoin && (hasQuestionWord || hasQuestionMark)) {
            scores.voice_join = 0.15;
        } else if (hasJoin) {
            scores.voice_join = 0.35;
        }

        if (hasLeave && !hasQuestionWord && !hasQuestionMark && words.length <= 4) {
            scores.voice_leave = 0.80;
            scores.question = 0.10;
        } else if (hasLeave) {
            scores.voice_leave = 0.30;
        }

        let bestIntent = 'conversation';
        let bestScore = 0;
        for (const [intent, score] of Object.entries(scores)) {
            if (score > bestScore) { bestScore = score; bestIntent = intent; }
        }

        return { intent: bestIntent, confidence: Math.round(bestScore * 100) / 100, scores };
    }

    async addExample(text, intent) {
        if (!INTENTS.includes(intent)) return;
        const features = this.extractFeatures(text);
        const label = INTENTS.indexOf(intent);
        this.trainingData.push(features);
        this.labels.push(label);
    }

    async train(batchSize = 8, epochs = 50) {
        if (!this.tf) return null;
        if (this.trainingData.length < 2) return { error: 'Need at least 2 examples', trained: false };

        const numClasses = INTENTS.length;
        const numFeatures = FEATURES.length;

        const xs = this.tf.tensor2d(this.trainingData);
        const ys = this.tf.oneHot(this.tf.tensor1d(this.labels, 'int32'), numClasses);

        this.model = this.tf.sequential();
        this.model.add(this.tf.layers.dense({ units: 16, activation: 'relu', inputShape: [numFeatures] }));
        this.model.add(this.tf.layers.dropout({ rate: 0.2 }));
        this.model.add(this.tf.layers.dense({ units: 8, activation: 'relu' }));
        this.model.add(this.tf.layers.dense({ units: numClasses, activation: 'softmax' }));

        this.model.compile({
            optimizer: this.tf.train.adam(0.01),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        const history = await this.model.fit(xs, ys, {
            batchSize: Math.min(batchSize, this.trainingData.length),
            epochs,
            shuffle: true,
            validationSplit: 0,
            callbacks: { onEpochEnd: () => {} }
        });

        xs.dispose();
        ys.dispose();

        await this._saveModel();
        this.isReady = true;
        return {
            trained: true,
            loss: history.history.loss[history.history.loss.length - 1],
            accuracy: history.history.acc ? history.history.acc[history.history.acc.length - 1] : null,
            samples: this.trainingData.length
        };
    }

    async _saveModel() {
        if (!this.model || !this.tf) return;
        try {
            if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });
            const result = await this.model.save(this.tf.io.withSaveHandler(async (modelArtifacts) => {
                fs.writeFileSync(path.join(MODEL_DIR, 'model.json'), JSON.stringify({
                    modelTopology: modelArtifacts.modelTopology,
                    weightsManifest: modelArtifacts.weightSpecs.map(s => ({
                        paths: ['weights.bin'],
                        weights: [s]
                    })),
                    format: 'tfjs',
                    generatedBy: 'Stella v5 IntentClassifier',
                    convertedAt: new Date().toISOString()
                }, null, 2));
                fs.writeFileSync(path.join(MODEL_DIR, 'weights.bin'), Buffer.from(modelArtifacts.weightData));
            }));
        } catch {}
    }

    async seedDefaultData() {
        const data = [
            ['join', 'voice_join'], ['join vc', 'voice_join'], ['join voice', 'voice_join'],
            ['masuk voice', 'voice_join'], ['@Stella join', 'voice_join'], ['join dong', 'voice_join'],
            ['join channel', 'voice_join'], ['stella join', 'voice_join'],
            ['leave', 'voice_leave'], ['keluar', 'voice_leave'], ['leave vc', 'voice_leave'],
            ['keluar voice', 'voice_leave'], ['@Stella leave', 'voice_leave'],
            ['hai', 'greeting'], ['halo', 'greeting'], ['hi', 'greeting'],
            ['hai stella', 'greeting'], ['pagi', 'greeting'], ['siang', 'greeting'],
            ['apa kabar', 'question'], ['siapa kamu', 'question'], ['kapan dibuat', 'question'],
            ['bagaimana cara kerja', 'question'], ['apakah kamu bisa', 'question'],
            ['Apakah kamu pernah join organisasi', 'question'], ['bisakah kamu join', 'question'],
            ['Stella tolong join dong', 'voice_join'],
            ['bisa join ke voice?', 'question'], ['bisa join vc?', 'question'],
            ['Stella join ya', 'voice_join'], ['join aja', 'voice_join'],
            ['join organisasi itu sulit', 'conversation'], ['join group', 'conversation'],
        ];
        for (const [text, intent] of data) {
            await this.addExample(text, intent);
        }
    }

    getStats() {
        return {
            ready: this.isReady,
            modelLoaded: !!this.model,
            trainingSamples: this.trainingData.length,
            intents: INTENTS,
            features: FEATURES.length
        };
    }
}

module.exports = IntentClassifier;
