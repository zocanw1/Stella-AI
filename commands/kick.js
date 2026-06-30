module.exports = {
    match: (msg) => msg.startsWith('/kick'),
    execute: async (ctx, deps) => {
        ctx.triggerKickMember = true;
        ctx.rawMessage = ctx.message;
        ctx.directReply = 'Proses kick anggota...';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};