class ContextBuilder {
    constructor(deps = {}) {
        this.memory = deps.memory || null;
        this.knowledge = deps.knowledge || null;
        this.reasoning = deps.reasoning || null;
        this.planning = deps.planning || null;
        this.goals = deps.goals || null;
        this.curiosity = deps.curiosity || null;
        this.skills = deps.skills || null;
        this.bus = deps.eventBus || null;
        this.EVENTS = deps.EVENTS || null;
    }

    async build(message, analysis, context = {}) {
        const { activeModules, complexity } = analysis;
        const contextParts = [];

        for (const mod of activeModules) {
            const part = await this._getModuleContext(mod, message, context);
            if (part) contextParts.push(part);
        }

        if (this.bus && this.EVENTS) {
            this.bus.emit(this.EVENTS.CONTEXT_BUILT, {
                modulesUsed: activeModules,
                partsCount: contextParts.length,
                totalChars: contextParts.reduce((s, p) => s + p.length, 0)
            });
        }

        return contextParts.join('\n').trim();
    }

    async _getModuleContext(module, message, context) {
        switch (module) {
            case 'memory': {
                if (!this.memory) return null;
                try {
                    const mems = await this.memory.retrieve(message, { maxResults: 3 });
                    if (!mems || mems.length === 0) return null;
                    return 'RELEVANT MEMORIES:\n' + mems.slice(0, 3).map(m =>
                        `- [${m.tier || 'core'}] ${m.content.substring(0, 150)}`
                    ).join('\n');
                } catch { return null; }
            }

            case 'knowledge': {
                if (!this.knowledge) return null;
                try {
                    const kc = await this.knowledge.getContext(message, 4);
                    if (!kc) return null;
                    return kc;
                } catch { return null; }
            }

            case 'reasoning': {
                if (!this.reasoning) return null;
                try {
                    const result = await this.reasoning.reason(message, {
                        ...context, knowledgeBase: this.knowledge
                    });
                    if (!result || !result.strategy) return null;
                    return `REASONING (${result.strategy}): ${result.conclusion ? result.conclusion.substring(0, 200) : ''}`;
                } catch { return null; }
            }

            case 'planning': {
                if (!this.planning) return null;
                try {
                    const plan = await this.planning.plan(message, context);
                    if (!plan || !plan.subtasks || plan.subtasks.length === 0) return null;
                    const steps = plan.subtasks.map(s =>
                        `  ${s.name}: ${s.description} (conf: ${(s.confidence * 100).toFixed(0)}%, risk: ${s.risk.level})`
                    ).join('\n');
                    return `PLAN:\nGoal: ${plan.goal.substring(0, 100)}\nSteps:\n${steps}`;
                } catch { return null; }
            }

            case 'goals': {
                if (!this.goals || !context.userId) return null;
                try {
                    const gc = this.goals.getGoalsContext(context.userId);
                    if (!gc) return null;
                    return gc;
                } catch { return null; }
            }

            case 'curiosity': {
                if (!this.curiosity) return null;
                try {
                    const gap = this.curiosity.detectKnowledgeGap(message, context);
                    if (!gap || gap.length === 0) return null;
                    return 'KNOWLEDGE GAPS: ' + gap.map(g => g.gap).join(', ');
                } catch { return null; }
            }

            case 'skills': {
                if (!this.skills) return null;
                try {
                    const recs = await this.skills.recommendTools(message);
                    if (!recs || recs.length === 0) return null;
                    return 'RECOMMENDED TOOLS: ' + recs.slice(0, 3).map(r => r.skill).join(', ');
                } catch { return null; }
            }

            default:
                return null;
        }
    }
}

module.exports = ContextBuilder;
