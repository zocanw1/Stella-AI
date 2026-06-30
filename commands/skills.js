module.exports = {
    match: (msg) => msg.startsWith('/skills'),
    execute: async (ctx, deps) => {
        ctx.directReply = deps.evolutionSystem.getSkillTreeText();
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};