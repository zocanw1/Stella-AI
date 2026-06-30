const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { format, isAfter } = require('date-fns');

const LearningEngine = require('./core/learning_engine');
const EvolutionSystem = require('./core/evolution');
const DeepBrain = require('./core/deep_brain');
const AutoResearcher = require('./core/auto_researcher');
const SelfModifier = require('./core/self_modifier');
const { DeepSeekProvider, toDeepSeekTools } = require('./core/deepseek_provider');
const { loadDeepSeekConfig } = require('./core/runtime_env');
const { buildStellaTree, createContext } = require('./core/stella_tree');
const { buildPromptBudget } = require('./core/token_router');
const { getPersonaPolicy } = require('./core/persona_policy');
const { shouldLogDebug } = require('./core/runtime_debug');

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
        if (!process.env[key]) process.env[key] = value;
    }
}

const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) loadEnvFile(ENV_FILE);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required in .env');

const PERSONA_DIR = path.join(__dirname, 'Personas');
const PERSONA_FILES = ['stella_ramah.txt', 'stella_backup_lengkap.txt'];
const DEBUG_ENABLED = shouldLogDebug();

function debugLog(...args) {
    if (DEBUG_ENABLED) console.log('[Discord]', ...args);
}

const deepseekConfig = loadDeepSeekConfig();
const learningEngine = new LearningEngine();
const evolutionSystem = new EvolutionSystem();
const deepBrain = new DeepBrain();
const autoResearcher = new AutoResearcher(learningEngine);
const selfModifier = new SelfModifier(evolutionSystem, learningEngine);

let stellaTree = buildStellaTree({
    learningEngine, evolutionSystem, deepBrain, autoResearcher, selfModifier, MODEL_NAME: 'deepseek-chat', currentModel: 'deepseek'
});

const deepseek = new DeepSeekProvider({ apiKey: deepseekConfig.apiKey });

const DISCORD_DATA_DIR = path.join(__dirname, 'discord_data');
if (!fs.existsSync(DISCORD_DATA_DIR)) fs.mkdirSync(DISCORD_DATA_DIR, { recursive: true });
const DB_FILE = path.join(DISCORD_DATA_DIR, 'database.json');
const MEMORY_BANK_FILE = path.join(DISCORD_DATA_DIR, 'memory_bank.json');

let chatHistory = {};
let memoryBank = {};

if (fs.existsSync(DB_FILE)) chatHistory = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
if (fs.existsSync(MEMORY_BANK_FILE)) memoryBank = JSON.parse(fs.readFileSync(MEMORY_BANK_FILE, 'utf-8'));

function saveMemory() {
    fs.writeFileSync(DB_FILE, JSON.stringify(chatHistory, null, 2));
    fs.writeFileSync(MEMORY_BANK_FILE, JSON.stringify(memoryBank, null, 2));
}

function getHistory(channelId) {
    if (!chatHistory[channelId]) chatHistory[channelId] = [];
    return chatHistory[channelId].map(function(h) { return { role: h.role, parts: [{ text: h.parts }] }; });
}

function addToHistory(channelId, role, text) {
    if (!chatHistory[channelId]) chatHistory[channelId] = [];
    chatHistory[channelId].push({ role, parts: text });
    if (chatHistory[channelId].length > 80) chatHistory[channelId] = chatHistory[channelId].slice(-80);
    saveMemory();
}

function getMemoryText(channelId) {
    if (!memoryBank[channelId]) return 'Belum ada catatan untuk channel ini.';
    let text = '';
    for (const [cat, facts] of Object.entries(memoryBank[channelId])) {
        text += '[' + cat + ']:\n- ' + facts.join('\n- ') + '\n\n';
    }
    return text || 'Belum ada catatan untuk channel ini.';
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
    return 'Kamu adalah Stella, asisten virtual yang cerdas, solutif, dan komunikatif. Gunakan bahasa Indonesia yang natural dan santai, panggil pengguna dengan "kamu", sebut dirimu "aku", dan selalu fokus pada penyelesaian tugas secara konkret.';
}

function getStellaInstruction(ctx) {
    const { personalityPrompt, learningContext, skillHints, researchContext, neuralPrompt } = ctx;
    const patchesPrompt = selfModifier.getActivePatchesPrompt();

    return getPersonaPrompt() + '\n' + getPersonaPolicy() + '\n' +
        (personalityPrompt ? '\nKEPRIBADIAN EVOLUSI:\n' + personalityPrompt : '') + '\n\n' +
        'PRINSIP UTAMA:\n' +
        '- PROFESIONALISME: Berikan jawaban yang sopan, jelas, dan fokus pada solusi.\n' +
        '- AGENTIC: Kamu memiliki tools untuk menjalankan perintah, membaca file, menulis file, dan mencari di web. JIKA DIMINTA, GUNAKAN tools yang tersedia.\n' +
        '- KONTEKS: Gunakan ringkasan dan riwayat percakapan yang diberikan untuk merespons dengan tepat.\n' +
        '- WAKTU REAL-TIME: Waktu saat ini adalah ' + new Date().toLocaleTimeString('id-ID') + ' tanggal ' + new Date().toLocaleDateString('id-ID') + '.\n\n' +
        'KEMAMPUAN MULTIMEDIA:\n' +
        '- generate_image: Membuat gambar dari deskripsi teks.\n' +
        '- generate_voice: Mengubah teks menjadi voice note.\n' +
        '- send_media: Mengirim file media. Gunakan setelah generate_image atau generate_voice.\n' +
        '- download_file: Mengunduh file dari URL internet.\n' +
        '- screenshot_web: Mengambil screenshot halaman web.\n\n' +
        'GAYA KOMUNIKASI:\n' +
        '- Gunakan bahasa Indonesia yang natural dan santai.\n' +
        '- Panggil pengguna dengan "kamu" dan sebut dirimu "aku".\n' +
        '- DILARANG menggunakan format tebal (bintang ganda) atau miring (garis bawah). Hanya boleh pakai blok kode (```kode```) atau kode inline (`kode`).\n\n' +
        'FITUR SISTEM:\n' +
        '- Gunakan [CATAT: KATEGORI | fakta] untuk menyimpan informasi.\n' +
        '- Gunakan [JADWAL: YYYY-MM-DD HH:mm | Pesan] untuk memasang pengingat.\n\n' +
        'STELLA EVOLUTION STATUS:\n' +
        '- Level: ' + evolutionSystem.state.level + '\n' +
        '- Total interaksi: ' + evolutionSystem.state.total_interactions + '\n' +
        (learningContext || '') + '\n' +
        (neuralPrompt ? '\n' + neuralPrompt + '\n' : '') +
        (skillHints ? '\nSKILL HINTS:\n' + skillHints + '\n' : '') +
        (researchContext || '') + '\n' +
        (patchesPrompt || '');
}

function loadDynamicTools() {
    const toolsDir = path.join(__dirname, 'tools');
    if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir);
    const toolFiles = fs.readdirSync(toolsDir).filter(function(f) { return f.endsWith('.js'); });
    let declarations = [];
    let handlers = {};
    for (const file of toolFiles) {
        const fullPath = path.join(toolsDir, file);
        delete require.cache[require.resolve(fullPath)];
        try {
            const plugin = require(fullPath);
            if (plugin.name && plugin.execute) {
                declarations.push({
                    name: plugin.name,
                    description: plugin.description || '',
                    parameters: plugin.parameters || { type: 'OBJECT', properties: {} }
                });
                handlers[plugin.name] = plugin.execute;
            }
        } catch (e) {
            console.error('[Discord] Gagal load tool ' + file + ':', e.message);
        }
    }
    return { declarations, handlers };
}

async function handleToolCall(functionCall, handlers, toolContext) {
    const { name, args } = functionCall;
    debugLog('[TOOL CALLED]', name, args);
    evolutionSystem.onToolUsed(name);
    if (handlers[name]) {
        try {
            const response = await handlers[name](args, toolContext);
            return { functionResponse: { name, response }, _mediaResult: response };
        } catch (e) {
            return { functionResponse: { name, response: { error: e.message } } };
        }
    }
    return { functionResponse: { name, response: { error: 'Unknown tool' } } };
}

const voiceConnections = {};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.mentions.has(client.user)) return;

    let text = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!text) text = 'halo';

    const lowerText = text.toLowerCase();
    const wantsJoin = /\bjoin\b/.test(lowerText);
    const wantsLeave = /\b(leave|keluar)\b/.test(lowerText);

    if (wantsJoin) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            await message.channel.send('Kamu harus di voice channel dulu.');
            return;
        }
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
        voiceConnections[voiceChannel.guild.id] = connection;
        await message.channel.send('Udah masuk voice. Kalo mau disuruh keluar, bilang aja `@Stella leave`.');
        return;
    }

    if (wantsLeave) {
        const connection = getVoiceConnection(message.guild.id);
        if (connection) {
            connection.destroy();
            delete voiceConnections[message.guild.id];
            await message.channel.send('Udah keluar dari voice.');
        } else {
            await message.channel.send('Aku gak ada di voice channel.');
        }
        return;
    }

    const channelId = message.channel.id;
    await message.channel.sendTyping();

    try {
        const btContext = createContext(channelId, text, {
            notifyCallback: async function(notifText) {
                await message.channel.sendTyping();
                await message.channel.send(notifText);
            }
        });

        await stellaTree.tick(btContext);

        if (btContext.status === 'FAILURE') return;
        if (btContext.skipAI && btContext.directReply) {
            await message.channel.send(btContext.directReply);
            return;
        }

        const promptBudget = buildPromptBudget({
            instruction: getStellaInstruction(btContext),
            memory: getMemoryText(channelId),
            history: getHistory(channelId)
        });
        const fullInstruction = promptBudget.instruction + '\n\nINGATAN TENTANG CHANNEL INI:\n' + promptBudget.memory + (promptBudget.summary ? '\n\nRINGKASAN PERCAKAPAN LAMA:\n' + promptBudget.summary : '');
        const compactHistory = promptBudget.history;

        const { declarations, handlers } = loadDynamicTools();
        const activeDeclarations = btContext.routeDecision.includeTools ? declarations : [];

        let callCount = 0;
        let toolsUsedThisRound = [];
        let mediaToSend = [];
        let cleanText = '';

        const toolContext = { apiKey: process.env.GEMINI_API_KEY };

        const messages = [
            { role: 'system', content: fullInstruction },
            ...compactHistory.map(function(h) { return { role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text }; }),
            { role: 'user', content: text }
        ];
        const deepseekTools = toDeepSeekTools(activeDeclarations);

        let statusMsg = null;
        try {
            statusMsg = await message.channel.send('Stella mikir dulu ya...');
        } catch (e) {}

        while (callCount < 10) {
            if (statusMsg) {
                try { await statusMsg.edit('Stella mikir dulu ya...'); } catch (e) {}
            }

            const reply = await deepseek.complete({
                messages,
                tools: deepseekTools,
                model: deepseekConfig.model,
                maxTokens: btContext.routeDecision.maxOutputTokens
            });

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
                try { args = JSON.parse(call.function?.arguments || '{}'); } catch (e) {}

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

        if (statusMsg) {
            try { await statusMsg.delete(); } catch (e) {}
        }

        for (const media of mediaToSend) {
            try {
                const filePath = media.filePath;
                const caption = media.caption || '';
                const opts = { files: [filePath] };
                if (caption) opts.content = caption;
                await message.channel.send(opts);
                debugLog('[MEDIA SENT]', media.type, filePath);
            } catch (err) {
                debugLog('[MEDIA ERROR]', err.message);
            }
        }

        let replyText = cleanText;
        const memoryRegex = /\[CATAT:\s*([^|]+)\|\s*([^\]]+)\]/g;
        const scheduleRegex = /\[JADWAL:\s*([^|]+)\|\s*([^\]]+)\]/g;
        let match;

        if (!memoryBank[channelId]) memoryBank[channelId] = {};
        while ((match = memoryRegex.exec(replyText)) !== null) {
            const category = match[1].trim().toUpperCase();
            const fact = match[2].trim();
            if (!memoryBank[channelId][category]) memoryBank[channelId][category] = [];
            if (!memoryBank[channelId][category].includes(fact)) {
                memoryBank[channelId][category].push(fact);
            }
        }

        cleanText = replyText.replace(memoryRegex, '').replace(scheduleRegex, '').trim();
        if (!cleanText) cleanText = 'Selesai.';

        await message.channel.send(cleanText);

        if (toolsUsedThisRound.length > 0) {
            learningEngine.trackInteraction(channelId, text, toolsUsedThisRound);
            evolutionSystem.onTaskCompleted();
        }

        addToHistory(channelId, 'user', text);
        addToHistory(channelId, 'model', cleanText);

    } catch (error) {
        console.error('[Discord] Error:', error.message);
        try {
            await message.channel.send('Maaf, aku error. Coba lagi ya.');
        } catch (e) {}
    }
});

client.once('ready', () => {
    console.log('[Discord] Stella Discord bot siap di tag @Stella di server!');
    console.log('[Discord] Level:', evolutionSystem.state.level, '| XP:', evolutionSystem.state.xp + '/' + evolutionSystem.state.xp_to_next_level);
});

client.login(DISCORD_TOKEN);
