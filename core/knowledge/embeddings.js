const fs = require('fs');
const path = require('path');

const EMBEDDING_DIM = 64;
const MODEL_DIR = path.join(__dirname, '..', '..', 'data', 'knowledge', 'models');
const VOCAB_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'vocab.json');

class EmbeddingEngine {
    constructor() {
        this.tf = null;
        this.model = null;
        this.isReady = false;
        this.vocab = this._loadVocab();
        this._initTF();
    }

    _loadVocab() {
        try {
            return JSON.parse(fs.readFileSync(VOCAB_FILE, 'utf-8'));
        } catch {
            return { words: {}, size: 0 };
        }
    }

    _saveVocab() {
        if (!fs.existsSync(path.dirname(VOCAB_FILE))) {
            fs.mkdirSync(path.dirname(VOCAB_FILE), { recursive: true });
        }
        fs.writeFileSync(VOCAB_FILE, JSON.stringify(this.vocab, null, 2));
    }

    async _initTF() {
        try {
            this.tf = require('@tensorflow/tfjs');
            await this._loadModel();
            this.isReady = true;
        } catch (err) {
            console.log('[Embeddings] TF.js unavailable, fallback to hash embeddings');
            this.isReady = false;
        }
    }

    async _loadModel() {
        try {
            const mp = path.join(MODEL_DIR, 'embedder', 'model.json');
            if (fs.existsSync(mp)) {
                this.model = await this.tf.loadLayersModel(this._ioHandler(path.join(MODEL_DIR, 'embedder')));
            }
        } catch {}
    }

    _ioHandler(dirPath) {
        return {
            save: async (artifacts) => {
                if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
                fs.writeFileSync(path.join(dirPath, 'model.json'), JSON.stringify({
                    modelTopology: artifacts.modelTopology,
                    format: artifacts.format,
                    weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
                }));
                if (artifacts.weightData) {
                    fs.writeFileSync(path.join(dirPath, 'weights.bin'), Buffer.from(artifacts.weightData));
                }
                return { modelArtifactsInfo: { dateSaved: new Date() } };
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

    _tokenize(text) {
        if (!text) return [];
        return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    }

    _hashToIndex(token, dim) {
        let hash = 0;
        for (let i = 0; i < token.length; i++) {
            hash = ((hash << 5) - hash) + token.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) % dim;
    }

    _hashEmbedding(text, dim = EMBEDDING_DIM) {
        const tokens = this._tokenize(text);
        const vec = new Float32Array(dim).fill(0);
        for (const token of tokens) {
            vec[this._hashToIndex(token, dim)] += 1;
        }
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
        for (let i = 0; i < dim; i++) vec[i] /= norm;
        return Array.from(vec);
    }

    async embed(text) {
        if (this.isReady && this.model) {
            try {
                const vector = this._hashEmbedding(text);
                const input = this.tf.tensor2d([vector]);
                const output = this.model.predict(input);
                const result = Array.from(await output.data());
                input.dispose();
                output.dispose();
                return result;
            } catch {
                return this._hashEmbedding(text);
            }
        }
        return this._hashEmbedding(text);
    }

    cosineSimilarity(a, b) {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom === 0 ? 0 : dot / denom;
    }

    async findSimilar(target, candidates, opts = {}) {
        const topK = opts.topK || 5;
        const threshold = opts.threshold || 0.4;
        const targetVec = await this.embed(target);

        const scored = [];
        for (const candidate of candidates) {
            const text = typeof candidate === 'string' ? candidate : candidate.text || candidate.content || '';
            const vec = candidate._embedding || await this.embed(text);
            const sim = this.cosineSimilarity(targetVec, vec);
            if (sim >= threshold) {
                scored.push({ item: candidate, score: sim });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }

    async trainModel(sentences) {
        if (!this.tf || sentences.length < 5) return false;
        try {
            const model = this.tf.sequential();
            model.add(this.tf.layers.dense({
                inputShape: [EMBEDDING_DIM],
                units: 32,
                activation: 'relu'
            }));
            model.add(this.tf.layers.dense({
                units: EMBEDDING_DIM,
                activation: 'linear'
            }));
            model.compile({
                optimizer: this.tf.train.adam(0.001),
                loss: 'meanSquaredError'
            });

            const xs = sentences.map(s => this._hashEmbedding(s));
            const xT = this.tf.tensor2d(xs);
            await model.fit(xT, xT, { epochs: 5, batchSize: 8, verbose: 0 });
            xT.dispose();

            if (this.model) this.model.dispose();
            this.model = model;
            const saveDir = path.join(MODEL_DIR, 'embedder');
            await model.save(this._ioHandler(saveDir));
            return true;
        } catch (err) {
            console.log('[Embeddings] Train error:', err.message);
            return false;
        }
    }

    updateVocab(text) {
        const tokens = this._tokenize(text);
        let updated = false;
        for (const token of tokens) {
            if (!this.vocab.words[token]) {
                this.vocab.words[token] = this.vocab.size;
                this.vocab.size++;
                updated = true;
            }
        }
        if (updated) this._saveVocab();
    }
}

module.exports = EmbeddingEngine;
