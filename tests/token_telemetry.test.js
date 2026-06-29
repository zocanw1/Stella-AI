const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { TokenTelemetry } = require('../core/token_telemetry');

test('aggregates route, DeepBrain, prompt, tool, and provider token metrics', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-telemetry-'));
    const telemetry = new TokenTelemetry(path.join(directory, 'token_metrics.json'));

    telemetry.record({
        route: 'direct',
        usedDeepBrain: false,
        promptChars: 400,
        activeTools: 0,
        usage: { prompt_tokens: 100, completion_tokens: 20 }
    });

    const state = JSON.parse(fs.readFileSync(path.join(directory, 'token_metrics.json'), 'utf8'));
    assert.equal(state.totalRequests, 1);
    assert.equal(state.routes.direct, 1);
    assert.equal(state.deepBrainCalls, 0);
    assert.equal(state.promptChars, 400);
    assert.equal(state.inputTokens, 100);
    assert.equal(state.outputTokens, 20);
});
