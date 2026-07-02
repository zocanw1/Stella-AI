const fs = require('fs');
const path = require('path');

const STRATEGY_FILE = path.join(__dirname, '..', '..', 'data', 'engine', 'reasoning_strategies.json');

const STRATEGIES = {
    DEDUCTIVE:       { name: 'deductive',       description: 'Rule-based deduction from known facts',       complexity: 'low' },
    INDUCTIVE:       { name: 'inductive',        description: 'Generalize patterns from specific examples',  complexity: 'high' },
    ABDUCTIVE:       { name: 'abductive',        description: 'Best explanation for observed data',           complexity: 'high' },
    ANALOGICAL:      { name: 'analogical',       description: 'Compare with similar past situations',         complexity: 'medium' },
    CAUSAL:          { name: 'causal',           description: 'Cause-and-effect chain analysis',              complexity: 'high' },
    DECOMPOSITION:   { name: 'decomposition',    description: 'Break problem into sub-problems',              complexity: 'medium' },
    CONSTRAINT_BASED:{ name: 'constraint_based', description: 'Solve within given constraints',               complexity: 'medium' },
    HEURISTIC:       { name: 'heuristic',        description: 'Apply experience-based rules of thumb',        complexity: 'low' },
    COUNTERFACTUAL:  { name: 'counterfactual',   description: 'What-if analysis of alternatives',             complexity: 'very_high' },
    MEANS_END:       { name: 'means_end',        description: 'Reduce gap between current state and goal',    complexity: 'medium' }
};

class ReasoningEngine {
    constructor(deepBrain, knowledgeBase) {
        this.deepBrain = deepBrain;
        this.knowledge = knowledgeBase;
        this.strategyHistory = this._loadHistory();
    }

    _loadHistory() {
        try {
            return JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf-8'));
        } catch {
            return { history: [], strategySuccess: {}, totalReasoning: 0 };
        }
    }

    _saveHistory() {
        if (!fs.existsSync(path.dirname(STRATEGY_FILE))) {
            fs.mkdirSync(path.dirname(STRATEGY_FILE), { recursive: true });
        }
        fs.writeFileSync(STRATEGY_FILE, JSON.stringify(this.strategyHistory, null, 2));
    }

    _extractFeatures(task, context) {
        const text = (task + ' ' + JSON.stringify(context)).toLowerCase();
        const complexity = text.length > 500 ? 1 : text.length > 200 ? 0.6 : 0.3;
        const hasCompare = /\b(bandingkan|compare|vs|versus|lebih baik|difference)\b/.test(text) ? 1 : 0;
        const hasCause = /\b(kenapa|mengapa|why|cause|karena|sebab|akibat)\b/.test(text) ? 1 : 0;
        const hasPlan = /\b(rencana|plan|langkah|steps|cara|how)\b/.test(text) ? 1 : 0;
        const hasConstraint = /\b(tapi|but|except|kecuali|kondisi|if|kalau|asalkan)\b/.test(text) ? 1 : 0;
        const hasError = /\b(error|gagal|fail|bug|salah|masalah|problem)\b/.test(text) ? 1 : 0;
        const hasPast = /\b(dulu|sebelumnya|kemarin|sebelum|ever|before|past)\b/.test(text) ? 1 : 0;
        return [complexity, hasCompare, hasCause, hasPlan, hasConstraint, hasError, hasPast];
    }

    async selectStrategy(task, context = {}) {
        const features = this._extractFeatures(task, context);
        return this._fallbackSelect(features);
    }

    _fallbackSelect(features) {
        const [complexity, hasCompare, hasCause, hasPlan, hasConstraint, hasError, hasPast] = features;

        let selected = 'HEURISTIC';
        let confidence = 0.6;

        if (hasError && hasCause) { selected = 'CAUSAL'; confidence = 0.8; }
        else if (hasCompare) { selected = 'ANALOGICAL'; confidence = 0.75; }
        else if (hasPlan && complexity > 0.5) { selected = 'DECOMPOSITION'; confidence = 0.7; }
        else if (hasConstraint) { selected = 'CONSTRAINT_BASED'; confidence = 0.7; }
        else if (hasPast && hasCause) { selected = 'COUNTERFACTUAL'; confidence = 0.65; }
        else if (complexity > 0.7) { selected = 'DECOMPOSITION'; confidence = 0.6; }
        else if (hasPast) { selected = 'INDUCTIVE'; confidence = 0.6; }

        return {
            strategy: STRATEGIES[selected],
            confidence,
            allScores: {},
            features
        };
    }

    async reason(task, context = {}) {
        const selection = await this.selectStrategy(task, context);
        const knowledge = context.knowledgeBase || this.knowledge;
        let knowledgeContext = null;
        if (knowledge && knowledge.getContext) {
            knowledgeContext = await knowledge.getContext(task, 3);
        }

        const reasoningTrace = {
            id: 'rsn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            task,
            strategy: selection.strategy,
            confidence: selection.confidence,
            timestamp: new Date().toISOString(),
            premise: knowledgeContext || 'No knowledge context',
            steps: [],
            conclusion: null
        };

        reasoningTrace.steps.push({
            step: 1,
            action: `Applied ${selection.strategy.name} reasoning`,
            detail: this._getStrategyPrompt(selection.strategy.name, task, knowledgeContext),
            confidence: selection.confidence
        });

        this.strategyHistory.totalReasoning++;
        const stratName = selection.strategy.name;
        if (!this.strategyHistory.strategySuccess[stratName]) {
            this.strategyHistory.strategySuccess[stratName] = { used: 0, success: 0 };
        }
        this.strategyHistory.strategySuccess[stratName].used++;
        this.strategyHistory.history.push({
            task: task.substring(0, 100),
            strategy: stratName,
            confidence: selection.confidence,
            timestamp: reasoningTrace.timestamp,
            id: reasoningTrace.id
        });
        if (this.strategyHistory.history.length > 200) {
            this.strategyHistory.history = this.strategyHistory.history.slice(-200);
        }
        this._saveHistory();

        return {
            trace: reasoningTrace,
            strategy: selection.strategy,
            confidence: selection.confidence,
            promptInfo: `REASONING STRATEGY: ${selection.strategy.name}\nConfidence: ${(selection.confidence * 100).toFixed(0)}%\nDescription: ${selection.strategy.description}`
        };
    }

    _getStrategyPrompt(strategyName, task, knowledgeContext) {
        const prompts = {
            deductive: `Given these known facts:\n${knowledgeContext || 'No specific facts'}\nApply logical deduction to: ${task}`,
            inductive: `Based on these examples:\n${knowledgeContext || 'No specific examples'}\nGeneralize a pattern for: ${task}`,
            abductive: `Given these observations:\n${knowledgeContext || 'No observations'}\nFind the best explanation for: ${task}`,
            analogical: `Recall similar situations:\n${knowledgeContext || 'No similar situations'}\nCompare with: ${task}`,
            causal: `Trace cause and effect:\n${knowledgeContext || 'No causal context'}\nAnalyze root causes of: ${task}`,
            decomposition: `Break down the problem:\n${knowledgeContext || 'No decomposition context'}\nSub-problems of: ${task}`,
            constraint_based: `Solve within constraints:\n${knowledgeContext || 'No constraints defined'}\nConstraints for: ${task}`,
            heuristic: `Apply experience-based rules for: ${task}`,
            counterfactual: `What-if analysis:\n${knowledgeContext || 'No alternative context'}\nAlternatives to: ${task}`,
            means_end: `Reduce gap between current state and goal for: ${task}`
        };
        return prompts[strategyName] || `Reason about: ${task}`;
    }

    recordOutcome(reasoningId, success) {
        const entry = this.strategyHistory.history.find(h => h.id === reasoningId);
        if (entry) {
            const stats = this.strategyHistory.strategySuccess[entry.strategy];
            if (stats) {
                if (success) stats.success++;
                this._saveHistory();
            }
        }
    }

    getBestStrategyFor(task) {
        const features = this._extractFeatures(task, {});
        return this._fallbackSelect(features);
    }

    getStats() {
        const rates = {};
        for (const [name, stats] of Object.entries(this.strategyHistory.strategySuccess)) {
            rates[name] = stats.used > 0 ? (stats.success / stats.used).toFixed(2) : 0;
        }
        return {
            totalReasoning: this.strategyHistory.totalReasoning,
            strategySuccessRates: rates,
            historySize: this.strategyHistory.history.length
        };
    }
}

module.exports = ReasoningEngine;
