module.exports = {
    match: (msg) => msg.startsWith('/ping'),
    execute: async (ctx, deps) => {
        ctx.directReply = 'aku aktif kok.';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};