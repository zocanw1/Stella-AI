const NeedAnalyzer = require('./need_analyzer');
const ContextBuilder = require('./context_builder');

class ApplicationKernel {
    constructor(deps = {}) {
        this.bus = deps.eventBus;
        this.EVENTS = deps.EVENTS;

        this.needAnalyzer = new NeedAnalyzer();
        this.contextBuilder = new ContextBuilder({
            memory: deps.memory,
            knowledge: deps.knowledge,
            reasoning: deps.reasoning,
            planning: deps.planning,
            goals: deps.goals,
            curiosity: deps.curiosity,
            skills: deps.skills,
            eventBus: deps.eventBus,
            EVENTS: deps.EVENTS
        });

        this.executive = deps.executiveBrain;
        this.reflection = deps.reflection;
        this.experience = deps.experience;
        this.learning = deps.learningEngine;
        this.scheduler = deps.scheduler;
        this.deepBrain = deps.deepBrain;
        this.evolution = deps.evolutionSystem;
        this.feedback = deps.feedbackEngine || null;

        this.modules = deps;
    }

    async processMessage(userId, message, extraContext = {}) {
        // 1. Need Analysis
        const analysis = await this.needAnalyzer.analyze(message, extraContext);

        if (this.feedback) {
            this.feedback.trackExchange(userId, message, null, analysis.intent);
        }
        if (this.bus && this.EVENTS) {
            this.bus.emit(this.EVENTS.NEED_ANALYZED, {
                userId,
                message: message.substring(0, 100),
                complexity: analysis.complexity,
                intent: analysis.intent,
                modules: analysis.activeModules
            });
        }

        // 2. Mark scheduler active
        if (this.scheduler) this.scheduler.markActive();

        // 3. Build minimal context (only active modules)
        const contextText = await this.contextBuilder.build(message, analysis, {
            userId,
            ...extraContext
        });

        // 4. Executive Dispatch (only active modules)
        const executiveContext = await this.executive.dispatch(
            message,
            analysis.activeModules,
            { userId, ...extraContext }
        );

        if (executiveContext.blocked) {
            return {
                blocked: true,
                reason: executiveContext.reason,
                analysis,
                context: { text: contextText, ...executiveContext }
            };
        }

        // 5. Return everything needed for LLM prompt building
        return {
            analysis,
            context: {
                text: contextText,
                ...executiveContext
            },
            needsPlanning: analysis.needsPlanning,
            shouldReflect: analysis.shouldReflect,
            toolDependent: analysis.toolDependent
        };
    }

    async recordOutcome(userId, message, response, success, toolsUsed, durationMs = 0) {
        if (this.feedback) {
            this.feedback.trackExchange(userId, message, response || '', null);
        }

        // Experience Recording
        if (this.experience && (toolsUsed.length > 0 || response)) {
            await this.experience.record(
                message || 'interaction',
                (response || '').substring(0, 300),
                success ? 'Task completed' : 'Task encountered issues',
                { tools: toolsUsed, success }
            ).catch(() => {});
        }

        // Reflection (only for complex tasks)
        if (this.reflection && toolsUsed.length > 0) {
            const reflectionResult = await this.reflection.reflect(
                message || 'interaction',
                (response || '').substring(0, 300),
                { success, tools: toolsUsed, duration: durationMs }
            ).catch(() => null);
        }

        // Learning
        if (this.learning) {
            this.learning.recordOutcome(userId, message || '', success, toolsUsed).catch(() => {});
        }

        // Evolution
        if (this.evolution && toolsUsed.length > 0) {
            this.evolution.onTaskCompleted();
        }

        // Decision Journal via Executive
        if (this.executive && toolsUsed.length > 0) {
            try {
                for (const tool of [...new Set(toolsUsed)]) {
                    const decId = await this.executive.recordDecision(
                        message || '',
                        tool,
                        'auto-logged',
                        {}
                    );
                    await this.executive.recordDecisionOutcome(decId, success, durationMs);
                }
            } catch {}
        }

        if (this.feedback && toolsUsed.length > 0) {
            try {
                for (const tool of [...new Set(toolsUsed)]) {
                    this.feedback.recordToolOutcome(
                        message || '', tool, success,
                        { durationMs, userId, timestamp: new Date().toISOString() }
                    );
                }
            } catch {}
        }
    }

    getStats() {
        return {
            kernel: {
                needAnalyzer: true,
                contextBuilder: true
            },
            executive: this.executive ? this.executive.getStats() : null,
            scheduler: this.scheduler ? this.scheduler.getStats() : null,
            learning: this.learning ? { ready: true } : null
        };
    }
}

module.exports = ApplicationKernel;
