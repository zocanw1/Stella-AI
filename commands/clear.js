module.exports = {
    match: (msg) => msg.startsWith('/clear'),
    execute: async (ctx, deps) => {
        ctx.triggerClearHistory = true;
        ctx.directReply = 'ingatan jangka pendekku sudah di-reset. aku siap ngobrol lagi.';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};