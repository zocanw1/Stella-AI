const fs = require('fs');
const path = require('path');

const JOURNAL_FILE = path.join(__dirname, '..', 'data', 'engine', 'decisions.json');

class DecisionJournal {
    constructor(eventBus, EVENTS) {
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.state = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
        } catch {
            return { decisions: [], outcomes: [], stats: { totalDecisions: 0, totalOutcomes: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(JOURNAL_FILE))) {
            fs.mkdirSync(path.dirname(JOURNAL_FILE), { recursive: true });
        }
        fs.writeFileSync(JOURNAL_FILE, JSON.stringify(this.state, null, 2));
    }

    async recordDecision(input, toolName, reasoning, expectedBenefit = {}) {
        const entry = {
            id: 'dec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            timestamp: new Date().toISOString(),
            input: input.substring(0, 200),
            tool: toolName,
            reasoning: reasoning || 'default',
            expectedBenefit: {
                speed: expectedBenefit.speed || null,
                accuracy: expectedBenefit.accuracy || null,
                description: expectedBenefit.description || ''
            },
            outcome: null
        };

        this.state.decisions.push(entry);
        this.state.stats.totalDecisions++;
        if (this.state.decisions.length > 500) this.state.decisions = this.state.decisions.slice(-500);
        this._save();

        if (this.bus && this.EVENTS) {
            this.bus.emit(this.EVENTS.DECISION_MADE, {
                decisionId: entry.id,
                tool: toolName,
                reasoning: entry.reasoning
            });
        }

        return entry.id;
    }

    async recordOutcome(decisionId, success, durationMs = 0, actualBenefit = {}) {
        const decision = this.state.decisions.find(d => d.id === decisionId);
        if (!decision) return null;

        decision.outcome = {
            success,
            durationMs,
            timestamp: new Date().toISOString(),
            actualBenefit: {
                speed: actualBenefit.speed || null,
                accuracy: actualBenefit.accuracy || null,
                description: actualBenefit.description || ''
            }
        };

        this.state.outcomes.push({
            decisionId,
            tool: decision.tool,
            success,
            durationMs,
            timestamp: decision.outcome.timestamp
        });

        this.state.stats.totalOutcomes++;
        if (this.state.outcomes.length > 1000) this.state.outcomes = this.state.outcomes.slice(-1000);
        this._save();

        if (this.bus && this.EVENTS) {
            this.bus.emit(this.EVENTS.DECISION_OUTCOME, {
                decisionId,
                tool: decision.tool,
                success,
                durationMs
            });
        }

        return decision.outcome;
    }

    getToolSuccessRate(toolName, days = 30) {
        const cutoff = Date.now() - days * 86400000;
        const relevant = this.state.outcomes.filter(o =>
            o.tool === toolName && new Date(o.timestamp).getTime() > cutoff
        );
        if (relevant.length === 0) return { rate: null, total: 0 };
        return {
            rate: (relevant.filter(o => o.success).length / relevant.length * 100).toFixed(1) + '%',
            total: relevant.length,
            success: relevant.filter(o => o.success).length,
            failed: relevant.filter(o => !o.success).length
        };
    }

    getBestToolForTask(input = '') {
        const text = input.toLowerCase();
        const toolScores = {};

        for (const outcome of this.state.outcomes) {
            const decision = this.state.decisions.find(d => d.id === outcome.decisionId);
            if (!decision) continue;
            if (text && !decision.input.toLowerCase().includes(text)) continue;

            if (!toolScores[outcome.tool]) {
                toolScores[outcome.tool] = { total: 0, success: 0, avgDuration: 0 };
            }
            toolScores[outcome.tool].total++;
            if (outcome.success) toolScores[outcome.tool].success++;
            toolScores[outcome.tool].avgDuration += outcome.durationMs || 0;
        }

        for (const tool of Object.keys(toolScores)) {
            toolScores[tool].avgDuration = toolScores[tool].total > 0
                ? (toolScores[tool].avgDuration / toolScores[tool].total).toFixed(0)
                : 0;
        }

        return Object.entries(toolScores)
            .map(([tool, data]) => ({
                tool,
                successRate: data.total > 0 ? (data.success / data.total * 100).toFixed(1) + '%' : '0%',
                totalUses: data.total,
                avgDuration: data.avgDuration
            }))
            .sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));
    }

    getStats() {
        const all = this.state.outcomes;
        const success = all.filter(o => o.success).length;
        return {
            totalDecisions: this.state.stats.totalDecisions,
            totalOutcomes: this.state.stats.totalOutcomes,
            successRate: all.length > 0 ? (success / all.length * 100).toFixed(1) + '%' : '0%',
            uniqueTools: [...new Set(all.map(o => o.tool))].length
        };
    }
}

module.exports = DecisionJournal;
