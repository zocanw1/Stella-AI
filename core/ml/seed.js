const INTENT_SEEDS = [
    ['join', 'voice_join'], ['join vc', 'voice_join'], ['join voice', 'voice_join'],
    ['masuk voice', 'voice_join'], ['@Stella join', 'voice_join'], ['join dong', 'voice_join'],
    ['join channel', 'voice_join'], ['stella join', 'voice_join'],
    ['leave', 'voice_leave'], ['keluar', 'voice_leave'], ['leave vc', 'voice_leave'],
    ['keluar voice', 'voice_leave'], ['@Stella leave', 'voice_leave'],
    ['hai', 'greeting'], ['halo', 'greeting'], ['hi', 'greeting'],
    ['hai stella', 'greeting'], ['pagi', 'greeting'], ['siang', 'greeting'],
    ['apa kabar', 'question'], ['siapa kamu', 'question'], ['kapan dibuat', 'question'],
    ['bagaimana cara kerja', 'question'], ['apakah kamu bisa', 'question'],
    ['Apakah kamu pernah join organisasi', 'question'], ['bisakah kamu join', 'question'],
    ['Stella tolong join dong', 'voice_join'],
    ['bisa join ke voice?', 'question'], ['bisa join vc?', 'question'],
    ['Stella join ya', 'voice_join'], ['join aja', 'voice_join'],
    ['join organisasi itu sulit', 'conversation'], ['join group', 'conversation'],
];

const EMBEDDING_SEEDS = [
    ['Stella is an AI assistant', 'knowledge_system'],
    ['Memory systems store experiences', 'knowledge_system'],
    ['Knowledge graphs connect concepts', 'knowledge_system'],
    ['Machine learning improves decisions', 'knowledge_system'],
    ['Experience engine converts tasks into skills', 'knowledge_system'],
    ['Planning reduces risk and improves outcomes', 'knowledge_system'],
    ['Reflection identifies patterns in success and failure', 'knowledge_system'],
];

function seedGroundTruth(groundTruth, feedbackEngine) {
    if (!groundTruth) return { seeded: 0 };

    let count = 0;

    for (const [text, label] of INTENT_SEEDS) {
        const sample = groundTruth.addSample(text, label, 'manual', { seed: true, dataset: 'intent_classifier_v1' });
        if (sample) {
            count++;
            if (feedbackEngine && feedbackEngine.deepBrain) {
                try { feedbackEngine.deepBrain.addVerifiedSample(text, label, 'manual', { seed: true }); } catch {}
            }
            if (feedbackEngine && feedbackEngine.intentClassifier) {
                try { feedbackEngine.intentClassifier.addExample(text, label); } catch {}
            }
        }
    }

    for (const [text, label] of EMBEDDING_SEEDS) {
        const sample = groundTruth.addSample(text, label, 'manual', { seed: true, dataset: 'embedding_v1' });
        if (sample) count++;
    }

    if (count > 0) groundTruth.createVersion();

    return { seeded: count, version: groundTruth.meta.version };
}

module.exports = { seedGroundTruth, INTENT_SEEDS, EMBEDDING_SEEDS };
