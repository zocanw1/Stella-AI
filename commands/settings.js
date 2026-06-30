module.exports = {
    match: (msg) => msg.startsWith('/settings') || msg.startsWith('/setting'),
    execute: async (ctx, deps) => {
        ctx.triggerSettings = true;
        ctx.directReply = 'Membuka menu pengaturan...';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};