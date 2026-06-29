const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStellaTree, createContext } = require('../core/stella_tree');

function makeDependencies(deepBrain, autoResearcher = null) {
    const learningEngine = {
        trackInteraction() {},
        detectSentiment() { return 'neutral'; },
        detectIntent(message) { return /halo/i.test(message) ? 'greeting' : 'question'; },
        _extractTopics() { return ['general']; },
        getLearningContext() { return ''; },
        hashMessage() { return 'hash'; },
        findRelevantSkills() { return []; }
    };
    return {
        learningEngine,
        deepBrain,
        autoResearcher: autoResearcher || { detectKnowledgeGap() { return { needsResearch: false, reason: 'not_needed' }; }, getStatsText() { return ''; } },
        selfModifier: { evaluateRules() { return []; }, executeActions() {}, getActivePatchesPrompt() { return ''; } },
        evolutionSystem: { getPersonalityPrompt() { return ''; }, onMessageHandled() {}, getStatsText() { return ''; } },
        MODEL_NAME: 'deepseek-chat',
        currentModel: 'deepseek'
    };
}

test('light greeting skips DeepBrain and avoids neural prompt injection', async () => {
    let calls = 0;
    const deepBrain = {
        async think() { calls++; return { intent: 'greeting', confidence: 1, prompt: 'unused' }; },
        addIntentSample() {},
        getStatsText() { return ''; }
    };
    const context = createContext('user-1', 'halo stella', { _rateLimit: {} });
    await buildStellaTree(makeDependencies(deepBrain)).tick(context);

    assert.equal(calls, 0);
    assert.equal(context.routeDecision.route, 'direct');
    assert.equal(context.neuralPrompt, '');
});

test('complex request runs DeepBrain and keeps its routing prompt', async () => {
    let calls = 0;
    const deepBrain = {
        async think() { calls++; return { intent: 'question', confidence: 0.8, prompt: 'NEURAL STATE', dominantMode: 'use_codex' }; },
        addIntentSample() {},
        getStatsText() { return ''; }
    };
    const context = createContext('user-2', 'bedah error ini lalu bandingkan solusi dan buat langkah perbaikannya', { _rateLimit: {} });
    await buildStellaTree(makeDependencies(deepBrain)).tick(context);

    assert.equal(calls, 1);
    assert.equal(context.routeDecision.route, 'complex');
    assert.equal(context.neuralPrompt, 'NEURAL STATE');
});

test('ordinary questions do not trigger automatic web research', async () => {
    let detectCalls = 0;
    const deepBrain = { async think() { throw new Error('must not run'); }, addIntentSample() {}, getStatsText() { return ''; } };
    const autoResearcher = {
        detectKnowledgeGap() { detectCalls++; return { needsResearch: true, reason: 'named_entity', searchQuery: 'kenapa' }; },
        research() { throw new Error('must not research'); },
        buildResearchContext() { return ''; },
        getStatsText() { return ''; }
    };
    const context = createContext('user-3', 'kenapa aku lagi pengen', { _rateLimit: {} });
    await buildStellaTree(makeDependencies(deepBrain, autoResearcher)).tick(context);

    assert.equal(context.routeDecision.route, 'chat');
    assert.equal(detectCalls, 0);
});
