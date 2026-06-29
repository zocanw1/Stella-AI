function shouldLogDebug(env = process.env) {
    return env.STELLA_DEBUG === 'true';
}

module.exports = { shouldLogDebug };
