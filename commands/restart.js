module.exports = {
    match: (msg) => msg.startsWith('/restart'),
    execute: async (ctx, deps) => {
        ctx.directReply = '🚀 Me-restart sistem Stella... Mohon tunggu.';
        ctx.skipAI = true;
        setTimeout(() => process.exit(42), 1000);
        return deps.STATUS.SUCCESS;
    }
};