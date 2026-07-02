const DecisionJournal = require('../decision_journal');

class ExecutiveBrain {
    constructor(deps = {}) {
        this.bus = deps.eventBus;
        this.EVENTS = deps.EVENTS;

        this.memory = deps.memory || null;
        this.knowledge = deps.knowledge || null;
        this.reasoning = deps.reasoning || null;
        this.planning = deps.planning || null;
        this.reflection = deps.reflection || null;
        this.goals = deps.goals || null;
        this.curiosity = deps.curiosity || null;
        this.experience = deps.experience || null;
        this.skills = deps.skills || null;
        this.workflow = deps.workflow || null;
        this.safety = deps.safety || null;
        this.deepBrain = deps.deepBrain || null;

        this.journal = new DecisionJournal(this.bus, this.EVENTS);
        this.isReady = false;
        this.modules = {};
        this._registerModules();
    }

    _registerModules() {
        const moduleList = {
            memory: this.memory, knowledge: this.knowledge,
            reasoning: this.reasoning, planning: this.planning,
            reflection: this.reflection, goals: this.goals,
            curiosity: this.curiosity, experience: this.experience,
            skills: this.skills, workflow: this.workflow,
            safety: this.safety, deepBrain: this.deepBrain
        };

        for (const [name, mod] of Object.entries(moduleList)) {
            if (mod) this.modules[name] = mod;
        }

        this.isReady = Object.keys(this.modules).length >= 4;
    }

    async dispatch(message, activeModules = [], context = {}) {
        const results = {};

        for (const moduleName of activeModules) {
            const mod = this.modules[moduleName];
            if (!mod) continue;

            const action = this._getAction(moduleName);
            if (!mod[action] && typeof mod[action] !== 'function') continue;

            if (this.bus && this.EVENTS) {
                this.bus.emit(this.EVENTS.MODULE_ACTIVATED, { module: moduleName, action });
            }

            try {
                let result;
                switch (moduleName) {
                    case 'safety':
                        result = await mod.validate(message, context);
                        if (result && !result.allowed) {
                            results.safety = result;
                            return { blocked: true, reason: result.reason, results };
                        }
                        break;
                    case 'memory':
                        result = await mod.retrieve(message, { maxResults: 3 });
                        break;
                    case 'knowledge':
                        result = await mod.query(message, { maxResults: 3 });
                        break;
                    case 'reasoning':
                        result = await mod.reason(message, { ...context, knowledgeBase: this.knowledge });
                        break;
                    case 'planning':
                        result = await mod.plan(message, { ...context, availableSubsystems: this.modules });
                        break;
                    case 'skills':
                        result = await mod.recommendTools(message);
                        break;
                    case 'goals':
                        result = mod.detectGoal(message, context.userId);
                        break;
                    case 'curiosity':
                        result = mod.detectKnowledgeGap(message, context);
                        break;
                    case 'workflow':
                        result = await mod.execute(message, context);
                        break;
                    default:
                        result = await mod[action](message, context);
                }

                results[moduleName] = result;
            } catch (err) {
                results[moduleName] = { error: err.message };
                if (this.bus && this.EVENTS) {
                    this.bus.emit(this.EVENTS.ERROR, { module: moduleName, error: err.message });
                }
            }
        }

        const contextEnriched = {
            safety: results.safety,
            goalContext: results.goals && context.userId ? this.goals.getGoalsContext(context.userId) : null,
            memoryContext: results.memory || [],
            knowledgeContext: results.knowledge || null,
            reasoningInfo: results.reasoning ? this._formatReasoning(results.reasoning) : null,
            planInfo: results.planning || null,
            toolRecommendations: results.skills || [],
            dispatchTime: new Date().toISOString(),
            activeModules
        };

        return contextEnriched;
    }

    async recordDecision(input, toolName, reasoning, expectedBenefit) {
        return this.journal.recordDecision(input, toolName, reasoning, expectedBenefit);
    }

    async recordDecisionOutcome(decisionId, success, durationMs) {
        return this.journal.recordOutcome(decisionId, success, durationMs);
    }

    getToolSuccessRate(toolName, days) {
        return this.journal.getToolSuccessRate(toolName, days);
    }

    getBestToolForTask(input) {
        return this.journal.getBestToolForTask(input);
    }

    _getAction(moduleName) {
        const actions = {
            safety: 'validate',
            memory: 'retrieve',
            knowledge: 'query',
            reasoning: 'reason',
            planning: 'plan',
            reflection: 'reflect',
            goals: 'detectGoal',
            curiosity: 'detectKnowledgeGap',
            experience: 'record',
            skills: 'recommendTools',
            workflow: 'execute',
            deepBrain: 'predict'
        };
        return actions[moduleName] || moduleName;
    }

    _formatReasoning(reasoning) {
        if (!reasoning) return null;
        const strategy = reasoning.strategy || 'unknown';
        const conclusion = reasoning.conclusion || reasoning.analysis || '';
        return `REASONING (${strategy}): ${typeof conclusion === 'string' ? conclusion.substring(0, 200) : JSON.stringify(conclusion).substring(0, 200)}`;
    }

    getReadyModules() {
        return Object.keys(this.modules);
    }

    getStats() {
        const stats = { modules: Object.keys(this.modules).length, ready: this.isReady };
        for (const [name, mod] of Object.entries(this.modules)) {
            if (typeof mod.getStats === 'function') stats[name] = mod.getStats();
        }
        stats.journal = this.journal.getStats();
        return stats;
    }
}

module.exports = ExecutiveBrain;
