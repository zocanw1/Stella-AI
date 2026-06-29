const axios = require('axios');

function normalizeSchema(schema = {}) {
    const normalized = { ...schema };
    if (normalized.type) normalized.type = String(normalized.type).toLowerCase();
    if (normalized.properties) {
        normalized.properties = Object.fromEntries(
            Object.entries(normalized.properties).map(([name, value]) => [name, normalizeSchema(value)])
        );
    }
    if (normalized.items) normalized.items = normalizeSchema(normalized.items);
    return normalized;
}

function toDeepSeekTools(declarations = []) {
    return declarations.map((declaration) => ({
        type: 'function',
        function: {
            name: declaration.name,
            description: declaration.description || '',
            parameters: normalizeSchema(declaration.parameters)
        }
    }));
}

class DeepSeekProvider {
    constructor({ apiKey, httpClient = axios }) {
        this.apiKey = apiKey;
        this.httpClient = httpClient;
    }

    async complete({ messages, tools = [], model = 'deepseek-chat', maxTokens = 1200 }) {
        const body = {
            model,
            messages,
            temperature: 0.7,
            max_tokens: maxTokens
        };
        if (tools.length > 0) {
            body.tools = tools;
            body.tool_choice = 'auto';
        }

        const response = await this.httpClient.post('/chat/completions', body, {
            baseURL: 'https://api.deepseek.com',
            timeout: 90000,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const message = response.data?.choices?.[0]?.message;
        if (!message) throw new Error('DeepSeek returned no completion message.');
        return { ...message, usage: response.data?.usage || null };
    }
}

module.exports = { DeepSeekProvider, toDeepSeekTools };
