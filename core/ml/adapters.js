const INTENTS = ['voice_join', 'voice_leave', 'greeting', 'question', 'conversation'];

function createIntentClassifierAdapter(intentClassifier) {
    return {
        encode(text) {
            if (!text) return new Array(11).fill(0);
            const lower = text.toLowerCase().trim();
            const words = lower.split(/\s+/);
            const features = [
                words.length / 20,
                lower.includes('join') ? 1 : 0,
                lower.includes('leave') || lower.includes('keluar') ? 1 : 0,
                lower.includes('halo') || lower.includes('hai') || lower.includes('hi') || lower.includes('pagi') ? 1 : 0,
                lower.includes('?') || /\b(apa|kenapa|bagaimana|gimana|kapan|siapa|dimana|apakah|bisakah)\b/.test(lower) ? 1 : 0,
                lower.includes('stella') || lower.includes('@stella') ? 1 : 0,
                lower.includes('voice') || lower.includes('vc') ? 1 : 0,
                lower.includes('dong') || lower.includes('ya') || lower.includes('aja') ? 1 : 0,
                lower.includes('channel') ? 1 : 0,
                /\b(pernah|sulit|organisasi|group)\b/.test(lower) ? 1 : 0,
                Math.min(1, lower.length / 100)
            ];
            return features;
        },

        createModel(inputShape, numClasses, tf) {
            const model = tf.sequential();
            model.add(tf.layers.dense({ inputShape: [inputShape], units: 16, activation: 'relu' }));
            model.add(tf.layers.dropout({ rate: 0.3 }));
            model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
            model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            return model;
        },

        async saveModel(model, dir) {
            const fs = require('fs');
            const path = require('path');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            await model.save({
                save: async (artifacts) => {
                    fs.writeFileSync(path.join(dir, 'model.json'), JSON.stringify({
                        modelTopology: artifacts.modelTopology,
                        weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
                    }));
                    if (artifacts.weightData) {
                        fs.writeFileSync(path.join(dir, 'weights.bin'), Buffer.from(artifacts.weightData));
                    }
                    return { modelArtifactsInfo: { dateSaved: new Date() } };
                }
            });
        }
    };
}

const DEEP_INTENTS = ['command', 'question', 'file_op', 'search', 'greeting', 'reminder', 'creative', 'conversation', 'personal'];

function createDeepBrainAdapter(deepBrain) {
    return {
        encode(text) {
            return Array.from(deepBrain._textToVector(text));
        },

        createModel(inputShape, numClasses, tf) {
            const model = tf.sequential();
            model.add(tf.layers.dense({ inputShape: [inputShape], units: 64, activation: 'relu' }));
            model.add(tf.layers.dropout({ rate: 0.3 }));
            model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
            model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });
            return model;
        }
    };
}

const ASSET_TYPES = ['episode', 'skill', 'rule', 'knowledge', 'discard'];

function createExperienceAdapter(experienceEngine) {
    return {
        encode(text) {
            return experienceEngine._features(text, '', '');
        },

        createModel(inputShape, numClasses, tf) {
            const model = tf.sequential();
            model.add(tf.layers.dense({ inputShape: [inputShape], units: 16, activation: 'relu' }));
            model.add(tf.layers.dropout({ rate: 0.2 }));
            model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'sparseCategoricalCrossentropy',
                metrics: ['accuracy']
            });
            return model;
        }
    };
}

function createEmbeddingAdapter(embeddingEngine) {
    return {
        encode(text) {
            return embeddingEngine._hashEmbed ? embeddingEngine._hashEmbed(text) : [];
        },

        createModel(inputShape, numClasses, tf) {
            const model = tf.sequential();
            model.add(tf.layers.dense({ inputShape: [inputShape], units: 32, activation: 'relu' }));
            model.add(tf.layers.dense({ units: inputShape, activation: 'linear' }));
            model.compile({
                optimizer: tf.train.adam(0.001),
                loss: 'meanSquaredError'
            });
            return model;
        }
    };
}

module.exports = {
    INTENTS, DEEP_INTENTS, ASSET_TYPES,
    createIntentClassifierAdapter,
    createDeepBrainAdapter,
    createExperienceAdapter,
    createEmbeddingAdapter
};
