/**
 * ============================================
 *  🧠 DEEP BRAIN - TensorFlow.js Neural Networks
 *  Self-training intent classifier & quality predictor
 * ============================================
 */

const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'data', 'models');
const TRAINING_FILE = path.join(MODELS_DIR, 'training_data.json');
const VOCAB_FILE = path.join(MODELS_DIR, 'vocabulary.json');
const NEURAL_STATE_FILE = path.join(MODELS_DIR, 'neural_state.json');
const RETRAIN_THRESHOLD = 50; // Re-train after N new samples

// --- CUSTOM TF.JS FILE SYSTEM IO (Tahan Banting Tanpa tfjs-node) ---
function fileSystemIO(dirPath) {
    return {
        save: async (modelArtifacts) => {
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(path.join(dirPath, 'model.json'), JSON.stringify({
                modelTopology: modelArtifacts.modelTopology,
                format: modelArtifacts.format,
                generatedBy: modelArtifacts.generatedBy,
                convertedBy: modelArtifacts.convertedBy,
                weightsManifest: [{ paths: ['weights.bin'], weights: modelArtifacts.weightSpecs }]
            }));
            if (modelArtifacts.weightData) {
                fs.writeFileSync(path.join(dirPath, 'weights.bin'), Buffer.from(modelArtifacts.weightData));
            }
            return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
        },
        load: async () => {
            const modelJson = JSON.parse(fs.readFileSync(path.join(dirPath, 'model.json')));
            const weightData = fs.readFileSync(path.join(dirPath, 'weights.bin'));
            return {
                modelTopology: modelJson.modelTopology,
                format: modelJson.format,
                generatedBy: modelJson.generatedBy,
                convertedBy: modelJson.convertedBy,
                weightSpecs: modelJson.weightsManifest[0].weights,
                weightData: new Uint8Array(weightData).buffer
            };
        }
    };
}

// Intent labels
const INTENT_LABELS = [
    'command', 'question', 'file_op', 'search',
    'greeting', 'reminder', 'creative', 'conversation', 'personal'
];

const THOUGHT_INPUTS = [
    ...INTENT_LABELS.map(label => `intent_${label}`),
    'sentiment_positive', 'sentiment_negative', 'sentiment_neutral',
    'topic_code', 'topic_system', 'topic_web', 'topic_media',
    'topic_time', 'topic_personal', 'topic_creative', 'topic_general',
    'length_short', 'length_medium', 'length_long',
    'has_question_mark', 'has_command_prefix', 'has_tool_words', 'has_media_words'
];

const THOUGHT_OUTPUTS = [
    'respond_direct', 'use_codex', 'use_tool', 'research',
    'save_memory', 'schedule', 'media', 'concise',
    'empathetic', 'proactive'
];

class DeepBrain {
    constructor() {
        this.tf = null;
        this.intentModel = null;
        this.qualityModel = null;
        this.vocabulary = this._loadJSON(VOCAB_FILE, { words: {}, size: 0 });
        this.trainingData = this._loadJSON(TRAINING_FILE, {
            intent_samples: [],
            quality_samples: [],
            thought_samples: [],
            pending_count: 0,
            total_trained: 0,
            last_train: null
        });
        if (!Array.isArray(this.trainingData.thought_samples)) this.trainingData.thought_samples = [];
        this.neuralState = this._loadJSON(NEURAL_STATE_FILE, this._createDefaultNeuralState());
        this._ensureNeuralStateShape();
        this.isReady = false;
        this.isTraining = false;

        // Initialize TF.js asynchronously
        this._initTF();
    }

    async _initTF() {
        try {
            this.tf = require('@tensorflow/tfjs');
            console.log('[DeepBrain] TensorFlow.js loaded successfully');

            // Try loading saved models
            await this._loadModels();
            this.isReady = true;
            console.log(`[DeepBrain] Ready | Vocab: ${this.vocabulary.size} words | Samples: ${this.trainingData.total_trained}`);
        } catch (err) {
            console.error('[DeepBrain] TF.js init error (akan fallback ke rule-based):', err.message);
            this.isReady = false;
        }
    }

    // ── Data Loading ──
    _loadJSON(filePath, defaultValue) {
        try {
            if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) { /* ignore */ }
        return JSON.parse(JSON.stringify(defaultValue));
    }

    _saveJSON(filePath, data) {
        try {
            if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (e) { console.error('[DeepBrain] Save error:', e.message); }
    }

    _createDefaultNeuralState() {
        const weights = THOUGHT_OUTPUTS.map(() => new Array(THOUGHT_INPUTS.length).fill(0));
        const bias = new Array(THOUGHT_OUTPUTS.length).fill(-0.25);

        const w = (output, input, value) => {
            const outIdx = THOUGHT_OUTPUTS.indexOf(output);
            const inIdx = THOUGHT_INPUTS.indexOf(input);
            if (outIdx >= 0 && inIdx >= 0) weights[outIdx][inIdx] += value;
        };

        w('respond_direct', 'intent_greeting', 1.0);
        w('respond_direct', 'intent_conversation', 0.7);
        w('respond_direct', 'length_short', 0.5);
        w('use_codex', 'intent_command', 1.1);
        w('use_codex', 'intent_file_op', 1.2);
        w('use_codex', 'topic_code', 0.8);
        w('use_codex', 'topic_system', 0.7);
        w('use_tool', 'intent_command', 1.0);
        w('use_tool', 'intent_file_op', 1.2);
        w('use_tool', 'has_tool_words', 0.8);
        w('research', 'intent_question', 0.8);
        w('research', 'intent_search', 1.2);
        w('research', 'topic_web', 0.8);
        w('research', 'has_question_mark', 0.4);
        w('save_memory', 'intent_personal', 0.9);
        w('save_memory', 'topic_personal', 0.7);
        w('schedule', 'intent_reminder', 1.3);
        w('schedule', 'topic_time', 0.8);
        w('media', 'intent_creative', 0.5);
        w('media', 'topic_media', 1.4);
        w('concise', 'length_short', 0.8);
        w('concise', 'intent_greeting', 0.7);
        w('empathetic', 'sentiment_negative', 1.1);
        w('empathetic', 'intent_personal', 0.5);
        w('proactive', 'intent_command', 0.7);
        w('proactive', 'intent_file_op', 0.8);
        w('proactive', 'has_tool_words', 0.6);

        return {
            version: 1,
            inputLabels: THOUGHT_INPUTS,
            outputLabels: THOUGHT_OUTPUTS,
            learningRate: 0.035,
            interactionCount: 0,
            weights,
            bias,
            lastUpdate: null
        };
    }

    _ensureNeuralStateShape() {
        const base = this._createDefaultNeuralState();
        const state = this.neuralState || {};
        const validWeights = Array.isArray(state.weights) &&
            state.weights.length === THOUGHT_OUTPUTS.length &&
            state.weights.every(row => Array.isArray(row) && row.length === THOUGHT_INPUTS.length);
        const validBias = Array.isArray(state.bias) && state.bias.length === THOUGHT_OUTPUTS.length;

        if (!validWeights) state.weights = base.weights;
        if (!validBias) state.bias = base.bias;
        state.version = base.version;
        state.inputLabels = THOUGHT_INPUTS;
        state.outputLabels = THOUGHT_OUTPUTS;
        state.learningRate = typeof state.learningRate === 'number' ? state.learningRate : base.learningRate;
        state.interactionCount = Number.isFinite(state.interactionCount) ? state.interactionCount : 0;
        this.neuralState = state;
    }

    // ═══════════════════════════════════════
    //  VOCABULARY BUILDER
    // ═══════════════════════════════════════

    _tokenize(text) {
        if (!text) return [];
        return text.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/)
            .filter(w => w.length > 1);
    }

    _updateVocabulary(tokens) {
        let updated = false;
        tokens.forEach(token => {
            if (!this.vocabulary.words[token]) {
                this.vocabulary.words[token] = this.vocabulary.size;
                this.vocabulary.size++;
                updated = true;
            }
        });
        if (updated) this._saveJSON(VOCAB_FILE, this.vocabulary);
    }

    /**
     * Convert text to bag-of-words vector based on vocabulary.
     */
    _textToVector(text, maxLen = 200) {
        const tokens = this._tokenize(text);
        const vector = new Float32Array(maxLen).fill(0);
        tokens.forEach(token => {
            const idx = this.vocabulary.words[token];
            if (idx !== undefined && idx < maxLen) {
                vector[idx] = 1;
            }
        });
        return vector;
    }

    // ═══════════════════════════════════════
    //  INTENT CLASSIFIER (Neural Network)
    // ═══════════════════════════════════════

    /**
     * Predict intent using neural network.
     * Falls back to rule-based if model not ready.
     */
    async predictIntent(text) {
        if (!this.isReady || !this.intentModel) {
            return { intent: null, confidence: 0, source: 'no_model' };
        }

        try {
            const vector = this._textToVector(text);
            const inputTensor = this.tf.tensor2d([Array.from(vector)]);
            const prediction = this.intentModel.predict(inputTensor);
            const values = await prediction.data();
            inputTensor.dispose();
            prediction.dispose();

            let maxIdx = 0;
            let maxVal = values[0];
            for (let i = 1; i < values.length; i++) {
                if (values[i] > maxVal) { maxVal = values[i]; maxIdx = i; }
            }

            return {
                intent: INTENT_LABELS[maxIdx],
                confidence: maxVal,
                all: INTENT_LABELS.map((label, i) => ({ label, score: values[i] })),
                source: 'neural_network'
            };
        } catch (err) {
            console.error('[DeepBrain] Predict error:', err.message);
            return { intent: null, confidence: 0, source: 'error' };
        }
    }

    /**
     * Predict response quality (0 to 1).
     */
    async predictQuality(features) {
        if (!this.isReady || !this.qualityModel) return { quality: 0.5, source: 'no_model' };

        try {
            // features: [topicIdx, sentimentScore, intentIdx, messageLengthNorm]
            const inputTensor = this.tf.tensor2d([features]);
            const prediction = this.qualityModel.predict(inputTensor);
            const value = (await prediction.data())[0];
            inputTensor.dispose();
            prediction.dispose();
            return { quality: value, source: 'neural_network' };
        } catch (err) {
            return { quality: 0.5, source: 'error' };
        }
    }

    // ═══════════════════════════════════════
    //  TRAINING DATA COLLECTION
    // ═══════════════════════════════════════

    /**
     * Add a training sample for intent classification.
     */
    addIntentSample(text, intentLabel) {
        if (!INTENT_LABELS.includes(intentLabel)) return;

        const tokens = this._tokenize(text);
        this._updateVocabulary(tokens);

        this.trainingData.intent_samples.push({
            text: text.substring(0, 200),
            intent: intentLabel,
            added: Date.now()
        });

        // Cap at 2000 samples, remove oldest
        if (this.trainingData.intent_samples.length > 2000) {
            this.trainingData.intent_samples = this.trainingData.intent_samples.slice(-2000);
        }

        this.trainingData.pending_count++;
        this._saveJSON(TRAINING_FILE, this.trainingData);

        // Auto re-train check
        if (this.trainingData.pending_count >= RETRAIN_THRESHOLD && !this.isTraining) {
            console.log(`[DeepBrain] ${RETRAIN_THRESHOLD} new samples accumulated, triggering auto-retrain...`);
            this.trainIntentModel().catch(e => console.error('[DeepBrain] Auto-train error:', e.message));
        }
    }

    /**
     * Add quality training sample from feedback.
     */
    addQualitySample(features, positive) {
        this.trainingData.quality_samples.push({
            features,
            score: positive ? 1.0 : 0.0,
            added: Date.now()
        });

        if (this.trainingData.quality_samples.length > 1000) {
            this.trainingData.quality_samples = this.trainingData.quality_samples.slice(-1000);
        }
        this._saveJSON(TRAINING_FILE, this.trainingData);
    }

    // ═══════════════════════════════════════
    //  MODEL TRAINING
    // ═══════════════════════════════════════

    async think(text, context = {}) {
        const prediction = await this.predictIntent(text);
        const intentScores = new Array(INTENT_LABELS.length).fill(0);

        if (Array.isArray(prediction.all)) {
            prediction.all.forEach(item => {
                const idx = INTENT_LABELS.indexOf(item.label);
                if (idx >= 0) intentScores[idx] = Number(item.score) || 0;
            });
        } else {
            const fallbackIntent = prediction.intent || context.ruleIntent || 'conversation';
            const idx = INTENT_LABELS.indexOf(fallbackIntent);
            if (idx >= 0) intentScores[idx] = Math.max(prediction.confidence || 0.55, 0.35);
        }

        const input = this._buildThoughtInput(text, context, intentScores);
        const values = this._forwardNeuralPolicy(input);
        const outputs = {};
        values.forEach((value, idx) => { outputs[THOUGHT_OUTPUTS[idx]] = value; });

        let intent = prediction.intent;
        let confidence = prediction.confidence || 0;
        if (!intent || confidence < 0.45) {
            intent = context.ruleIntent || this._intentFromPolicy(outputs, text);
            confidence = Math.max(confidence, 0.46);
        }
        const policyIntent = this._intentFromPolicy(outputs, text);
        if (intent === 'conversation' && policyIntent !== 'conversation') {
            intent = policyIntent;
            confidence = Math.max(confidence, 0.62);
        }
        if (context.ruleIntent && context.ruleIntent !== 'conversation') {
            const ruleMatchesAction =
                outputs.use_tool >= 0.55 ||
                outputs.use_codex >= 0.55 ||
                outputs.research >= 0.6 ||
                outputs.media >= 0.6 ||
                outputs.schedule >= 0.6;
            if (ruleMatchesAction) {
                intent = context.ruleIntent;
                confidence = Math.max(confidence, 0.68);
            }
        }

        const active = Object.entries(outputs)
            .filter(([, value]) => value >= 0.55)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => `${name}:${Math.round(value * 100)}%`);
        const dominantMode = active[0] ? active[0].split(':')[0] : 'respond_direct';

        const thought = {
            source: 'neural_policy',
            intent,
            confidence,
            outputs,
            dominantMode,
            shouldUseCodex: outputs.use_codex >= 0.55 || outputs.proactive >= 0.62,
            shouldUseTools: outputs.use_tool >= 0.55 || outputs.media >= 0.62 || ['command', 'file_op'].includes(intent),
            shouldResearch: outputs.research >= 0.63,
            shouldRespondDirect: outputs.respond_direct >= 0.58 && outputs.use_tool < 0.55 && outputs.research < 0.63,
            shouldSaveMemory: outputs.save_memory >= 0.62,
            shouldSchedule: outputs.schedule >= 0.62,
            style: {
                concise: outputs.concise >= 0.58,
                empathetic: outputs.empathetic >= 0.58,
                proactive: outputs.proactive >= 0.58
            },
            inputLabels: THOUGHT_INPUTS,
            outputLabels: THOUGHT_OUTPUTS,
            prompt: this._buildNeuralPrompt(intent, confidence, dominantMode, active)
        };

        this.recordThought(text, thought, context);
        return thought;
    }

    _buildThoughtInput(text, context, intentScores) {
        const lower = (text || '').toLowerCase();
        const length = lower.length;
        const topics = new Set([...(context.topics || []), ...this._roughTopics(lower)]);
        const sentiment = context.sentiment || this._roughSentiment(lower);

        return [
            ...intentScores,
            sentiment === 'positive' ? 1 : 0,
            sentiment === 'negative' ? 1 : 0,
            sentiment === 'neutral' ? 1 : 0,
            topics.has('coding') || topics.has('code') ? 1 : 0,
            topics.has('system') || topics.has('terminal') || topics.has('file') ? 1 : 0,
            topics.has('web') || topics.has('search') || topics.has('news') ? 1 : 0,
            topics.has('media') || topics.has('image') || topics.has('voice') ? 1 : 0,
            topics.has('time') || topics.has('reminder') || topics.has('schedule') ? 1 : 0,
            topics.has('personal') ? 1 : 0,
            topics.has('creative') ? 1 : 0,
            topics.size === 0 || topics.has('general') ? 1 : 0,
            length > 0 && length <= 40 ? 1 : 0,
            length > 40 && length <= 180 ? 1 : 0,
            length > 180 ? 1 : 0,
            lower.includes('?') || /\b(apa|kenapa|bagaimana|gimana|bisakah|kapan|dimana)\b/.test(lower) ? 1 : 0,
            lower.trim().startsWith('/') ? 1 : 0,
            /\b(edit|ubah|buat|jalankan|run|cek|baca|tulis|hapus|rename|install|test|debug)\b/.test(lower) ? 1 : 0,
            /\b(gambar|foto|image|voice|suara|audio|video|screenshot|media)\b/.test(lower) ? 1 : 0
        ];
    }

    _forwardNeuralPolicy(input) {
        return this.neuralState.weights.map((row, outIdx) => {
            let sum = this.neuralState.bias[outIdx] || 0;
            for (let i = 0; i < input.length; i++) sum += (row[i] || 0) * input[i];
            return this._sigmoid(sum);
        });
    }

    _sigmoid(value) {
        return 1 / (1 + Math.exp(-value));
    }

    _roughSentiment(lower) {
        if (/\b(makasih|bagus|mantap|suka|berhasil|keren|oke)\b/.test(lower)) return 'positive';
        if (/\b(error|gagal|rusak|lama|jelek|bingung|salah|masalah)\b/.test(lower)) return 'negative';
        return 'neutral';
    }

    _roughTopics(lower) {
        const topics = [];
        if (/\b(kode|code|script|js|node|file|backend|terminal|folder|project)\b/.test(lower)) topics.push('coding', 'system');
        if (/\b(cari|search|web|berita|internet|riset|latest|terbaru)\b/.test(lower)) topics.push('web');
        if (/\b(gambar|foto|voice|audio|video|screenshot|media)\b/.test(lower)) topics.push('media');
        if (/\b(jadwal|ingatkan|reminder|besok|hari ini|jam|tanggal)\b/.test(lower)) topics.push('time');
        if (/\b(aku|saya|kamu|stella|pribadi)\b/.test(lower)) topics.push('personal');
        if (/\b(cerita|puisi|desain|kreatif|ide)\b/.test(lower)) topics.push('creative');
        return topics.length ? topics : ['general'];
    }

    _intentFromPolicy(outputs, text) {
        const lower = (text || '').toLowerCase();
        if (outputs.media >= 0.62) return 'creative';
        if (outputs.schedule >= 0.62) return 'reminder';
        if (outputs.research >= 0.62) return 'search';
        if (outputs.use_tool >= 0.62) return /\b(file|folder|edit|tulis|baca)\b/.test(lower) ? 'file_op' : 'command';
        if (outputs.save_memory >= 0.62) return 'personal';
        return 'conversation';
    }

    _buildNeuralPrompt(intent, confidence, dominantMode, active) {
        const activeText = active.length ? active.slice(0, 4).join(', ') : 'respond_direct';
        return `NEURAL STATE:\n- intent=${intent} confidence=${Math.round(confidence * 100)}%\n- mode=${dominantMode}\n- active_tendencies=${activeText}\nIkuti state ini sebagai intuisi internal Stella, bukan aturan yang perlu dijelaskan ke user.`;
    }

    recordThought(text, decision, context = {}) {
        if (!this.trainingData.thought_samples) this.trainingData.thought_samples = [];
        this.trainingData.thought_samples.push({
            text: (text || '').substring(0, 240),
            intent: decision.intent,
            mode: decision.dominantMode,
            outputs: decision.outputs,
            ruleIntent: context.ruleIntent || null,
            added: Date.now()
        });
        if (this.trainingData.thought_samples.length > 1000) {
            this.trainingData.thought_samples = this.trainingData.thought_samples.slice(-1000);
        }
        this.neuralState.interactionCount = (this.neuralState.interactionCount || 0) + 1;
        this.neuralState.lastUpdate = new Date().toISOString();
        this._saveJSON(TRAINING_FILE, this.trainingData);
        this._saveJSON(NEURAL_STATE_FILE, this.neuralState);
    }

    learnFromOutcome(text, context = {}, positive = true) {
        const last = [...(this.trainingData.thought_samples || [])].reverse()
            .find(sample => !text || sample.text === (text || '').substring(0, 240));
        const outputs = last && last.outputs ? last.outputs : {};
        const input = this._buildThoughtInput(text || (last && last.text) || '', context, new Array(INTENT_LABELS.length).fill(0));
        const rate = this.neuralState.learningRate || 0.035;

        THOUGHT_OUTPUTS.forEach((label, outIdx) => {
            const activated = Number(outputs[label] || 0);
            const direction = positive ? activated : -activated;
            for (let i = 0; i < input.length; i++) {
                this.neuralState.weights[outIdx][i] += rate * direction * input[i];
            }
            this.neuralState.bias[outIdx] += rate * direction * 0.2;
        });

        this.neuralState.lastUpdate = new Date().toISOString();
        this._saveJSON(NEURAL_STATE_FILE, this.neuralState);
    }

    async trainIntentModel() {
        if (!this.tf || this.isTraining) return false;
        if (this.trainingData.intent_samples.length < 20) {
            console.log('[DeepBrain] Not enough data for training (need 20+)');
            return false;
        }

        this.isTraining = true;
        console.log(`[DeepBrain] Training intent model with ${this.trainingData.intent_samples.length} samples...`);

        try {
            const vocabSize = Math.min(this.vocabulary.size, 200);

            // Build model
            const model = this.tf.sequential();
            model.add(this.tf.layers.dense({ inputShape: [200], units: 64, activation: 'relu' }));
            model.add(this.tf.layers.dropout({ rate: 0.3 }));
            model.add(this.tf.layers.dense({ units: 32, activation: 'relu' }));
            model.add(this.tf.layers.dense({ units: INTENT_LABELS.length, activation: 'softmax' }));

            model.compile({
                optimizer: this.tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            // Prepare training data
            const xs = [];
            const ys = [];
            for (const sample of this.trainingData.intent_samples) {
                const vec = Array.from(this._textToVector(sample.text));
                xs.push(vec);
                const label = new Array(INTENT_LABELS.length).fill(0);
                label[INTENT_LABELS.indexOf(sample.intent)] = 1;
                ys.push(label);
            }

            const xTensor = this.tf.tensor2d(xs);
            const yTensor = this.tf.tensor2d(ys);

            await model.fit(xTensor, yTensor, {
                epochs: 20,
                batchSize: 16,
                shuffle: true,
                verbose: 0
            });

            xTensor.dispose();
            yTensor.dispose();

            // Replace old model
            if (this.intentModel) this.intentModel.dispose();
            this.intentModel = model;

            // Save model
            await model.save(fileSystemIO(path.join(MODELS_DIR, 'intent_model')));

            this.trainingData.pending_count = 0;
            this.trainingData.total_trained += this.trainingData.intent_samples.length;
            this.trainingData.last_train = new Date().toISOString();
            this._saveJSON(TRAINING_FILE, this.trainingData);

            console.log('[DeepBrain] Intent model trained and saved!');
            this.isTraining = false;
            return true;
        } catch (err) {
            console.error('[DeepBrain] Training error:', err.message);
            this.isTraining = false;
            return false;
        }
    }

    async trainQualityModel() {
        if (!this.tf || this.isTraining) return false;
        if (this.trainingData.quality_samples.length < 10) return false;

        this.isTraining = true;
        try {
            const model = this.tf.sequential();
            model.add(this.tf.layers.dense({ inputShape: [4], units: 16, activation: 'relu' }));
            model.add(this.tf.layers.dense({ units: 8, activation: 'relu' }));
            model.add(this.tf.layers.dense({ units: 1, activation: 'sigmoid' }));

            model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

            const xs = this.trainingData.quality_samples.map(s => s.features);
            const ys = this.trainingData.quality_samples.map(s => [s.score]);

            const xT = this.tf.tensor2d(xs);
            const yT = this.tf.tensor2d(ys);
            await model.fit(xT, yT, { epochs: 15, batchSize: 8, verbose: 0 });
            xT.dispose(); yT.dispose();

            if (this.qualityModel) this.qualityModel.dispose();
            this.qualityModel = model;
            await model.save(fileSystemIO(path.join(MODELS_DIR, 'quality_model')));

            console.log('[DeepBrain] Quality model trained!');
            this.isTraining = false;
            return true;
        } catch (err) {
            console.error('[DeepBrain] Quality training error:', err.message);
            this.isTraining = false;
            return false;
        }
    }

    // ── Model Loading ──
    async _loadModels() {
        try {
            const intentDir = path.join(MODELS_DIR, 'intent_model');
            if (fs.existsSync(path.join(intentDir, 'model.json'))) {
                this.intentModel = await this.tf.loadLayersModel(fileSystemIO(intentDir));
                console.log('[DeepBrain] Intent model loaded from disk');
            }
        } catch (e) { console.log('[DeepBrain] No saved intent model found, will train later'); }

        try {
            const qualityDir = path.join(MODELS_DIR, 'quality_model');
            if (fs.existsSync(path.join(qualityDir, 'model.json'))) {
                this.qualityModel = await this.tf.loadLayersModel(fileSystemIO(qualityDir));
                console.log('[DeepBrain] Quality model loaded from disk');
            }
        } catch (e) { console.log('[DeepBrain] No saved quality model found, will train later'); }
    }

    // ── Stats ──
    getStatsText() {
        const td = this.trainingData;
        let text = `--- DEEP BRAIN STATUS ---\n`;
        text += `TF.js Status: ${this.isReady ? 'AKTIF' : 'TIDAK AKTIF'}\n`;
        text += `Vocabulary: ${this.vocabulary.size} kata\n`;
        text += `Intent Samples: ${td.intent_samples.length}\n`;
        text += `Quality Samples: ${td.quality_samples.length}\n`;
        text += `Thought Samples: ${(td.thought_samples || []).length}\n`;
        text += `Neural Policy: ACTIVE (${this.neuralState.interactionCount || 0} ticks)\n`;
        text += `Total Trained: ${td.total_trained}\n`;
        text += `Pending Samples: ${td.pending_count}/${RETRAIN_THRESHOLD}\n`;
        text += `Intent Model: ${this.intentModel ? 'LOADED' : 'NOT LOADED'}\n`;
        text += `Quality Model: ${this.qualityModel ? 'LOADED' : 'NOT LOADED'}\n`;
        if (td.last_train) text += `Last Training: ${new Date(td.last_train).toLocaleString('id-ID')}\n`;
        return text;
    }
}

module.exports = DeepBrain;
