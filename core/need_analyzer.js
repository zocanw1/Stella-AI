const IntentClassifier = require('./intent_classifier');

class NeedAnalyzer {
    constructor() {
        this.classifier = new IntentClassifier();
        this.classifierReady = false;
        this._initClassifier();
    }

    async _initClassifier() {
        try {
            await this.classifier.initialize();
            await this.classifier.seedDefaultData();
            const result = await this.classifier.train(8, 50);
            this.classifierReady = result && result.trained;
        } catch {}
    }

    async analyze(message, context = {}) {
        const text = message.toLowerCase().trim();
        const wordCount = text.split(/\s+/).length;

        const hasCode = /```|`[^`]+`|function|const |let |var |import |require|=>/.test(text);
        const hasComplex = /\b(how|why|what if|compare|analyze|design|architect|create|build|deploy|debug|refactor|implement|architecture)\b/.test(text);

        let complexity = 'simple';
        if (wordCount > 25 || hasCode) complexity = 'high';
        else if (wordCount > 6 || hasComplex) complexity = 'medium';

        // Use ML classifier if ready, fallback to rule-based
        let intent = 'conversation';
        let confidence = 0.5;
        let execute = false;
        let needsConfirmation = false;

        if (this.classifierReady) {
            try {
                const prediction = await this.classifier.predict(text);
                intent = prediction.intent;
                confidence = prediction.confidence;
            } catch {}
        }

        if (!this.classifierReady || confidence < 0.5) {
            const fallback = this._fallback(text, wordCount);
            intent = fallback.intent;
            confidence = fallback.confidence;
        }

        execute = confidence >= 0.80;
        needsConfirmation = confidence >= 0.40 && confidence < 0.80;

        const activeModules = this._selectModules(intent, complexity, text);
        const shouldReflect = ['coding', 'deploy', 'research', 'debug'].includes(intent) && complexity !== 'simple';
        const needsPlanning = ['deploy', 'coding', 'research', 'debug'].includes(intent) && complexity === 'high';

        return {
            complexity,
            intent,
            confidence: Math.round(confidence * 100) / 100,
            execute,
            needsConfirmation,
            classifierReady: this.classifierReady,
            activeModules,
            shouldReflect,
            needsPlanning,
            shouldResearch: intent === 'research',
            toolDependent: ['deploy', 'coding', 'debug', 'multimedia', 'voice_join', 'voice_leave'].includes(intent)
        };
    }

    _fallback(text, wordCount) {
        const hasJoin = /\bjoin\b/.test(text);
        const hasLeave = /\b(leave|keluar)\b/.test(text);
        const hasQuestionMark = text.includes('?');
        const startsWithQuestion = /^(apa|siapa|kapan|dimana|mengapa|kenapa|bagaimana|apakah|bisakah)/.test(text);
        const hasGreeting = /\b(hai|halo|hi|hey|pagi|siang|sore|malam)\b/.test(text);
        const hasQuestionWord = /\b(apa|siapa|kapan|dimana|mengapa|kenapa|bagaimana|apakah|bisakah)\b/.test(text);

        let intent = 'conversation';
        let confidence = 0.5;

        if (hasGreeting && wordCount <= 3) { intent = 'greeting'; confidence = 0.85; }
        else if (hasQuestionWord || hasQuestionMark) { intent = 'question'; confidence = Math.min(0.85, 0.35 + (hasQuestionWord ? 0.30 : 0) + (hasQuestionMark ? 0.20 : 0)); }
        else if (hasJoin && !hasQuestionWord && !hasQuestionMark && wordCount <= 4) { intent = 'voice_join'; confidence = 0.80; }
        else if (hasJoin && (hasQuestionWord || hasQuestionMark)) { intent = 'question'; confidence = 0.60; }
        else if (hasJoin) { intent = 'voice_join'; confidence = 0.35; }
        else if (hasLeave && !hasQuestionWord && !hasQuestionMark && wordCount <= 4) { intent = 'voice_leave'; confidence = 0.80; }
        else if (hasLeave) { intent = 'voice_leave'; confidence = 0.30; }
        else if (hasGreeting) { intent = 'greeting'; confidence = 0.50; }

        return { intent, confidence };
    }

    _selectModules(intent, complexity, text) {
        if (intent === 'greeting') return ['safety', 'memory'];
        if (intent === 'question') {
            const mods = ['safety', 'memory', 'knowledge'];
            if (complexity !== 'simple') mods.push('reasoning');
            return mods;
        }
        if (intent === 'conversation') {
            const mods = ['safety', 'memory'];
            if (complexity !== 'simple') mods.push('knowledge');
            return mods;
        }
        if (['coding', 'deploy'].includes(intent)) {
            const mods = ['safety', 'memory', 'knowledge', 'reasoning', 'skills'];
            if (complexity === 'high') mods.push('planning');
            return mods;
        }
        if (intent === 'research') return ['safety', 'memory', 'knowledge', 'reasoning', 'planning', 'curiosity'];
        if (intent === 'debug') return ['safety', 'memory', 'knowledge', 'reasoning', 'skills'];
        if (['multimedia', 'voice_join', 'voice_leave'].includes(intent)) return ['safety', 'memory', 'skills', 'workflow'];
        return ['safety', 'memory', 'knowledge'];
    }

    getStats() {
        return {
            classifierReady: this.classifierReady,
            classifierStats: this.classifierReady ? this.classifier.getStats() : null
        };
    }
}

module.exports = NeedAnalyzer;
