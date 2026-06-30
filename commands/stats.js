module.exports = {
    match: (msg) => msg.startsWith('/stats'),
    execute: async (ctx, deps) => {
        let reply = '--- STATISTIK SISTEM ---\n';
        reply += '🤖 Gaya proses aktif: ' + (deps.currentModel === 'codex' ? 'stella natural' : deps.currentModel === 'groq' ? 'stella cepat' : 'stella standar') + '\n';
        reply += deps.evolutionSystem.getStatsText();
        if (deps.deepBrain) reply += '\n' + deps.deepBrain.getStatsText();
        if (deps.autoResearcher) reply += '\n' + deps.autoResearcher.getStatsText();
        ctx.directReply = reply;
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};