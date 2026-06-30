module.exports = {
    match: (msg) => msg.startsWith('/reflect'),
    execute: async (ctx, deps) => {
        ctx.triggerReflection = true;
        ctx.directReply = 'Stella sedang melakukan self-reflection... Tunggu sebentar.';
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};