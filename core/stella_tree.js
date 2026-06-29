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

/**
 * Build Stella's main behavior tree.
 */
function buildStellaTree(deps) {
    const { learningEngine, evolutionSystem, autoResearcher, selfModifier, deepBrain, MODEL_NAME, currentModel } = deps;

    const isNaturalModelCommand = (msg) => {
        return /\b(ganti|ubah|switch|balikin|kembali|balik)\b.*\b(model|gpt|gemini|groq|llama)\b/.test(msg) ||
            /\bgpt\s*[- ]?\s*\d/.test(msg);
    };

    const parseModelTarget = (msg) => {
        if (/\bgemini\b/.test(msg)) return 'gemini';
        if (/\bgroq\b|\bllama\b/.test(msg)) return 'groq';
        if (/\bcodex\b|\bgpt\b/.test(msg)) return 'codex';
        return null;
    };

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
    //  BRANCH 5: Command Handling
    // ═══════════════════════════════════════
    const commandBranch = new Sequence('CommandCheck', [
        new Condition('IsCommand', (ctx) => {
            const msg = ctx.message.trim().toLowerCase();
            ctx.isCommand = msg.startsWith('/') || isNaturalModelCommand(msg);
            return ctx.isCommand;
        }),
        new Action('HandleCommand', async (ctx) => {
            const msg = ctx.message.trim().toLowerCase();
            if (ctx._btLog) ctx._btLog('HandleCommand', `Checking command: ${msg}`);

            if (msg.startsWith('/ping')) {
                ctx.directReply = `aku aktif kok.`;
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/restart')) {
                ctx.directReply = `🚀 Me-restart sistem Stella... Mohon tunggu.`;
                ctx.skipAI = true;
                setTimeout(() => process.exit(0), 1000);
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/stats')) {
                let reply = `--- STATISTIK SISTEM ---\n`;
                reply += `🤖 Gaya proses aktif: ${currentModel === 'codex' ? 'stella natural' : currentModel === 'groq' ? 'stella cepat' : 'stella standar'}\n`;
                reply += evolutionSystem.getStatsText();
                if (deepBrain) reply += '\n' + deepBrain.getStatsText();
                if (autoResearcher) reply += '\n' + autoResearcher.getStatsText();
                ctx.directReply = reply;
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/help')) {
                let reply = `--- PANDUAN PERINTAH STELLA ---\n\n`;
                reply += `🔹 /stats - Cek statistik, level, dan model AI.\n`;
                reply += `🔹 /skills - Lihat daftar kemampuan yang dikuasai.\n`;
                reply += `🔹 /learn - Lihat topik favorit dan jam aktifmu.\n`;
                reply += `🔹 /patches - Lihat perbaikan sistem otomatis.\n`;
                reply += `🔹 /rules - Lihat aturan kustom yang aktif.\n`;
                reply += `🔹 /reflect - Jalankan evaluasi diri (Self-Reflection).\n`;
                reply += `🔹 /settings - Buka menu pengaturan interaktif.\n`;
                reply += `🔹 /model [codex|gemini|groq] - Ganti mode respons Stella.\n`;
                reply += `🔹 /clear - Reset chat history (jika Stella error).\n`;
                reply += `\n💡 Kamu juga bisa chat biasa buat minta gambar, voice note, atau riset web.`;
                ctx.directReply = reply;
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/skills')) {
                ctx.directReply = evolutionSystem.getSkillTreeText();
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/learn')) {
                const topTopics = learningEngine.getUserTopTopics(ctx.userId, 5);
                const peakHours = learningEngine.getUserPeakHours(ctx.userId);
                let reply = `--- APA YANG STELLA PELAJARI ---\n\n`;
                reply += `Topik favoritmu:\n`;
                topTopics.forEach(t => { reply += `  - ${t.topic}: ${t.count}x\n`; });
                reply += `\nJam aktifmu:\n`;
                peakHours.forEach(h => { reply += `  - ${h.hour}:00 (${h.count}x)\n`; });
                reply += `\nSkill yang Stella pelajari: ${learningEngine.knowledgeBase.skills.length}`;
                reply += `\nSolusi tersimpan: ${learningEngine.knowledgeBase.solutions.length}`;
                ctx.directReply = reply;
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/patches')) {
                ctx.directReply = selfModifier ? selfModifier.getPatchesText() : 'Self-Modifier tidak aktif.';
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/rules')) {
                ctx.directReply = selfModifier ? selfModifier.getRulesText() : 'Self-Modifier tidak aktif.';
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (!msg.startsWith('/') && isNaturalModelCommand(msg)) {
                const target = parseModelTarget(msg);

                if (target) {
                    ctx.switchModel = target;
                    ctx.directReply = `berhasil. mode Stella sekarang: ${target.toUpperCase()}.`;
                } else {
                    ctx.directReply = 'model yang bisa kupakai dari sini: codex, gemini, atau groq.';
                }
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/model')) {
                const parts = msg.split(/\s+/);
                const target = ['codex', 'gemini', 'groq'].includes(parts[1]) ? parts[1] : parseModelTarget(msg);
                if (target === 'codex' || target === 'groq' || target === 'gemini') {
                    ctx.switchModel = target;
                    ctx.directReply = `✅ Berhasil! Otak Stella sekarang menggunakan: **${target.toUpperCase()}**`;
                } else {
                    ctx.directReply = `❌ Gunakan: /model codex, /model gemini, atau /model groq`;
                }
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }
            if (msg.startsWith('/reflect')) {
                ctx.triggerReflection = true;
                ctx.directReply = 'Stella sedang melakukan self-reflection... Tunggu sebentar.';
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }

            // Command /settings untuk membuka UI pengaturan
            if (msg.startsWith('/settings') || msg.startsWith('/setting')) {
                ctx.triggerSettings = true;
                ctx.directReply = 'Membuka menu pengaturan...';
                ctx.skipAI = true;
                return STATUS.SUCCESS;
            }

            // Command /clear to fix "bengong" state
            if (msg.startsWith('/clear')) {
                ctx.triggerClearHistory = true;
                ctx.directReply = 'ingatan jangka pendekku sudah di-reset. aku siap ngobrol lagi.';
                ctx.skipAI = true;
                return STATUS.SUCCESS;
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
        notifyCallback: null,
        ...extras
    };
}

module.exports = { buildStellaTree, createContext };
