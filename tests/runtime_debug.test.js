const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldLogDebug } = require('../core/runtime_debug');

test('debug logs are disabled unless STELLA_DEBUG is explicitly true', () => {
    assert.equal(shouldLogDebug({}), false);
    assert.equal(shouldLogDebug({ STELLA_DEBUG: 'false' }), false);
    assert.equal(shouldLogDebug({ STELLA_DEBUG: 'true' }), true);
});
