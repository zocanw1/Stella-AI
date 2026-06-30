module.exports = {
    match: (msg) => msg.startsWith('/learn'),
    execute: async (ctx, deps) => {
        const topTopics = deps.learningEngine.getUserTopTopics(ctx.userId, 5);
        const peakHours = deps.learningEngine.getUserPeakHours(ctx.userId);
        let reply = '--- APA YANG STELLA PELAJARI ---\n\n';
        reply += 'Topik favoritmu:\n';
        topTopics.forEach(t => { reply += '  - ' + t.topic + ': ' + t.count + 'x\n'; });
        reply += '\nJam aktifmu:\n';
        peakHours.forEach(h => { reply += '  - ' + h.hour + ':00 (' + h.count + 'x)\n'; });
        reply += '\nSkill yang Stella pelajari: ' + deps.learningEngine.knowledgeBase.skills.length;
        reply += '\nSolusi tersimpan: ' + deps.learningEngine.knowledgeBase.solutions.length;
        ctx.directReply = reply;
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};