const test = require('node:test');
const assert = require('node:assert/strict');

const {
    decideRoute,
    buildPromptBudget,
    getOutputLimit
} = require('../core/token_router');

test('handles a greeting without DeepBrain or tool schemas', () => {
    const decision = decideRoute('halo stella', 'greeting');

    assert.equal(decision.route, 'direct');
    assert.equal(decision.useDeepBrain, false);
    assert.equal(decision.includeTools, false);
    assert.equal(decision.maxOutputTokens, 250);
});

test('handles explicit file work with tools but without DeepBrain', () => {
    const decision = decideRoute('tolong baca file laporan.txt', 'file_op');

    assert.equal(decision.route, 'tool');
    assert.equal(decision.useDeepBrain, false);
    assert.equal(decision.includeTools, true);
});

test('uses DeepBrain only for complex or ambiguous requests', () => {
    const decision = decideRoute('bedah error ini, bandingkan tiga solusi, lalu buatkan langkah perbaikannya', 'question');

    assert.equal(decision.route, 'complex');
    assert.equal(decision.useDeepBrain, true);
    assert.equal(decision.includeTools, true);
    assert.equal(getOutputLimit('complex'), 1200);
});

test('keeps a compact summary and six newest messages inside the prompt budget', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'model',
        parts: [{ text: `pesan-${index} `.repeat(80) }]
    }));

    const budget = buildPromptBudget({
        instruction: 'instruksi utama '.repeat(500),
        memory: 'fakta user '.repeat(500),
        history
    });

    assert.equal(budget.history.length, 6);
    assert.match(budget.history.at(-1).parts[0].text, /pesan-9/);
    assert.ok(budget.instruction.length <= 3200);
    assert.ok(budget.memory.length <= 800);
    assert.ok(budget.summary.length <= 400);
    assert.ok(budget.history.every((entry) => entry.parts[0].text.length <= 600));
    assert.ok(budget.metrics.promptChars <= 8000);
});
