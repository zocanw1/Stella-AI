module.exports = {
    match: (msg) => msg.startsWith('/rules'),
    execute: async (ctx, deps) => {
        ctx.directReply = deps.selfModifier ? deps.selfModifier.getRulesText() : 'Self-Modifier tidak aktif.';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};