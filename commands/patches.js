module.exports = {
    match: (msg) => msg.startsWith('/patches'),
    execute: async (ctx, deps) => {
        ctx.directReply = deps.selfModifier ? deps.selfModifier.getPatchesText() : 'Self-Modifier tidak aktif.';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};