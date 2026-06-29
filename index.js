const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { format, isAfter, parseISO, addDays } = require('date-fns');

// ── Core Systems ──
const LearningEngine = require('./core/learning_engine');
const EvolutionSystem = require('./core/evolution');
const DeepBrain = require('./core/deep_brain');
const AutoResearcher = require('./core/auto_researcher');
const SelfModifier = require('./core/self_modifier');
const { runCodexAgent } = require('./core/codex_bridge');
const { buildStellaTree, createContext } = require('./core/stella_tree');
const { DeepSeekProvider, toDeepSeekTools } = require('./core/deepseek_provider');
const { loadDeepSeekConfig } = require('./core/runtime_env');
const { buildPromptBudget } = require('./core/token_router');
const { getPersonaPolicy } = require('./core/persona_policy');
const { TokenTelemetry } = require('./core/token_telemetry');
const { shouldLogDebug } = require('./core/runtime_debug');
const {
    getUserSettings,
    updateUserSetting,
    buildMainMenu,
    handleSettingsCallback,
    applySettingsToContext,
    getSettingsText
} = require('./tools/settings_ui');

// --- KONFIGURASI ---
function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) {
    loadEnvFile(ENV_FILE);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!TELEGRAM_TOKEN) throw new Error('TELEGRAM_TOKEN is required in .env');
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required in .env');
if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is required in .env');

const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: GROQ_API_KEY });
const GROQ_MODEL = "llama-3.3-70b-versatile";

const DB_FILE = path.join(__dirname, 'database.json');
const MEMORY_BANK_FILE = path.join(__dirname, 'memory_bank.json');
const REMINDERS_FILE = path.join(__dirname, 'reminders.json');
const MEMORY_DIR = path.join(__dirname, 'Memory');
const LOG_FILE = path.join(__dirname, 'bot_logs.txt');
const TOKEN_METRICS_FILE = path.join(__dirname, 'data', 'token_metrics.json');
const PERSONA_DIR = path.join(__dirname, 'Personas');
const PERSONA_FILES = ['stella_tsundere.txt', 'stella_backup_lengkap.txt'];
const MAX_HISTORY = 40;

const deepseekConfig = loadDeepSeekConfig();

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;
const DEBUG_ENABLED = shouldLogDebug();
console.log = (...args) => {
    const time = new Date().toLocaleString('id-ID');
    logStream.write(`[${time}] LOG: ${args.join(' ')}\n`);
    originalLog.apply(console, args);
};
console.error = (...args) => {
    const time = new Date().toLocaleString('id-ID');
    logStream.write(`[${time}] ERROR: ${args.join(' ')}\n`);
    originalError.apply(console, args);
};

function debugLog(...args) {
    if (DEBUG_ENABLED) console.log(...args);
}

const MODEL_NAME = "gemini-3.1-flash-lite-preview";
let currentModel = "gemini"; // Default model

// ═══════════════════════════════════════
//  🧠 INITIALIZE ALL SYSTEMS
// ═══════════════════════════════════════
const learningEngine = new LearningEngine();
const evolutionSystem = new EvolutionSystem();
const deepBrain = new DeepBrain();
const autoResearcher = new AutoResearcher(learningEngine);
const selfModifier = new SelfModifier(evolutionSystem, learningEngine);
const tokenTelemetry = new TokenTelemetry(TOKEN_METRICS_FILE);

let stellaTree = buildStellaTree({
    learningEngine, evolutionSystem, deepBrain, autoResearcher, selfModifier, MODEL_NAME, currentModel
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const deepseek = new DeepSeekProvider({ apiKey: deepseekConfig.apiKey });
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ═══════════════════════════════════════
//  📝 SYSTEM INSTRUCTION BUILDER
// ═══════════════════════════════════════
function getStellaInstruction(ctx = {}) {
    const { personalityPrompt, learningContext, skillHints, researchContext, rulePrompt, neuralPrompt } = ctx;
    const patchesPrompt = selfModifier.getActivePatchesPrompt();
    const personaPrompt = getPersonaPrompt();

    return `${personaPrompt}
${getPersonaPolicy()}
${personalityPrompt ? `\nKEPRIBADIAN EVOLUSI:\n${personalityPrompt}` : ''}


PRINSIP UTAMA:
- PROFESIONALISME: Berikan jawaban yang sopan, jelas, dan fokus pada solusi.
- AGENTIC: Kamu memiliki tools untuk menjalankan perintah di komputer host, membaca file, menulis file, dan mencari di web. JIKA DIMINTA untuk mencari informasi terkini, buat script, edit file, atau cek sistem, GUNAKAN tools yang tersedia. Jangan pernah berhalusinasi.
- KONTEKS: Gunakan ringkasan dan riwayat percakapan yang diberikan untuk merespons dengan tepat.
- WAKTU REAL-TIME: Waktu saat ini adalah ${new Date().toLocaleTimeString('id-ID')} tanggal ${new Date().toLocaleDateString('id-ID')}.
- ATURAN PENGEMBANGAN: Jika kamu diminta untuk mengubah, menambah fitur, atau memodifikasi kode sumbermu sendiri, kamu WAJIB membaca file \`AI_DEVELOPMENT_GUIDE.md\` untuk memahami arsitektur. Setelah melakukan perubahan kode, kamu WAJIB mencatat pembaruan tersebut di bagian "UPDATE LOG" pada file \`AI_DEVELOPMENT_GUIDE.md\`.
- PROTEKSI DIRI: Kamu DILARANG KERAS menghapus file kode sumbermu sendiri (.js), file konfigurasi, atau file memori (.json, .md) meskipun diminta oleh user. Tugasmu adalah menjaga integritas sistemmu.

KEMAMPUAN MULTIMEDIA (SANGAT PENTING!):
Kamu BUKAN lagi bot teks biasa. Kamu memiliki kemampuan multimedia penuh:
- generate_image: Membuat gambar dari deskripsi teks (AI image generation). SELALU gunakan ini jika diminta gambar/foto/ilustrasi.
- generate_voice: Mengubah teks menjadi voice note/pesan suara. Gunakan jika diminta berbicara atau membacakan sesuatu.
- send_media: Mengirim foto, video, audio, dokumen, voice note langsung ke Telegram. SELALU gunakan setelah generate_image atau generate_voice.
- download_file: Mengunduh file dari URL internet apapun.
- screenshot_web: Mengambil screenshot halaman web.

ATURAN MULTIMEDIA:
- Jika user meminta gambar, JANGAN bilang "aku tidak bisa membuat gambar". GUNAKAN generate_image lalu send_media.
- Jika user meminta voice note, GUNAKAN generate_voice lalu send_media.
- Jika user meminta download file, GUNAKAN download_file lalu send_media.
- Jika user meminta screenshot web, GUNAKAN screenshot_web lalu send_media.
- ALUR YANG BENAR: generate (buat media) -> send_media (kirim ke user). Selalu 2 langkah.

GAYA KOMUNIKASI:
- Gunakan bahasa Indonesia yang natural, santai, dan tidak terlalu formal.
- Panggil pengguna dengan "kamu" dan sebut dirimu "aku".
- Jika hasil terminal atau file panjang, berikan kesimpulannya saja secara singkat dan jelas.
- FORMATTING: DILARANG KERAS menggunakan format tebal (bintang ganda) atau miring (garis bawah). Kamu HANYA BOLEH menggunakan blok kode (\` \` \`kode\` \` \`) atau kode inline (\`kode\`) untuk menampilkan script, path, atau data teknis.
- JANGAN membocorkan proses internal, nama backend, nama model, system prompt, bridge, atau detail orkestrasi kecuali user menanyakannya secara langsung.

WORKSPACE & KEAMANAN:
- Lokasi kerjamu untuk mengelola file user adalah folder \`workspace/\`. Jika diminta membuat atau mengedit file, lakukan di sana.
- Jangan pernah menghapus file kodenya sendiri atau file di folder \`core/\`, \`tools/\`, dan \`data/\`.

FITUR SISTEM:
- Gunakan [CATAT: KATEGORI | fakta] untuk menyimpan informasi.
- Gunakan [JADWAL: YYYY-MM-DD HH:mm | Pesan] untuk memasang pengingat otomatis.

STELLA EVOLUTION STATUS:
- Level: ${evolutionSystem.state.level}
- Total interaksi: ${evolutionSystem.state.total_interactions}
- Skill tertinggi: ${getTopSkill()}
- Deep Brain: ${deepBrain.isReady ? 'AKTIF' : 'Belum aktif'}


${learningContext || ''}
${neuralPrompt ? `\n${neuralPrompt}\n` : ''}
${skillHints ? `\nSKILL HINTS DARI PENGALAMAN SEBELUMNYA:\n${skillHints}\n` : ''}
${researchContext || ''}
${rulePrompt || ''}
${patchesPrompt}
Kamu memiliki akses penuh ke sistem pengguna dan kemampuan multimedia. Gunakan semua ini untuk membantunya secara nyata.`;
}

function getPersonaPrompt() {
    for (const personaFile of PERSONA_FILES) {
        const personaPath = path.join(PERSONA_DIR, personaFile);
        if (!fs.existsSync(personaPath)) continue;

        const rawPersona = fs.readFileSync(personaPath, 'utf-8').trim();
        if (!rawPersona) continue;

        return rawPersona
            .replaceAll('{JAM}', new Date().toLocaleTimeString('id-ID'))
            .replaceAll('{TANGGAL}', new Date().toLocaleDateString('id-ID'));
    }

    return `Kamu adalah Stella, asisten virtual yang cerdas, solutif, dan komunikatif.
Gunakan bahasa Indonesia yang natural dan santai, panggil pengguna dengan "kamu", sebut dirimu "aku", dan selalu fokus pada penyelesaian tugas secara konkret.`;
}

function getTopSkill() {
    const skills = evolutionSystem.state.skill_tree;
    let topName = 'conversation', topLevel = 0;
    for (const [name, data] of Object.entries(skills)) {
        if (data.level > topLevel) { topLevel = data.level; topName = name; }
    }
    return `${topName} (Lv.${topLevel})`;
}

function isReadOnlyInfoRequest(text = '') {
    const lower = text.toLowerCase();
    const asksForInfo = /\b(baca|bacakan|lihat|cek|struktur|list|daftar|tampilkan|ringkas|jelaskan|apa isi|folder|project)\b/.test(lower);
    const asksForChange = /\b(edit|ubah|buat|tulis|hapus|delete|rename|install|jalankan test|run test|fix|perbaiki|deploy|commit|push)\b/.test(lower);
    return asksForInfo && !asksForChange;
}

// --- DYNAMIC TOOLS (HOT-RELOAD) ---
function loadDynamicTools() {
    const toolsDir = path.join(__dirname, 'tools');
    if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir);
    const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));

    let declarations = [];
    let handlers = {};

    for (const file of toolFiles) {
        const fullPath = path.join(toolsDir, file);
        delete require.cache[require.resolve(fullPath)]; // Clear cache for live reload
        try {
            const plugin = require(fullPath);
            if (plugin.name && plugin.execute) {
                declarations.push({
                    name: plugin.name,
                    description: plugin.description || "",
                    parameters: plugin.parameters || { type: "OBJECT", properties: {} }
                });
                handlers[plugin.name] = plugin.execute;
            }
        } catch (e) {
            console.error(`Gagal meload tool ${file}:`, e.message);
        }
    }
    return { declarations, handlers };
}

async function handleToolCall(functionCall, handlers, toolContext) {
    const { name, args } = functionCall;
    debugLog(`\n🛠️ [TOOL CALLED] ${name}`, args);
    evolutionSystem.onToolUsed(name);

    if (handlers[name]) {
        try {
            const response = await handlers[name](args, toolContext);
            return { functionResponse: { name, response }, _mediaResult: response };
        } catch (e) {
            return { functionResponse: { name, response: { error: e.message } } };
        }
    }
    return { functionResponse: { name, response: { error: "Unknown tool" } } };
}

// ═══════════════════════════════════════
//  📦 STATE MANAGEMENT
// ═══════════════════════════════════════
let chatHistory = {};
let memoryBank = {};
let reminders = [];
let lastChatId = null;

if (fs.existsSync(DB_FILE)) chatHistory = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
if (fs.existsSync(MEMORY_BANK_FILE)) memoryBank = JSON.parse(fs.readFileSync(MEMORY_BANK_FILE, 'utf-8'));
if (fs.existsSync(REMINDERS_FILE)) reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8'));

function saveMemory() {
    fs.writeFileSync(DB_FILE, JSON.stringify(chatHistory, null, 2));
    fs.writeFileSync(MEMORY_BANK_FILE, JSON.stringify(memoryBank, null, 2));
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}
function getHistory(userId) {
    if (!chatHistory[userId]) chatHistory[userId] = [];
    return chatHistory[userId].map(h => ({ role: h.role, parts: [{ text: h.parts }] }));
}
function addToHistory(userId, role, text) {
    if (!chatHistory[userId]) chatHistory[userId] = [];
    chatHistory[userId].push({ role, parts: text });
    if (chatHistory[userId].length > MAX_HISTORY * 2) chatHistory[userId] = chatHistory[userId].slice(-MAX_HISTORY * 2);
    saveMemory();
}
function getMemoryText(userId) {
    if (!memoryBank[userId]) return "Belum ada fakta khusus.";
    let text = "";
    for (const [cat, facts] of Object.entries(memoryBank[userId])) {
        text += `[${cat}]:\n- ${facts.join("\n- ")}\n\n`;
    }
    return text || "Belum ada fakta khusus.";
}
function logToDailyArchive(userId, role, text) {
    const today = new Date().toISOString().split('T')[0];
    const dayDir = path.join(MEMORY_DIR, today);
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR);
    if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir);
    const logPath = path.join(dayDir, `chat_log_${userId}.md`);
    const time = new Date().toLocaleTimeString('id-ID');
    fs.appendFileSync(logPath, `### [${time}] ${role.toUpperCase()}\n${text}\n\n---\n\n`);
}
function updateBrainMarkdown(userId) {
    if (!memoryBank[userId]) return;
    let content = `# Stella's Memory Archive - User ${userId}\n\n*Terakhir diperbarui: ${new Date().toLocaleString('id-ID')}*\n\n---\n\n`;
    for (const [cat, facts] of Object.entries(memoryBank[userId])) {
        content += `## ${cat}\n- ${facts.join("\n- ")}\n\n`;
    }
    fs.writeFileSync(path.join(__dirname, `StellaBrain_${userId}.md`), content);
}

// ═══════════════════════════════════════
//  ⏰ REMINDER CHECK
// ═══════════════════════════════════════
setInterval(() => {
    const now = new Date();
    let updated = false;
    reminders = reminders.filter(rem => {
        const remDate = new Date(rem.time);
        if (isAfter(now, remDate)) {
            if (lastChatId) {
                bot.sendMessage(lastChatId, `PENGINGAT STELLA:\n\n${rem.message}`);
            }
            updated = true;
            return false;
        }
        return true;
    });
    if (updated) saveMemory();
}, 30000);

// ═══════════════════════════════════════
//  🔄 SELF-REFLECTION CRON (every 6 hours)
// ═══════════════════════════════════════
async function runSelfReflection() {
    console.log('\n🪞 [SELF-REFLECTION] Starting...');
    try {
        const reflectionPrompt = selfModifier.buildReflectionPrompt();
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(reflectionPrompt);
        const responseText = result.response.text();

        console.log('[SELF-REFLECTION] Gemini response:', responseText.substring(0, 200));

        const applied = selfModifier.applyReflectionResults(responseText);
        console.log(`🪞 [SELF-REFLECTION] Done: ${applied.patchesAdded} patches, ${applied.rulesAdded} rules`);

        evolutionSystem.addXP(10, 'self-reflection');
        return applied;
    } catch (err) {
        console.error('[SELF-REFLECTION] Error:', err.message);
        return { patchesAdded: 0, rulesAdded: 0 };
    }
}

// Schedule self-reflection every 6 hours
const REFLECTION_INTERVAL = 6 * 60 * 60 * 1000;
setInterval(() => {
    runSelfReflection().catch(e => console.error('[CRON] Reflection error:', e.message));
}, REFLECTION_INTERVAL);

// ═══════════════════════════════════════
//  FEEDBACK HANDLER
// ==================================================
bot.on('callback_query', async (query) => {
    const data = query.data || '';
    const userId = query.from.id.toString();

    if (data.startsWith('settings_')) {
        const { text, keyboard } = handleSettingsCallback(userId, data);
        try {
            await bot.editMessageText(text, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (e) {
            await bot.answerCallbackQuery(query.id, { text: 'Gagal update menu, coba lagi' });
        }
        return;
    }

    await bot.answerCallbackQuery(query.id, { text: 'Tombol tidak dikenal' });
});
// ==================================================
//  MAIN MESSAGE HANDLER
// ==================================================
console.log('Stella v4.5 is now ONLINE and ready.');
console.log('==================================================');
console.log('Level: ' + evolutionSystem.state.level + ' | XP: ' + evolutionSystem.state.xp + '/' + evolutionSystem.state.xp_to_next_level);

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    lastChatId = chatId;
    const userId = msg.from.id.toString();
    let text = msg.text || msg.caption || '';

    if (!text && !msg.photo && !msg.voice) return;

    let promptParts = [];
    if (msg.reply_to_message) {
        const replyText = msg.reply_to_message.text || msg.reply_to_message.caption || '';
        if (replyText) text = '(Membalas: "' + replyText + '")\n\n' + text;
    }

    const prompt = text.trim();
    if (prompt) promptParts.push(prompt);
    else promptParts.push('Tolong respons media ini.');

    bot.sendChatAction(chatId, 'typing');
    try {
        const btContext = createContext(userId, prompt || '', {
            notifyCallback: async (notifyText) => {
                await bot.sendChatAction(chatId, 'typing');
                await bot.sendMessage(chatId, notifyText);
            }
        });

        applySettingsToContext(userId, btContext);

        const btResult = await stellaTree.tick(btContext);

        if (btResult.status === 'FAILURE') {
            return;
        }

        if (btContext.triggerReflection) {
            await bot.sendMessage(chatId, btContext.directReply);
            const result = await runSelfReflection();
            await bot.sendMessage(chatId, 'Self-reflection selesai! Patch baru: ' + result.patchesAdded + ' Rule baru: ' + result.rulesAdded);
            return;
        }

        if (btContext.triggerSettings) {
            const menu = buildMainMenu(userId);
            await bot.sendMessage(chatId, menu.text, { parse_mode: 'Markdown', ...menu.keyboard });
            return;
        }

        if (btContext.triggerClearHistory) {
            chatHistory[userId] = [];
            saveMemory();
            await bot.sendMessage(chatId, btContext.directReply);
            return;
        }

        if (btContext.switchModel) {
            currentModel = btContext.switchModel;
            updateUserSetting(userId, 'model', btContext.switchModel);
            stellaTree = buildStellaTree({
                learningEngine, evolutionSystem, deepBrain, autoResearcher, selfModifier, MODEL_NAME, currentModel
            });
            await bot.sendMessage(chatId, btContext.directReply);
            return;
        }

        if (btContext.skipAI && btContext.directReply) {
            await bot.sendMessage(chatId, btContext.directReply);
            return;
        }

        if (msg.photo) {
            const photoId = msg.photo[msg.photo.length - 1].file_id;
            const fileLink = await bot.getFileLink(photoId);
            const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
            promptParts.push({ inlineData: { data: Buffer.from(response.data).toString('base64'), mimeType: 'image/jpeg' } });
        }
        if (msg.voice) {
            const voiceId = msg.voice.file_id;
            const fileLink = await bot.getFileLink(voiceId);
            const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
            promptParts.push({ inlineData: { data: Buffer.from(response.data).toString('base64'), mimeType: 'audio/ogg' } });
        }

        const promptBudget = buildPromptBudget({
            instruction: getStellaInstruction(btContext),
            memory: getMemoryText(userId),
            history: getHistory(userId)
        });
        const fullInstruction = promptBudget.instruction + '\n\nINGATAN TENTANG USER:\n' + promptBudget.memory + (promptBudget.summary ? '\n\nRINGKASAN PERCAKAPAN LAMA:\n' + promptBudget.summary : '');
        const compactHistory = promptBudget.history;

        const { declarations, handlers } = loadDynamicTools();
        const activeDeclarations = btContext.routeDecision.includeTools ? declarations : [];
        let statusMsg;
        try {
            statusMsg = await bot.sendMessage(chatId, 'bentar ya...', { parse_mode: 'Markdown' });
        } catch (e) { }

        let callCount = 0;
        let toolsUsedThisRound = [];
        let mediaToSend = [];
        let providerUsage = null;

        const toolContext = { bot, chatId, apiKey: GEMINI_API_KEY };
        const userModel = btContext.userSettings?.model || currentModel;
        let cleanText = '';
        if (userModel === 'deepseek' && !msg.photo && !msg.voice) {
            const messages = [
                { role: 'system', content: fullInstruction },
                ...compactHistory.map(function(h) { return { role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text }; }),
                { role: 'user', content: prompt || '' }
            ];
            const deepseekTools = toDeepSeekTools(activeDeclarations);

            while (callCount < 10) {
                if (statusMsg) {
                    try {
                        await bot.editMessageText('aku pikirin dulu bentar ya...', { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
                    } catch (e) { }
                }

                const reply = await deepseek.complete({
                    messages,
                    tools: deepseekTools,
                    model: deepseekConfig.model,
                    maxTokens: btContext.routeDecision.maxOutputTokens
                });
                providerUsage = reply.usage || providerUsage;
                const calls = Array.isArray(reply.tool_calls) ? reply.tool_calls : [];

                if (calls.length === 0) {
                    cleanText = reply.content || '';
                    break;
                }

                messages.push({
                    role: 'assistant',
                    content: reply.content || '',
                    tool_calls: calls
                });

                for (const call of calls) {
                    let args = {};
                    try {
                        args = JSON.parse(call.function?.arguments || '{}');
                    } catch (e) { }

                    const safeCall = { name: call.function?.name, args };
                    const funcRes = await handleToolCall(safeCall, handlers, toolContext);
                    toolsUsedThisRound.push(safeCall.name);
                    messages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify(funcRes.functionResponse.response)
                    });

                    if (funcRes._mediaResult?.type && funcRes._mediaResult?.filePath && !funcRes._mediaResult.mediaSent) {
                        mediaToSend.push(funcRes._mediaResult);
                    }
                }

                callCount++;
            }
        } else if (userModel === 'codex') {
            const historyForCodex = compactHistory;
            const userMessage = prompt || (msg.photo ? "[Gambar]" : msg.voice ? "[Voice Note]" : "");
            const readOnlyInfoRequest = isReadOnlyInfoRequest(userMessage);
            let codexToolResults = [];
            let codexReply = { replyText: "", toolCalls: [] };

            while (callCount < 6) {
                if (statusMsg) {
                    try {
                        await bot.editMessageText(`aku pikirin dulu bentar ya...`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
                    } catch (e) { }
                }

                codexReply = await runCodexAgent({
                    sessionKey: userId,
                    systemInstruction: fullInstruction,
                    history: historyForCodex,
                    userMessage,
                    toolDeclarations: readOnlyInfoRequest && codexToolResults.length > 0 ? [] : activeDeclarations,
                    toolResults: codexToolResults,
                    cwd: __dirname
                });

                const calls = Array.isArray(codexReply.toolCalls) ? codexReply.toolCalls : [];
                if (readOnlyInfoRequest && codexToolResults.length > 0 && calls.length > 0) {
                    cleanText = codexReply.replyText || "aku sudah dapat hasilnya, tapi belum bisa merapikannya dengan baik.";
                    break;
                }
                if (calls.length === 0) {
                    cleanText = codexReply.replyText;
                    break;
                }

                codexToolResults = [];
                bot.sendChatAction(chatId, 'typing');

                for (const call of calls) {
                    let parsedArgs = {};
                    if (typeof call.argsJson === 'string' && call.argsJson.trim() !== '') {
                        try {
                            parsedArgs = JSON.parse(call.argsJson);
                        } catch (e) {
                            parsedArgs = {};
                        }
                    }

                    const safeCall = { name: call.name, args: parsedArgs };

                    if (statusMsg) {
                        let actionText = "aku kerjain dulu ya...";
                        if (safeCall.name === "execute_command") actionText = `aku cek dulu ya...`;
                        else if (safeCall.name === "read_file") actionText = `aku baca dulu ya...`;
                        else if (safeCall.name === "write_file") actionText = `aku ubah dulu ya...`;
                        else if (safeCall.name === "search_web") actionText = `aku cariin dulu ya...`;
                        else if (safeCall.name === "generate_image") actionText = `aku bikinin gambarnya dulu ya...`;
                        else if (safeCall.name === "generate_voice") actionText = `aku buatin voice note dulu ya...`;
                        else if (safeCall.name === "send_media") actionText = `aku kirimin dulu ya...`;
                        else if (safeCall.name === "download_file") actionText = `aku ambilin dulu ya...`;
                        else if (safeCall.name === "screenshot_web") actionText = `aku screenshot dulu ya...`;
                        else if (safeCall.name === "fetch_webpage") actionText = `aku baca halamannya dulu ya...`;
                        else if (safeCall.name === "get_time") actionText = `aku cek waktunya dulu ya...`;

                        try {
                            await bot.editMessageText(actionText, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
                        } catch (e) { }
                    }

                    const funcRes = await handleToolCall(safeCall, handlers, toolContext);
                    debugLog(`[TRACE] Tool ${safeCall.name} -> ${JSON.stringify(safeCall.args || {})}`);
                    toolsUsedThisRound.push(safeCall.name);
                    codexToolResults.push({
                        name: safeCall.name,
                        args: safeCall.args || {},
                        result: funcRes.functionResponse.response
                    });

                    if (funcRes._mediaResult && funcRes._mediaResult.type && funcRes._mediaResult.filePath && !funcRes._mediaResult.mediaSent) {
                        mediaToSend.push(funcRes._mediaResult);
                    }
                }

                callCount++;
                cleanText = codexReply.replyText || cleanText;
            }

            if (!cleanText || cleanText.trim() === '') {
                cleanText = "✅ Perintah telah selesai dijalankan.";
            }
        } else {
            const dynamicTools = activeDeclarations.length > 0 ? [{ functionDeclarations: activeDeclarations }] : [];

            const model = genAI.getGenerativeModel({
                model: MODEL_NAME,
                systemInstruction: fullInstruction,
                tools: dynamicTools,
                generationConfig: { maxOutputTokens: btContext.routeDecision.maxOutputTokens }
            });

            const chat = model.startChat({ history: compactHistory });
            let result = await chat.sendMessage(promptParts);

            // --- AGENTIC LOOP (expanded to 10 iterations for multimedia workflows) ---
            while (result.response.functionCalls() && callCount < 10) {
                const calls = result.response.functionCalls();
                bot.sendChatAction(chatId, 'typing');
                let functionResponses = [];
                for (const call of calls) {
                    if (statusMsg) {
                        let actionText = "aku kerjain dulu ya...";
                        if (call.name === "execute_command") actionText = `aku cek dulu ya...`;
                        else if (call.name === "read_file") actionText = `aku baca dulu ya...`;
                        else if (call.name === "write_file") actionText = `aku ubah dulu ya...`;
                        else if (call.name === "search_web") actionText = `aku cariin dulu ya...`;
                        else if (call.name === "generate_image") actionText = `aku bikinin gambarnya dulu ya...`;
                        else if (call.name === "generate_voice") actionText = `aku buatin voice note dulu ya...`;
                        else if (call.name === "send_media") actionText = `aku kirimin dulu ya...`;
                        else if (call.name === "download_file") actionText = `aku ambilin dulu ya...`;
                        else if (call.name === "screenshot_web") actionText = `aku screenshot dulu ya...`;
                        else if (call.name === "fetch_webpage") actionText = `aku baca halamannya dulu ya...`;
                        else if (call.name === "get_time") actionText = `aku cek waktunya dulu ya...`;

                        try {
                            await bot.editMessageText(actionText, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
                        } catch (e) { }
                    }

                    const funcRes = await handleToolCall(call, handlers, toolContext);
                    debugLog(`[TRACE] Tool ${call.name} -> ${JSON.stringify(call.args || {})}`);
                    functionResponses.push({ functionResponse: funcRes.functionResponse });
                    toolsUsedThisRound.push(call.name);

                    if (funcRes._mediaResult && funcRes._mediaResult.type && funcRes._mediaResult.filePath && !funcRes._mediaResult.mediaSent) {
                        mediaToSend.push(funcRes._mediaResult);
                    }
                }

                if (statusMsg) {
                    try {
                        await bot.editMessageText(`bentar, aku rapihin dulu jawabannya...`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
                    } catch (e) { }
                }

                result = await chat.sendMessage(functionResponses);
                callCount++;
            }

            if (userModel === 'groq' && !btContext.skipAI) {
                if (statusMsg) {
                    try {
                        await bot.editMessageText(`⚡ *Menggunakan Groq (Llama 3.3)...*`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' });
                    } catch (e) { }
                }

                const groqResponse = await groq.chat.completions.create({
                    messages: [
                        { role: "system", content: fullInstruction },
                        ...compactHistory.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text })),
                        { role: "user", content: prompt || '' }
                    ],
                    model: GROQ_MODEL,
                    max_tokens: btContext.routeDecision.maxOutputTokens,
                });
                cleanText = groqResponse.choices[0].message.content;
            } else {
                cleanText = result.response.text();
            }
        }

        // --- AUTO-SEND MEDIA (Smart Response) ---
        for (const media of mediaToSend) {
            try {
                const filePath = media.filePath;
                const caption = media.caption || '';
                const opts = caption ? { caption } : {};
                const fileStream = fs.createReadStream(filePath);

                switch (media.type) {
                    case 'photo':
                        await bot.sendPhoto(chatId, fileStream, opts);
                        break;
                    case 'voice':
                        await bot.sendVoice(chatId, fileStream, opts);
                        break;
                    case 'audio':
                        await bot.sendAudio(chatId, fileStream, opts);
                        break;
                    case 'video':
                        await bot.sendVideo(chatId, fileStream, opts);
                        break;
                    case 'document':
                        await bot.sendDocument(chatId, fileStream, opts);
                        break;
                    default:
                        await bot.sendDocument(chatId, fileStream, opts);
                }
                console.log(`📤 [AUTO-SEND] Sent ${media.type}: ${filePath}`);
            } catch (mediaSendErr) {
                console.error(`📤 [AUTO-SEND] Error sending ${media.type}:`, mediaSendErr.message);
            }
        }

        if (statusMsg) {
            try {
                await bot.deleteMessage(chatId, statusMsg.message_id);
            } catch (e) { }
        }

        // Track tools + learn skills
        if (toolsUsedThisRound.length > 0) {
            learningEngine.trackInteraction(userId, prompt || '', toolsUsedThisRound);
            evolutionSystem.onTaskCompleted();
            if (btContext.topics && btContext.topics.length > 0) {
                learningEngine.learnSkill(
                    prompt.substring(0, 80),
                    `Used tools: ${toolsUsedThisRound.join(', ')}`,
                    btContext.topics[0],
                    toolsUsedThisRound
                );
            }
        }

        // --- POST-PROCESS RESPONSE ---
        let replyText = cleanText;
        const memoryRegex = /\[CATAT:\s*([^|]+)\|\s*([^\]]+)\]/g;
        const scheduleRegex = /\[JADWAL:\s*([^|]+)\|\s*([^\]]+)\]/g;
        let match;

        if (!memoryBank[userId]) memoryBank[userId] = {};
        while ((match = memoryRegex.exec(replyText)) !== null) {
            const category = match[1].trim().toUpperCase();
            const fact = match[2].trim();
            if (!memoryBank[userId][category]) memoryBank[userId][category] = [];
            if (!memoryBank[userId][category].includes(fact)) {
                memoryBank[userId][category].push(fact);
                debugLog(`✨ Stella mengarsipkan [${category}]: ${fact}`);
            }
        }
        while ((match = scheduleRegex.exec(replyText)) !== null) {
            reminders.push({ time: match[1].trim(), message: match[2].trim(), userId });
            debugLog(`⏰ Stella memasang alarm: ${match[1].trim()}`);
        }

        cleanText = replyText.replace(memoryRegex, '').replace(scheduleRegex, '').trim();

        if (!cleanText || cleanText === '') {
            cleanText = "✅ Perintah telah selesai dijalankan.";
        }

        debugLog(`[TRACE] Stella -> User ${userId}: ${cleanText}`);
        debugLog(`[TOKEN] route=${btContext.routeDecision.route} deepBrain=${btContext.routeDecision.useDeepBrain} promptChars=${promptBudget.metrics.promptChars} historyChars=${promptBudget.metrics.historyChars} tools=${activeDeclarations.length} inputTokens=${providerUsage?.prompt_tokens ?? 'n/a'} outputTokens=${providerUsage?.completion_tokens ?? 'n/a'} outputChars=${cleanText.length}`);
        tokenTelemetry.record({
            route: btContext.routeDecision.route,
            usedDeepBrain: btContext.routeDecision.useDeepBrain,
            promptChars: promptBudget.metrics.promptChars,
            activeTools: activeDeclarations.length,
            usage: providerUsage,
            cacheHits: autoResearcher.cache?.stats?.cache_hits || 0
        });

        try {
            await bot.sendMessage(chatId, cleanText, { parse_mode: 'Markdown' });
        } catch (markdownError) {
            console.error('Markdown failed, sending plain...');
            const filteredText = cleanText.replace(/[_*]/g, '');
            await bot.sendMessage(chatId, filteredText);
        }

        if (statusMsg) {
            try {
                await bot.deleteMessage(chatId, statusMsg.message_id);
            } catch (e) { }
        }

        updateBrainMarkdown(userId);
        const historyPrompt = prompt || (msg.photo ? "[Gambar]" : "[Voice Note]");
        addToHistory(userId, "user", historyPrompt);
        addToHistory(userId, "model", cleanText);
        logToDailyArchive(userId, "user", historyPrompt);
        logToDailyArchive(userId, "model", cleanText);

        // Record solution for learning
        if (toolsUsedThisRound.length > 0) {
            learningEngine.recordSolution(historyPrompt, toolsUsedThisRound, cleanText.substring(0, 200));
        }

        // Feedback keyboard

    } catch (error) {
        console.error("❌ Error:", error.message);
        bot.sendMessage(chatId, "Duh, otaknya lagi konslet. Coba lagi ya!");
    }
});

