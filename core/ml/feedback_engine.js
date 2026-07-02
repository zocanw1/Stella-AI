const fs = require('fs');
const path = require('path');

const FEEDBACK_DIR = path.join(__dirname, '..', '..', 'data', 'ml', 'feedback');
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, 'feedback_log.json');

const NEGATIVE_SIGNALS = [
    { pattern: /\b(salah|bukan|nggak benar|tidak tepat|bukan itu|bukan gitu|gak gitu)\b/i, weight: 0.9 },
    { pattern: /\b(maksudnya|maksudku|maksud saya|maksud aku|yang aku (maksud|tanya|suruh))\b/i, weight: 0.85 },
    { pattern: /\b(koreksi|ralat|benerin|perbaiki|revisi)\b/i, weight: 0.9 },
    { pattern: /\b(seharusnya|harusnya|yang benar|yang bener|yang tepat)\b/i, weight: 0.85 },
    { pattern: /\b(ulang|ulangi|coba lagi|gagal paham|nggak ngerti|gak ngerti|tidak mengerti)\b/i, weight: 0.7 },
    { pattern: /\b(gak nyambung|nggak nyambung|tidak nyambung|salah paham|miss)\b/i, weight: 0.8 },
    { pattern: /\b(kok gitu|masa sih|ah masa|serius nih|ngawur|ngasal)\b/i, weight: 0.6 },
    { pattern: /\b(jelek|goblok|bodoh|payah|nggak guna|gak guna|bego|tolol)\b/i, weight: 0.5 },
    { pattern: /^(no|enggak|nggak|gak|ndak|tidak)$/i, weight: 0.7 },
];

const POSITIVE_SIGNALS = [
    { pattern: /\b(bagus|benar|betul|tepat|mantap|keren|oke|sip|nice|good|perfect)\b/i, weight: 0.85 },
    { pattern: /\b(makasih|terima kasih|thanks|thx|tq|thank you)\b/i, weight: 0.9 },
    { pattern: /\b(berhasil|sukses|jalan|bisa|work|working)\b/i, weight: 0.8 },
    { pattern: /\b(oke deh|ok sip|siap|lanjut|next)\b/i, weight: 0.6 },
    { pattern: /\b(wah iya|oh iya|oh gitu|paham|ngerti|mengerti)\b/i, weight: 0.6 },
    { pattern: /\b(tolong|bantu|lanjutin|lanjutkan)\b/i, weight: 0.5 },
    { pattern: /^(ya|iya|yes|yoi|yup|betul)$/i, weight: 0.7 },
];

class FeedbackEngine {
    constructor({ groundTruth, deepBrain, experience, intentClassifier, kernel } = {}) {
        this.groundTruth = groundTruth;
        this.deepBrain = deepBrain;
        this.experience = experience;
        this.intentClassifier = intentClassifier;
        this.kernel = kernel;
        this.log = this._load();
        this.lastContext = {};
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        } catch {
            return { entries: [], stats: { total: 0, corrections: 0, confirmations: 0, implicit: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(this.log, null, 2));
    }

    trackExchange(userId, question, response, predictedIntent = null) {
        this.lastContext[userId] = {
            question,
            response,
            predictedIntent,
            timestamp: Date.now(),
            messageCount: (this.lastContext[userId]?.messageCount || 0) + 1
        };
    }

    processUserMessage(userId, message, context = {}) {
        const text = (message || '').toLowerCase().trim();
        if (!text) return null;

        const prev = this.lastContext[userId];
        const ctx = { ...context, lastResponse: prev?.response, lastQuestion: prev?.question, lastIntent: prev?.predictedIntent };

        let result = this._detectExplicitCorrection(text, ctx);
        if (result) { this._log(userId, 'correction', result); return result; }

        result = this._detectExplicitConfirmation(text, ctx);
        if (result) { this._log(userId, 'confirmation', result); return result; }

        result = this._detectImplicit(text, userId, ctx);
        if (result) { this._log(userId, 'implicit', result); return result; }

        return null;
    }

    _detectExplicitCorrection(text, context) {
        let bestWeight = 0;
        for (const { pattern, weight } of NEGATIVE_SIGNALS) {
            if (pattern.test(text)) bestWeight = Math.max(bestWeight, weight);
        }
        if (bestWeight < 0.5) return null;

        return {
            type: 'correction',
            signal: 'negative',
            weight: bestWeight,
            question: (context.lastQuestion || text).substring(0, 300),
            predicted: context.lastIntent || null,
            previousResponse: (context.lastResponse || '').substring(0, 200),
            correctionText: text.substring(0, 200),
            explicit: bestWeight >= 0.7
        };
    }

    _detectExplicitConfirmation(text, context) {
        let bestWeight = 0;
        for (const { pattern, weight } of POSITIVE_SIGNALS) {
            if (pattern.test(text)) bestWeight = Math.max(bestWeight, weight);
        }
        if (bestWeight < 0.5) return null;

        return {
            type: 'confirmation',
            signal: 'positive',
            weight: bestWeight,
            question: (context.lastQuestion || text).substring(0, 300),
            predicted: context.lastIntent || null,
            previousResponse: (context.lastResponse || '').substring(0, 200),
            explicit: bestWeight >= 0.7
        };
    }

    _detectImplicit(text, userId, context) {
        const prev = this.lastContext[userId];
        if (!prev) return null;

        const prevQ = (prev.question || '').toLowerCase().trim();
        const currQ = text.toLowerCase().trim();
        const wordOverlap = this._wordOverlap(prevQ, currQ);

        if (wordOverlap > 0.6 && currQ.length > 10) {
            return {
                type: 'implicit',
                signal: 'negative',
                reason: 'user_reasked',
                weight: Math.min(0.5, wordOverlap - 0.3),
                question: prevQ.substring(0, 300),
                predicted: prev.predictedIntent || null,
                userReply: currQ.substring(0, 200),
                previousResponse: (prev.response || '').substring(0, 200)
            };
        }

        const clarificationMarkers = /\b(maksudnya|lebih tepatnya|lebih detail|jelasin|rinci|detailnya|contohnya|spesifik)\b/i;
        if (clarificationMarkers.test(currQ) && wordOverlap > 0.3) {
            return {
                type: 'implicit',
                signal: 'negative',
                reason: 'user_clarifying',
                weight: 0.4,
                question: prevQ.substring(0, 300),
                predicted: prev.predictedIntent || null,
                userReply: currQ.substring(0, 200),
                previousResponse: (prev.response || '').substring(0, 200)
            };
        }

        const followUpMarkers = /\b(lalu|terus|abis itu|kemudian|selanjutnya|lanjut|next step|trus)\b/i;
        if (followUpMarkers.test(currQ) && prev.messageCount > 0) {
            return {
                type: 'implicit',
                signal: 'positive',
                reason: 'user_following_up',
                weight: 0.4,
                question: prevQ.substring(0, 300),
                predicted: prev.predictedIntent || null,
                previousResponse: (prev.response || '').substring(0, 200)
            };
        }

        return null;
    }

    _wordOverlap(a, b) {
        const wordsA = new Set((a || '').split(/\s+/).filter(w => w.length > 2));
        const wordsB = (b || '').split(/\s+/).filter(w => w.length > 2);
        if (wordsA.size === 0 || wordsB.length === 0) return 0;
        const overlap = wordsB.filter(w => wordsA.has(w)).length;
        return overlap / Math.max(wordsA.size, 1);
    }

    learnFromOutcome(userId, question, predictedIntent, actualIntent) {
        if (!actualIntent || actualIntent === predictedIntent) return null;

        this.log.stats.corrections++;
        this._save();

        if (this.groundTruth) {
            const sample = this.groundTruth.addSample(question, actualIntent, 'user_correction', {
                wrongLabel: predictedIntent,
                correctedAt: new Date().toISOString()
            });
            if (sample && this.deepBrain && typeof this.deepBrain.addVerifiedSample === 'function') {
                this.deepBrain.addVerifiedSample(question, actualIntent, 'user_correction', { wrongLabel: predictedIntent });
            }
            if (sample && this.intentClassifier && typeof this.intentClassifier.addExample === 'function') {
                try { this.intentClassifier.addExample(question, actualIntent); } catch {}
            }
            return sample;
        }
        return null;
    }

    rateLastResponse(userId, rating) {
        const prev = this.lastContext[userId];
        if (!prev) return null;

        if (rating >= 4) {
            this.log.stats.confirmations++;
            this._save();
            if (this.groundTruth && prev.predictedIntent) {
                return this.groundTruth.addSample(prev.question, prev.predictedIntent, 'feedback_positive', { rating });
            }
        } else if (rating <= 2) {
            this.log.stats.corrections++;
            this._save();
        }
        return null;
    }

    recordCorrection(question, wrongLabel, correctLabel, source = 'user_correction') {
        return this.learnFromOutcome('system', question, wrongLabel, correctLabel);
    }

    recordToolOutcome(task, toolName, success, metadata = {}) {
        if (!this.groundTruth) return null;

        const intent = this._inferIntentFromTask(task, success);
        if (!intent) return null;

        const source = success ? 'tool_outcome' : 'tool_outcome_failure';
        const sample = this.groundTruth.addSample(task, intent, source, {
            toolName, success, ...metadata
        });

        if (sample && this.experience && typeof this.experience.addVerifiedTrainingSample === 'function') {
            const features = this._extractToolFeatures(task, success, toolName);
            const labelIdx = this._assetTypeIndex(intent);
            if (features && labelIdx >= 0) {
                this.experience.addVerifiedTrainingSample(features, labelIdx, source);
            }
        }

        return sample;
    }

    _inferIntentFromTask(task, success) {
        const text = (task || '').toLowerCase();
        if (/\b(deploy|publish)\b/.test(text)) return success ? 'deploy' : 'debug';
        if (/\b(debug|error|bug|fix)\b/.test(text)) return 'debug';
        if (/\b(buka|jalankan|run|exec)\b/.test(text)) return 'coding';
        if (/\b(cari|search|riset|research)\b/.test(text)) return 'research';
        if (/\b(gambar|image|foto)\b/.test(text)) return 'multimedia';
        if (/\b(jadwal|reminder|ingatkan)\b/.test(text)) return 'conversation';
        return null;
    }

    _extractToolFeatures(task, success, toolName) {
        const text = (task || '').toLowerCase();
        const isError = success ? 0 : 1;
        const isSuccess = success ? 1 : 0;
        const hasTool = toolName ? 1 : 0;
        const hasCode = /(`{3}|function|class|const|import)/.test(text) ? 1 : 0;
        const isRepeatable = /\b(every|each|always|routine)\b/.test(text) ? 1 : 0;
        const hasKnowledge = /\b(fact|tahu|know|cara)\b/.test(text) ? 1 : 0;
        const taskLen = Math.min(1, (task.length / 500));
        const resultLen = success ? 0.3 : 0.1;
        return [isError, isSuccess, hasTool, hasCode, isRepeatable, hasKnowledge, taskLen, resultLen];
    }

    _assetTypeIndex(intent) {
        const map = { deploy: 1, debug: 1, coding: 1, research: 2, multimedia: 1 };
        return map[intent] !== undefined ? map[intent] : 0;
    }

    confirmSample(question, label) {
        if (!this.groundTruth) return null;
        return this.groundTruth.addSample(question, label, 'feedback_positive', {
            confirmedAt: new Date().toISOString()
        });
    }

    rejectSample(question, label, reason = '') {
        if (!this.groundTruth) return null;
        return this.groundTruth.addSample(question, label, 'feedback_negative', {
            reason, rejectedAt: new Date().toISOString()
        });
    }

    getCorrectionStats() {
        const stats = this.groundTruth ? this.groundTruth.getStats() : {};
        return {
            ...this.log.stats,
            groundTruth: stats
        };
    }

    getRecentFeedback(limit = 50) {
        return this.log.entries.slice(-limit);
    }

    _log(userId, category, data) {
        this.log.entries.push({
            userId, category, data, timestamp: new Date().toISOString()
        });
        this.log.stats.total++;
        if (this.log.entries.length > 1000) this.log.entries = this.log.entries.slice(-1000);
        this._save();
    }

    shouldRetrain(modelName, options = {}) {
        const stats = this.groundTruth ? this.groundTruth.getStats() : {};
        const newCount = stats.totalSamples || 0;
        const minRequired = options.minNewSamples || 20;
        return newCount >= minRequired;
    }
}

module.exports = FeedbackEngine;
