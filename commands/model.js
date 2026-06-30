const parseModelTarget = (msg) => {
    if (/\bgemini\b/.test(msg)) return 'gemini';
    if (/\bgroq\b|\bllama\b/.test(msg)) return 'groq';
    if (/\bcodex\b|\bgpt\b/.test(msg)) return 'codex';
    return null;
};

module.exports = {
    match: (msg) => msg.startsWith('/model') || (!msg.startsWith('/') && /\b(ganti|ubah|switch|balikin|kembali|balik)\b.*\b(model|gpt|gemini|groq|llama)\b/.test(msg)),
    execute: async (ctx, deps) => {
        const msg = ctx.message.trim().toLowerCase();
        const parts = msg.split(/\s+/);
        let target = ['codex', 'gemini', 'groq'].includes(parts[1]) ? parts[1] : null;
        if (!target) target = parseModelTarget(msg);
        if (target === 'codex' || target === 'groq' || target === 'gemini') {
            ctx.switchModel = target;
            ctx.directReply = '✅ Berhasil! Otak Stella sekarang menggunakan: **' + target.toUpperCase() + '**';
        } else {
            ctx.directReply = '❌ Gunakan: /model codex, /model gemini, atau /model groq';
        }
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};