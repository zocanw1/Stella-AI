const test = require('node:test');
const assert = require('node:assert/strict');

const { DeepSeekProvider, toDeepSeekTools } = require('../core/deepseek_provider');
const { loadDeepSeekConfig } = require('../core/runtime_env');

test('loads the DeepSeek key and defaults to deepseek-chat', () => {
    assert.deepEqual(loadDeepSeekConfig({ DEEPSEEK_API_KEY: 'test-key' }), {
        apiKey: 'test-key',
        model: 'deepseek-chat'
    });
});

test('rejects a missing DeepSeek key', () => {
    assert.throws(() => loadDeepSeekConfig({}), /DEEPSEEK_API_KEY/);
});

test('converts Gemini-style function declarations to OpenAI-compatible tools', () => {
    const tools = toDeepSeekTools([{
        name: 'get_time',
        description: 'Get the current time.',
        parameters: {
            type: 'OBJECT',
            properties: { timezone: { type: 'STRING' } },
            required: ['timezone']
        }
    }]);

    assert.deepEqual(tools, [{
        type: 'function',
        function: {
            name: 'get_time',
            description: 'Get the current time.',
            parameters: {
                type: 'object',
                properties: { timezone: { type: 'string' } },
                required: ['timezone']
            }
        }
    }]);
});

test('sends a DeepSeek chat completion request and returns the provider message', async () => {
    const requests = [];
    const provider = new DeepSeekProvider({
        apiKey: 'test-key',
        httpClient: {
            post: async (url, body, options) => {
                requests.push({ url, body, options });
                return {
                    data: {
                        choices: [{ message: { role: 'assistant', content: 'Halo Kak.' } }],
                        usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 }
                    }
                };
            }
        }
    });

    const message = await provider.complete({
        messages: [{ role: 'user', content: 'halo' }],
        tools: [],
        model: 'deepseek-chat',
        maxTokens: 250
    });

    assert.equal(message.content, 'Halo Kak.');
    assert.equal(requests[0].url, '/chat/completions');
    assert.equal(requests[0].body.model, 'deepseek-chat');
    assert.equal(requests[0].body.max_tokens, 250);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(message.usage, { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 });
});
