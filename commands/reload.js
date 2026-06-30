module.exports = {
    match: (msg) => msg.startsWith('/reload'),
    execute: async (ctx, deps) => {
        ctx.triggerReload = true;
        ctx.directReply = '🔄 Me-reload semua command...';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};