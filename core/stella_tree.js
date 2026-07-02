const {
    STATUS, Selector, Sequence, Action, Condition, BehaviorTree
} = require('./behavior_tree');
const { decideRoute } = require('./token_router');
const path = require('path');
const fs = require('fs');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

function loadCommands() {
    const commands = [];
    if (!fs.existsSync(COMMANDS_DIR)) return commands;
    const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
        const fullPath = path.join(COMMANDS_DIR, file);
        delete require.cache[require.resolve(fullPath)];
        try {
            const cmd = require(fullPath);
            if (cmd && typeof cmd.match === 'function' && typeof cmd.execute === 'function') {
                commands.push(cmd);
            }
        } catch (e) {
            console.error('[commands] Gagal load ' + file + ':', e.message);
        }
    }
    return commands;
}

let cachedCommands = null;

function buildStellaTree(deps) {
    const {
        learningEngine, evolutionSystem, autoResearcher, selfModifier,
        deepBrain, MODEL_NAME, currentModel, executiveBrain, eventBus, EVENTS
    } = deps;

    const safetyBranch = new Sequence('SafetyCheck', [
        new Condition('NotSpam', (ctx) => {
            const userId = ctx.userId;
            const now = Date.now();
            if (!ctx._rateLimit) ctx._rateLimit = {};
            if (!ctx._rateLimit[userId]) ctx._rateLimit[userId] = [];
            ctx._rateLimit[userId].push(now);
            ctx._rateLimit[userId] = ctx._rateLimit[userId].filter(t => now - t < 5000);
            const isOk = ctx._rateLimit[userId].length <= 5;
            return isOk;
        }),
        new Condition('HasContent', (ctx) => {
            return !!(ctx.message && ctx.message.trim().length > 0);
        })
    ]);

    const learningBranch = new Sequence('LearningProcess', [
        new Action('TrackPatterns', async (ctx) => {
            learningEngine.trackInteraction(ctx.userId, ctx.message);
            ctx.sentiment = learningEngine.detectSentiment(ctx.message);
            ctx.ruleIntent = learningEngine.detectIntent(ctx.message);
            ctx.routeDecision = decideRoute(ctx.message, ctx.ruleIntent);
            ctx.topics = learningEngine._extractTopics ? learningEngine._extractTopics(ctx.message) : ['general'];
            ctx.learningContext = learningEngine.getLearningContext(ctx.userId);
            ctx.messageHash = learningEngine.hashMessage ? learningEngine.hashMessage(ctx.message) : '';
            return STATUS.SUCCESS;
        }),
        new Action('DeepBrainAnalysis', async (ctx) => {
            if (deepBrain && ctx.routeDecision.useDeepBrain) {
                const thought = await deepBrain.think(ctx.message, {
                    ruleIntent: ctx.ruleIntent, sentiment: ctx.sentiment,
                    topics: ctx.topics, userId: ctx.userId
                });
                ctx.neuralThought = thought;
                ctx.neuralPrompt = thought.prompt;
                ctx.deepIntent = thought.intent;
                ctx.deepConfidence = thought.confidence;
                if (thought.intent && thought.confidence >= 0.45) ctx.intent = thought.intent;
            }
            return STATUS.SUCCESS;
        }),
        new Action('ExecutiveBrainDispatch', async (ctx) => {
            if (executiveBrain && executiveBrain.isReady && !ctx.skipAI) {
                try {
                    const brainResult = await executiveBrain.dispatch(ctx.message, {
                        userId: ctx.userId,
                        safetyCheck: true,
                        needsKnowledge: ctx.routeDecision.route !== 'direct',
                        needsReasoning: ctx.routeDecision.route === 'complex',
                        needsPlanning: !ctx.isCommand,
                        allowCuriosity: ctx.routeDecision.route === 'chat'
                    });

                    ctx.executiveContext = brainResult;

                    if (brainResult.safety && !brainResult.safety.allowed) {
                        ctx.skipAI = true;
                        ctx.directReply = brainResult.safety.reason;
                        return STATUS.SUCCESS;
                    }

                    if (brainResult.goalContext) ctx.goalContext = brainResult.goalContext;
                    if (brainResult.memoryContext && brainResult.memoryContext.length > 0) {
                        ctx.memoryContext = brainResult.memoryContext;
                    }
                    if (brainResult.knowledgeContext) ctx.knowledgeContext = brainResult.knowledgeContext;
                    if (brainResult.reasoning) ctx.reasoningInfo = brainResult.reasoning.promptInfo;
                    if (brainResult.plan) ctx.planInfo = brainResult.plan;
                    if (brainResult.toolRecommendations && brainResult.toolRecommendations.length > 0) {
                        ctx.toolRecommendations = brainResult.toolRecommendations;
                    }
                    if (brainResult.knowledgeGap && brainResult.knowledgeGap.detected && autoResearcher) {
                        ctx._pendingResearch = brainResult.knowledgeGap;
                    }
                } catch (err) {
                    console.error('[BT] ExecutiveBrain error:', err.message);
                }
            }
            return STATUS.SUCCESS;
        })
    ]);

    const autoResearchBranch = new Action('AutoResearch', async (ctx) => {
        if (!autoResearcher) return STATUS.SUCCESS;

        const gap = ctx._pendingResearch || (
            ctx.routeDecision.route === 'research'
                ? { needsResearch: true, reason: 'explicit_research_route', searchQuery: ctx.message }
                : { needsResearch: false, reason: 'route_not_research' }
        );

        if (gap.needsResearch) {
            if (ctx.notifyCallback) {
                await ctx.notifyCallback('Sebentar, aku riset dulu ya...');
            }
            const results = await autoResearcher.research(gap.searchQuery || ctx.message);
            ctx.researchContext = autoResearcher.buildResearchContext(results);
            ctx.didResearch = true;
        }
        return STATUS.SUCCESS;
    });

    const customRulesBranch = new Action('EvaluateCustomRules', async (ctx) => {
        if (!selfModifier) return STATUS.SUCCESS;
        const actions = selfModifier.evaluateRules(ctx);
        if (actions.length > 0) {
            selfModifier.executeActions(actions, ctx);
        }
        return STATUS.SUCCESS;
    });

    if (!cachedCommands) cachedCommands = loadCommands();

    const commandBranch = new Sequence('CommandCheck', [
        new Condition('IsCommand', (ctx) => {
            const msg = ctx.message.trim().toLowerCase();
            ctx.isCommand = msg.startsWith('/') || cachedCommands.some(c => c.match(msg));
            return ctx.isCommand;
        }),
        new Action('HandleCommand', async (ctx) => {
            const msg = ctx.message.trim().toLowerCase();
            for (const cmd of cachedCommands) {
                if (cmd.match(msg)) {
                    return cmd.execute(ctx, { ...deps, STATUS });
                }
            }
            ctx.isCommand = false;
            return STATUS.FAILURE;
        })
    ]);

    const aiResponseBranch = new Action('GenerateAIResponse', async (ctx) => {
        if (ctx.skipAI) return STATUS.SUCCESS;
        ctx.useAI = true;

        if (ctx.executiveContext) {
            ctx.executiveBrainLoaded = true;
        }

        if (eventBus && EVENTS) {
            eventBus.emit(EVENTS.MESSAGE_RECEIVED, {
                userId: ctx.userId,
                message: ctx.message.substring(0, 200),
                intent: ctx.intent,
                topics: ctx.topics
            });
        }

        evolutionSystem.onMessageHandled(ctx.topics || []);
        return STATUS.SUCCESS;
    });

    const root = new Sequence('StellaRoot', [
        safetyBranch,
        learningBranch,
        customRulesBranch,
        autoResearchBranch,
        new Selector('ResponseSelector', [
            commandBranch,
            aiResponseBranch
        ])
    ]);

    return new BehaviorTree('StellaBT_v2', root);
}

const rateLimitStore = {};

function createContext(userId, message, extras = {}) {
    return {
        userId, message,
        _rateLimit: rateLimitStore,
        sentiment: null, intent: null, ruleIntent: null,
        topics: [], learningContext: '', personalityPrompt: '',
        skillHints: '', messageHash: '',
        directReply: null, skipAI: false, useAI: false, isCommand: false,
        deepIntent: null, deepConfidence: 0, neuralThought: null, neuralPrompt: '',
        routeDecision: { route: 'chat', useDeepBrain: false, includeTools: false, maxOutputTokens: 500 },
        researchContext: '', didResearch: false, rulePrompt: '',
        triggerReflection: false, triggerReload: false,
        notifyCallback: null,
        executiveContext: null, executiveBrainLoaded: false,
        goalContext: null, memoryContext: null, knowledgeContext: null,
        reasoningInfo: null, planInfo: null, toolRecommendations: [],
        _pendingResearch: null,
        ...extras
    };
}

function reloadCommands() {
    cachedCommands = null;
    cachedCommands = loadCommands();
    console.log('[commands] Reloaded ' + cachedCommands.length + ' commands.');
}

module.exports = { buildStellaTree, createContext, reloadCommands };
