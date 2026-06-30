module.exports = {
    match: (msg) => msg.startsWith('/leave'),
    execute: async (ctx, deps) => {
        ctx.triggerLeaveGroup = true;
        ctx.directReply = 'Keluar dari grup...';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};