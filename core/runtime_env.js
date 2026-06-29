function loadDeepSeekConfig(env = process.env) {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is required to start the DeepSeek primary model.');
    }

    return {
        apiKey,
        model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'
    };
}

module.exports = { loadDeepSeekConfig };
