const DIRECT_PATTERN = /^(halo|hai|hi)(\s+(stella|kak))?[!?.\s]*$|^(pagi|siang|sore|malam|makasih|terima kasih|ok|oke|iya|ya|gak apa apa|nggak apa apa)[!?.\s]*$/i;
const TOOL_PATTERN = /\b(baca|lihat|cek|list|daftar|file|folder|tulis|buatkan file|ubah file|edit|jalankan|run|terminal|command|download|screenshot|kirim gambar|buat gambar|voice note)\b/i;
const RESEARCH_PATTERN = /\b(terbaru|update|berita|news|cari di web|cari internet|sumber|link|referensi|harga hari ini|jadwal hari ini)\b/i;
const COMPLEX_PATTERN = /\b(analisis|bedah|debug|perbaiki|bandingkan|rancang|strategi|langkah|setelah itu|kemudian|lalu)\b/i;

const ROUTE_LIMITS = {
    direct: 250,
    chat: 500,
    tool: 700,
    research: 800,
    complex: 1200
};

function getOutputLimit(route) {
    return ROUTE_LIMITS[route] || ROUTE_LIMITS.chat;
}

function decideRoute(message = '', ruleIntent = '') {
    const text = message.trim();
    const normalizedIntent = String(ruleIntent || '').toLowerCase();

    if (DIRECT_PATTERN.test(text)) {
        return createDecision('direct', false, false);
    }
    if (TOOL_PATTERN.test(text) || ['command', 'file_op', 'reminder'].includes(normalizedIntent)) {
        return createDecision('tool', false, true);
    }
    if (RESEARCH_PATTERN.test(text) || normalizedIntent === 'search') {
        return createDecision('research', false, true);
    }
    if (!normalizedIntent || text.length > 220 || COMPLEX_PATTERN.test(text)) {
        return createDecision('complex', true, true);
    }
    return createDecision('chat', false, false);
}

function createDecision(route, useDeepBrain, includeTools) {
    return {
        route,
        useDeepBrain,
        includeTools,
        maxOutputTokens: getOutputLimit(route)
    };
}

function textFromHistory(entry) {
    if (typeof entry?.content === 'string') return entry.content;
    if (typeof entry?.parts === 'string') return entry.parts;
    return entry?.parts?.[0]?.text || '';
}

function clip(text = '', maxChars = 0) {
    const value = String(text || '').trim();
    return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function buildPromptBudget({ instruction = '', memory = '', history = [] }) {
    const recent = history.slice(-6);
    const older = history.slice(0, Math.max(0, history.length - recent.length));
    const summaryLines = older.slice(-4).map((entry) => {
        const role = entry.role === 'model' || entry.role === 'assistant' ? 'Stella' : 'Kamu';
        return `${role}: ${clip(textFromHistory(entry), 220)}`;
    }).filter((line) => !line.endsWith(':'));
    const summary = clip(summaryLines.join('\n'), 400);
    const compactHistory = recent.map((entry) => ({
        ...entry,
        parts: [{ text: clip(textFromHistory(entry), 600) }]
    }));
    const compactMemory = clip(memory, 800);
    const compactInstruction = clip(instruction, 3200);
    const promptChars = compactInstruction.length + compactMemory.length + summary.length +
        compactHistory.reduce((total, entry) => total + textFromHistory(entry).length, 0);

    return {
        instruction: compactInstruction,
        memory: compactMemory,
        summary,
        history: compactHistory,
        metrics: {
            promptChars,
            historyMessages: compactHistory.length,
            historyChars: compactHistory.reduce((total, entry) => total + textFromHistory(entry).length, 0),
            memoryChars: compactMemory.length,
            summaryChars: summary.length
        }
    };
}

module.exports = { decideRoute, buildPromptBudget, getOutputLimit };
