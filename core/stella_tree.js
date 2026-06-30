/**
 * ============================================
 *  🌳 STELLA BEHAVIOR TREE v2
 *  Decision-making tree with Auto-Research,
 *  Custom Rules, and Deep Brain integration
 * ============================================
 */

const {
    STATUS, Selector, Sequence, Action, Condition, Cooldown, BehaviorTree
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

/**
 * Build Stella's main behavior tree.
 */
function buildStellaTree(deps) {
    const { learningEngine, evolutionSystem, autoResearcher, selfModifier, deepBrain, MODEL_NAME, currentModel } = deps;

    // ═══════════════════════════════════════
    //  BRANCH 1: Safety & Rate Limiting
    // ═══════════════════════════════════════
    const safetyBranch = new Sequence('SafetyCheck', [
        new Condition('NotSpam', (ctx) => {
            const userId = ctx.userId;
            const now = Date.now();
            if (!ctx._rateLimit) ctx._rateLimit = {};
            if (!ctx._rateLimit[userId]) ctx._rateLimit[userId] = [];
            ctx._rateLimit[userId].push(now);
            ctx._rateLimit[userId] = ctx._rateLimit[userId].filter(t => now - t < 5000);
            const isOk = ctx._rateLimit[userId].length <= 5;
            if (!isOk) console.log('[BT] Rate limit triggered for user', userId);
            if (ctx._btLog) ctx._btLog('NotSpam', isOk ? 'PASS' : 'BLOCKED');
            return isOk;
        }),
        new Condition('HasContent', (ctx) => {
            const ok = !!(ctx.message && ctx.message.trim().length > 0);
            if (ctx._btLog) ctx._btLog('HasContent', ok ? 'PASS' : 'EMPTY');
            return ok;
        })
    ]);

    // ═══════════════════════════════════════
    //  BRANCH 2: Learning & Context Enrichment
    // ═══════════════════════════════════════
    const learningBranch = new Sequence('LearningProcess', [
        new Action('TrackPatterns', async (ctx) => {
            learningEngine.trackInteraction(ctx.userId, ctx.message);
            ctx.sentiment = learningEngine.detectSentiment(ctx.message);
            ctx.ruleIntent = learningEngine.detectIntent(ctx.message);
            ctx.intent = ctx.ruleIntent;
            ctx.routeDecision = decideRoute(ctx.message, ctx.ruleIntent);
            ctx.topics = learningEngine._extractTopics(ctx.message);
            ctx.learningContext = learningEngine.getLearningContext(ctx.userId);
            ctx.messageHash = learningEngine.hashMessage(ctx.message);

            if (ctx._btLog) ctx._btLog('TrackPatterns', `intent=${ctx.intent}, sentiment=${ctx.sentiment}`);
            return STATUS.SUCCESS;
        }),
        new Action('DeepBrainAnalysis', async (ctx) => {
            if (deepBrain && ctx.routeDecision.useDeepBrain) {
                const thought = await deepBrain.think(ctx.message, {
                    ruleIntent: ctx.ruleIntent,
                    sentiment: ctx.sentiment,
                    topics: ctx.topics,
                    userId: ctx.userId
                });
                ctx.neuralThought = thought;
                ctx.neuralPrompt = thought.prompt;
                ctx.deepIntent = thought.intent;
                ctx.deepConfidence = thought.confidence;
                if (thought.intent && thought.confidence >= 0.45) ctx.intent = thought.intent;
                if (ctx._btLog) ctx._btLog('DeepBrain', `mode=${thought.dominantMode}, intent=${thought.intent} (${Math.round(thought.confidence * 100)}%)`);
                deepBrain.addIntentSample(ctx.message, ctx.intent);
            } else if (ctx._btLog) {
                ctx._btLog('DeepBrain', 'SKIPPED: lightweight_route');
            }
            return STATUS.SUCCESS;
        }),
        new Action('EnrichContext', async (ctx) => {
            const relevantSkills = learningEngine.findRelevantSkills(ctx.message, 2);
            if (relevantSkills.length > 0) {
                ctx.skillHints = relevantSkills.map(s =>
                    `Skill sebelumnya: "${s.trigger}" -> ${s.solution}`
                ).join('\n');
            }
            ctx.personalityPrompt = evolutionSystem.getPersonalityPrompt();
            if (ctx._btLog) ctx._btLog('EnrichContext', `skills=${relevantSkills.length}`);
            return STATUS.SUCCESS;
        })
    ]);

    // ═══════════════════════════════════════
    //  BRANCH 3: Auto-Research (Knowledge Gap)
    // ═══════════════════════════════════════
    const autoResearchBranch = new Action('AutoResearch', async (ctx) => {
        if (!autoResearcher) return STATUS.SUCCESS;

        const gap = ctx.routeDecision.route === 'research'
            ? { needsResearch: true, reason: 'explicit_research_route', searchQuery: ctx.message }
            : { needsResearch: false, reason: 'route_not_research' };

        if (gap.needsResearch) {
            console.log(`🔍 [AutoResearch] Gap detected: ${gap.reason} -> searching: "${gap.searchQuery}"`);
            if (ctx._btLog) ctx._btLog('AutoResearch', `RESEARCHING: ${gap.reason}`);

            // Notify user that Stella is researching
            if (ctx.notifyCallback) {
                await ctx.notifyCallback('Sebentar, aku riset dulu ya...');
            }

            const results = await autoResearcher.research(gap.searchQuery);
            ctx.researchContext = autoResearcher.buildResearchContext(results);
            ctx.didResearch = true;
        } else {
            if (ctx._btLog) ctx._btLog('AutoResearch', `SKIP: ${gap.reason}`);
        }

        return STATUS.SUCCESS;
    });

    // ═══════════════════════════════════════
    //  BRANCH 4: Custom Rules Evaluation
    // ═══════════════════════════════════════
    const customRulesBranch = new Action('EvaluateCustomRules', async (ctx) => {
        if (!selfModifier) return STATUS.SUCCESS;

        const actions = selfModifier.evaluateRules(ctx);
        if (actions.length > 0) {
            selfModifier.executeActions(actions, ctx);
            if (ctx._btLog) ctx._btLog('CustomRules', `${actions.length} rules triggered`);
        } else {
            if (ctx._btLog) ctx._btLog('CustomRules', 'no rules triggered');
        }
        return STATUS.SUCCESS;
    });

    // ═══════════════════════════════════════
    //  BRANCH 5: Command Handling (Dynamic)
    // ═══════════════════════════════════════
    if (!cachedCommands) cachedCommands = loadCommands();

    const commandBranch = new Sequence('CommandCheck', [
        new Condition('IsCommand', (ctx) => {
            const msg = ctx.message.trim().toLowerCase();
            ctx.isCommand = msg.startsWith('/') || cachedCommands.some(c => c.match(msg));
            return ctx.isCommand;
        }),
        new Action('HandleCommand', async (ctx) => {
            const msg = ctx.message.trim().toLowerCase();
            if (ctx._btLog) ctx._btLog('HandleCommand', `Checking command: ${msg}`);

            for (const cmd of cachedCommands) {
                if (cmd.match(msg)) {
                    if (ctx._btLog) ctx._btLog('HandleCommand', `Matched: ${cmd.name || 'unnamed'}`);
                    return cmd.execute(ctx, { ...deps, STATUS });
                }
            }

            ctx.isCommand = false;
            return STATUS.FAILURE;
        })
    ]);

    // ═══════════════════════════════════════
    //  BRANCH 6: AI Response
    // ═══════════════════════════════════════
    const aiResponseBranch = new Action('GenerateAIResponse', async (ctx) => {
        if (ctx.skipAI) return STATUS.SUCCESS;
        ctx.useAI = true;
        evolutionSystem.onMessageHandled(ctx.topics || []);
        if (ctx._btLog) ctx._btLog('GenerateAIResponse', 'DELEGATED_TO_AI');
        return STATUS.SUCCESS;
    });

    // ═══════════════════════════════════════
    //  ROOT TREE
    // ═══════════════════════════════════════
    const root = new Sequence('StellaRoot', [
        safetyBranch,
        learningBranch,
        autoResearchBranch,
        customRulesBranch,
        new Selector('ResponseSelector', [
            commandBranch,
            aiResponseBranch
        ])
    ]);

    return new BehaviorTree('StellaBT_v2', root);
}

// Shared rate limit store
const rateLimitStore = {};

function createContext(userId, message, extras = {}) {
    return {
        userId,
        message,
        _rateLimit: rateLimitStore,
        sentiment: null,
        intent: null,
        ruleIntent: null,
        topics: [],
        learningContext: '',
        personalityPrompt: '',
        skillHints: '',
        messageHash: '',
        directReply: null,
        skipAI: false,
        useAI: false,
        isCommand: false,
        // New in v2
        deepIntent: null,
        deepConfidence: 0,
        neuralThought: null,
        neuralPrompt: '',
        routeDecision: { route: 'chat', useDeepBrain: false, includeTools: false, maxOutputTokens: 500 },
        researchContext: '',
        didResearch: false,
        rulePrompt: '',
        triggerReflection: false,
        triggerReload: false,
        notifyCallback: null,
        ...extras
    };
}

function reloadCommands() {
    cachedCommands = null;
    cachedCommands = loadCommands();
    console.log('[commands] Reloaded ' + cachedCommands.length + ' commands.');
}

module.exports = { buildStellaTree, createContext, reloadCommands };
