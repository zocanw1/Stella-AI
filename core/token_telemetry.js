const fs = require('fs');
const path = require('path');

class TokenTelemetry {
    constructor(filePath) {
        this.filePath = filePath;
        this.state = this.load();
    }

    load() {
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        } catch (error) {
            return {
                totalRequests: 0,
                routes: {},
                deepBrainCalls: 0,
                promptChars: 0,
                activeTools: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheHits: 0,
                updatedAt: null
            };
        }
    }

    record({ route, usedDeepBrain, promptChars, activeTools, usage, cacheHits = 0 }) {
        this.state.totalRequests += 1;
        this.state.routes[route] = (this.state.routes[route] || 0) + 1;
        this.state.deepBrainCalls += usedDeepBrain ? 1 : 0;
        this.state.promptChars += Number(promptChars) || 0;
        this.state.activeTools += Number(activeTools) || 0;
        this.state.inputTokens += Number(usage?.prompt_tokens) || 0;
        this.state.outputTokens += Number(usage?.completion_tokens) || 0;
        this.state.cacheHits = Number(cacheHits) || this.state.cacheHits;
        this.state.updatedAt = new Date().toISOString();

        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    }

    getStatsText() {
        return `--- TOKEN TELEMETRY ---\n` +
            `Requests: ${this.state.totalRequests}\n` +
            `DeepBrain calls: ${this.state.deepBrainCalls}\n` +
            `Prompt chars: ${this.state.promptChars}\n` +
            `Input tokens: ${this.state.inputTokens}\n` +
            `Output tokens: ${this.state.outputTokens}\n` +
            `Cache hits: ${this.state.cacheHits}\n`;
    }
}

module.exports = { TokenTelemetry };
