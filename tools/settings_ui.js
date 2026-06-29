const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'settings.json');

function loadSettings() {
    if (fs.existsSync(SETTINGS_FILE)) {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
    return { default: {} };
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getUserSettings(userId) {
    var settings = loadSettings();
    if (!settings[userId]) {
        settings[userId] = JSON.parse(JSON.stringify(settings.default || {}));
        saveSettings(settings);
    }
    return settings[userId];
}

function updateUserSetting(userId, keyPath, value) {
    var settings = loadSettings();
    if (!settings[userId]) {
        settings[userId] = JSON.parse(JSON.stringify(settings.default || {}));
    }
    var keys = keyPath.split('.');
    var obj = settings[userId];
    for (var i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    saveSettings(settings);
    return settings[userId];
}

function resetUserSettings(userId) {
    var settings = loadSettings();
    if (settings.default) {
        settings[userId] = JSON.parse(JSON.stringify(settings.default));
        saveSettings(settings);
        return settings[userId];
    }
    return null;
}

var SETTINGS_CATEGORIES = {
    model: { title: 'Model AI', description: 'Pilih model AI yang digunakan Stella', icon: 'Robo' },
    personality: { title: 'Personalitas', description: 'Ganti gaya bicara dan karakter Stella', icon: 'Role' },
    notifications: { title: 'Notifikasi', description: 'Pengaturan pengingat dan notifikasi', icon: 'Bell' },
    multimedia: { title: 'Multimedia', description: 'Gambar, voice note, dan media lain', icon: 'Palette' },
    memory: { title: 'Memori & Riwayat', description: 'Pengaturan penyimpanan dan arsip', icon: 'Brain' },
    behavior: { title: 'Perilaku AI', description: 'Fitur otomatis dan kecerdasan', icon: 'Gear' },
    privacy: { title: 'Privasi & Data', description: 'Pengaturan keamanan data', icon: 'Lock' },
    advanced: { title: 'Lanjutan', description: 'Parameter teknis (hati-hati!)', icon: 'Wrench' }
};

var MODEL_OPTIONS = [
    { id: 'gemini', name: 'Gemini (Standar)', desc: 'Google Gemini Flash - seimbang & hemat' },
    { id: 'groq', name: 'Groq / Llama 3.3 (Cepat)', desc: 'Llama 3.3 70B via Groq - super cepat' },
    { id: 'codex', name: 'Codex / GPT (Natural)', desc: 'Mode natural, cocok coding & chat' },
    { id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek Chat - reasoning kuat' }
];

var PERSONALITY_OPTIONS = [
    { id: 'stella_default', name: 'Stella Default', desc: 'Profesional, santai, solutif' },
    { id: 'stella_tsundere', name: 'Stella Tsundere', desc: 'Cuek tapi sayang, lucu & genit' },
    { id: 'stella_backup_lengkap', name: 'Stella Backup Lengkap', desc: 'Versi lengkap dengan semua fitur' }
];

function getModelName(id) {
    var m = MODEL_OPTIONS.find(function(x) { return x.id === id; });
    return m ? m.name : id;
}

function getPersonalityName(id) {
    var p = PERSONALITY_OPTIONS.find(function(x) { return x.id === id; });
    return p ? p.name : id;
}

function buildMainMenu(userId) {
    var userSettings = getUserSettings(userId);
    var text = '--- PENGATURAN STELLA ---\n\n';
    text += 'Pilih kategori di bawah untuk mengubah pengaturan:\n\n';
    text += 'Model: ' + getModelName(userSettings.model) + '\n';
    text += 'Personalitas: ' + getPersonalityName(userSettings.personality) + '\n';
    text += 'Bahasa: ' + userSettings.language.toUpperCase() + '\n';

    var keyboard = {
        inline_keyboard: [
            [
                { text: 'Model AI', callback_data: 'settings_cat_model' },
                { text: 'Personalitas', callback_data: 'settings_cat_personality' }
            ],
            [
                { text: 'Notifikasi', callback_data: 'settings_cat_notifications' },
                { text: 'Multimedia', callback_data: 'settings_cat_multimedia' }
            ],
            [
                { text: 'Memori & Riwayat', callback_data: 'settings_cat_memory' },
                { text: 'Perilaku AI', callback_data: 'settings_cat_behavior' }
            ],
            [
                { text: 'Privasi & Data', callback_data: 'settings_cat_privacy' },
                { text: 'Lanjutan', callback_data: 'settings_cat_advanced' }
            ],
            [
                { text: 'Reset ke Default', callback_data: 'settings_reset_confirm' },
                { text: 'Tutup', callback_data: 'settings_close' }
            ]
        ]
    };

    return { text: text, keyboard: keyboard };
}

function buildCategoryMenu(userId, category) {
    var userSettings = getUserSettings(userId);
    var cat = SETTINGS_CATEGORIES[category];
    if (!cat) return { text: 'Kategori tidak ditemukan', keyboard: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'settings_main' }]] } };

    var text = cat.icon + ' ' + cat.title + '\n\n' + cat.description + '\n\n';
    var keyboard = { inline_keyboard: [] };

    switch (category) {
        case 'model': {
            text += 'Model saat ini: ' + getModelName(userSettings.model) + '\n\n';
            var rows = [];
            for (var i = 0; i < MODEL_OPTIONS.length; i += 2) {
                var row = MODEL_OPTIONS.slice(i, i + 2).map(function(m) {
                    var prefix = m.id === userSettings.model ? '[x] ' : '[ ] ';
                    return { text: prefix + m.name, callback_data: 'settings_set_model_' + m.id };
                });
                rows.push(row);
            }
            keyboard.inline_keyboard = rows;
            break;
        }
        case 'personality': {
            text += 'Personalitas saat ini: ' + getPersonalityName(userSettings.personality) + '\n\n';
            var rows = [];
            for (var i = 0; i < PERSONALITY_OPTIONS.length; i += 2) {
                var row = PERSONALITY_OPTIONS.slice(i, i + 2).map(function(p) {
                    var prefix = p.id === userSettings.personality ? '[x] ' : '[ ] ';
                    return { text: prefix + p.name, callback_data: 'settings_set_personality_' + p.id };
                });
                rows.push(row);
            }
            keyboard.inline_keyboard = rows;
            break;
        }
        case 'notifications': {
            var n = userSettings.notifications;
            text += 'Status: ' + (n.enabled ? 'Aktif' : 'Nonaktif') + '\n\n';
            keyboard.inline_keyboard = [
                [{ text: (n.enabled ? '[x]' : '[ ]') + ' ' + (n.enabled ? 'Nonaktifkan' : 'Aktifkan') + ' Semua', callback_data: 'settings_toggle_notifications_enabled' }],
                [{ text: (n.reminders ? '[x]' : '[ ]') + ' Pengingat (Reminders)', callback_data: 'settings_toggle_notifications_reminders' }],
                [{ text: (n.daily_summary ? '[x]' : '[ ]') + ' Ringkasan Harian', callback_data: 'settings_toggle_notifications_daily_summary' }],
                [{ text: (n.learning_updates ? '[x]' : '[ ]') + ' Update Pembelajaran', callback_data: 'settings_toggle_notifications_learning_updates' }],
            ];
            break;
        }
        case 'multimedia': {
            var m = userSettings.multimedia;
            keyboard.inline_keyboard = [
                [{ text: (m.auto_send_images ? '[x]' : '[ ]') + ' Kirim Otomatis Gambar', callback_data: 'settings_toggle_multimedia_auto_send_images' }],
                [{ text: (m.auto_send_voice ? '[x]' : '[ ]') + ' Kirim Otomatis Voice', callback_data: 'settings_toggle_multimedia_auto_send_voice' }],
                [
                    { text: 'Kualitas Gambar: ' + m.image_quality, callback_data: 'settings_cycle_multimedia_image_quality' },
                    { text: 'Kecepatan Voice: ' + m.voice_speed + 'x', callback_data: 'settings_cycle_multimedia_voice_speed' }
                ],
            ];
            break;
        }
        case 'memory': {
            var mem = userSettings.memory;
            keyboard.inline_keyboard = [
                [{ text: (mem.auto_save_facts ? '[x]' : '[ ]') + ' Simpan Otomatis Fakta', callback_data: 'settings_toggle_memory_auto_save_facts' }],
                [{ text: (mem.daily_archive ? '[x]' : '[ ]') + ' Arsip Harian', callback_data: 'settings_toggle_memory_daily_archive' }],
                [{ text: (mem.brain_markdown ? '[x]' : '[ ]') + ' Brain Markdown', callback_data: 'settings_toggle_memory_brain_markdown' }],
                [{ text: 'Max History: ' + mem.max_history, callback_data: 'settings_cycle_memory_max_history' }],
            ];
            break;
        }
        case 'behavior': {
            var b = userSettings.behavior;
            keyboard.inline_keyboard = [
                [{ text: (b.auto_research ? '[x]' : '[ ]') + ' Auto Research Web', callback_data: 'settings_toggle_behavior_auto_research' }],
                [{ text: (b.deep_brain ? '[x]' : '[ ]') + ' Deep Brain', callback_data: 'settings_toggle_behavior_deep_brain' }],
                [{ text: (b.self_reflection ? '[x]' : '[ ]') + ' Self Reflection (6 jam)', callback_data: 'settings_toggle_behavior_self_reflection' }],
                [{ text: (b.evolution_tracking ? '[x]' : '[ ]') + ' Evolution Tracking', callback_data: 'settings_toggle_behavior_evolution_tracking' }],
                [{ text: (b.feedback_buttons ? '[x]' : '[ ]') + ' Tombol Feedback', callback_data: 'settings_toggle_behavior_feedback_buttons' }],
            ];
            break;
        }
        case 'privacy': {
            var p = userSettings.privacy;
            keyboard.inline_keyboard = [
                [{ text: (p.log_conversations ? '[x]' : '[ ]') + ' Log Percakapan', callback_data: 'settings_toggle_privacy_log_conversations' }],
                [{ text: (p.analytics ? '[x]' : '[ ]') + ' Analytics Anonim', callback_data: 'settings_toggle_privacy_analytics' }],
                [{ text: (p.share_data ? '[x]' : '[ ]') + ' Berbagi Data', callback_data: 'settings_toggle_privacy_share_data' }],
            ];
            break;
        }
        case 'advanced': {
            var a = userSettings.advanced;
            keyboard.inline_keyboard = [
                [{ text: 'Max Output Tokens: ' + a.max_output_tokens, callback_data: 'settings_cycle_advanced_max_output_tokens' }],
                [{ text: 'Temperature: ' + a.temperature, callback_data: 'settings_cycle_advanced_temperature' }],
                [{ text: 'Tool Timeout: ' + (a.tool_timeout / 1000) + 's', callback_data: 'settings_cycle_advanced_tool_timeout' }],
                [{ text: 'Rate Limit: ' + a.rate_limit + '/5detik', callback_data: 'settings_cycle_advanced_rate_limit' }],
            ];
            break;
        }
    }

    keyboard.inline_keyboard.push([{ text: 'Kembali ke Menu Utama', callback_data: 'settings_main' }]);
    return { text: text, keyboard: keyboard };
}

function handleSettingsCallback(userId, callbackData) {
    var userSettings = getUserSettings(userId);

    if (callbackData === 'settings_main') {
        return buildMainMenu(userId);
    }

    if (callbackData.startsWith('settings_cat_')) {
        var category = callbackData.replace('settings_cat_', '');
        return buildCategoryMenu(userId, category);
    }

    if (callbackData === 'settings_reset_confirm') {
        return {
            text: 'PERINGATAN: Yakin ingin mereset semua pengaturan ke default? Tindakan ini tidak bisa dibatalkan.',
            keyboard: {
                inline_keyboard: [
                    [{ text: 'Ya, Reset Semua', callback_data: 'settings_reset_execute' }],
                    [{ text: 'Batal', callback_data: 'settings_main' }]
                ]
            }
        };
    }

    if (callbackData === 'settings_reset_execute') {
        resetUserSettings(userId);
        return {
            text: 'Pengaturan berhasil direset ke default!',
            keyboard: { inline_keyboard: [[{ text: 'Kembali ke Menu', callback_data: 'settings_main' }]] }
        };
    }

    if (callbackData === 'settings_close') {
        return { text: 'Menu pengaturan ditutup. Ketik /settings untuk membuka lagi.', keyboard: { inline_keyboard: [] } };
    }

    // Model selection
    if (callbackData.startsWith('settings_set_model_')) {
        var modelId = callbackData.replace('settings_set_model_', '');
        var model = MODEL_OPTIONS.find(function(x) { return x.id === modelId; });
        if (model) {
            updateUserSetting(userId, 'model', modelId);
            return {
                text: 'Model diubah ke: ' + model.name + '\n\n' + model.desc,
                keyboard: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'settings_cat_model' }]] }
            };
        }
    }

    // Personality selection
    if (callbackData.startsWith('settings_set_personality_')) {
        var personalityId = callbackData.replace('settings_set_personality_', '');
        var personality = PERSONALITY_OPTIONS.find(function(x) { return x.id === personalityId; });
        if (personality) {
            updateUserSetting(userId, 'personality', personalityId);
            return {
                text: 'Personalitas diubah ke: ' + personality.name + '\n\n' + personality.desc,
                keyboard: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'settings_cat_personality' }]] }
            };
        }
    }

    // Toggle handlers
    var toggleMap = {
        'settings_toggle_notifications_enabled': 'notifications.enabled',
        'settings_toggle_notifications_reminders': 'notifications.reminders',
        'settings_toggle_notifications_daily_summary': 'notifications.daily_summary',
        'settings_toggle_notifications_learning_updates': 'notifications.learning_updates',
        'settings_toggle_multimedia_auto_send_images': 'multimedia.auto_send_images',
        'settings_toggle_multimedia_auto_send_voice': 'multimedia.auto_send_voice',
        'settings_toggle_memory_auto_save_facts': 'memory.auto_save_facts',
        'settings_toggle_memory_daily_archive': 'memory.daily_archive',
        'settings_toggle_memory_brain_markdown': 'memory.brain_markdown',
        'settings_toggle_behavior_auto_research': 'behavior.auto_research',
        'settings_toggle_behavior_deep_brain': 'behavior.deep_brain',
        'settings_toggle_behavior_self_reflection': 'behavior.self_reflection',
        'settings_toggle_behavior_evolution_tracking': 'behavior.evolution_tracking',
        'settings_toggle_behavior_feedback_buttons': 'behavior.feedback_buttons',
        'settings_toggle_privacy_log_conversations': 'privacy.log_conversations',
        'settings_toggle_privacy_analytics': 'privacy.analytics',
        'settings_toggle_privacy_share_data': 'privacy.share_data',
    };

    if (toggleMap[callbackData]) {
        var keyPath = toggleMap[callbackData];
        var currentValue = keyPath.split('.').reduce(function(obj, k) { return obj ? obj[k] : undefined; }, userSettings);
        updateUserSetting(userId, keyPath, !currentValue);
        var category = keyPath.split('.')[0];
        return buildCategoryMenu(userId, category);
    }

    // Cycle handlers
    var cycleHandlers = {
        'settings_cycle_multimedia_image_quality': {
            key: 'multimedia.image_quality',
            options: ['low', 'medium', 'high'],
            category: 'multimedia'
        },
        'settings_cycle_multimedia_voice_speed': {
            key: 'multimedia.voice_speed',
            options: [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
            category: 'multimedia'
        },
        'settings_cycle_memory_max_history': {
            key: 'memory.max_history',
            options: [10, 20, 30, 40, 50, 80, 100],
            category: 'memory'
        },
        'settings_cycle_advanced_max_output_tokens': {
            key: 'advanced.max_output_tokens',
            options: [512, 1024, 2048, 4096, 8192],
            category: 'advanced'
        },
        'settings_cycle_advanced_temperature': {
            key: 'advanced.temperature',
            options: [0.1, 0.3, 0.5, 0.7, 0.9, 1.0, 1.2],
            category: 'advanced'
        },
        'settings_cycle_advanced_tool_timeout': {
            key: 'advanced.tool_timeout',
            options: [10000, 20000, 30000, 45000, 60000, 90000, 120000],
            category: 'advanced'
        },
        'settings_cycle_advanced_rate_limit': {
            key: 'advanced.rate_limit',
            options: [3, 5, 8, 10, 15, 20],
            category: 'advanced'
        },
    };

    if (cycleHandlers[callbackData]) {
        var handler = cycleHandlers[callbackData];
        var currentValue = handler.key.split('.').reduce(function(obj, k) { return obj ? obj[k] : undefined; }, userSettings);
        var currentIndex = handler.options.indexOf(currentValue);
        var nextIndex = (currentIndex + 1) % handler.options.length;
        var nextValue = handler.options[nextIndex];
        updateUserSetting(userId, handler.key, nextValue);
        return buildCategoryMenu(userId, handler.category);
    }

    return buildMainMenu(userId);
}

function applySettingsToContext(userId, context) {
    var userSettings = getUserSettings(userId);
    context.userSettings = userSettings;
    if (context.routeDecision && userSettings.advanced) {
        context.routeDecision.maxOutputTokens = userSettings.advanced.max_output_tokens || 2048;
    }
    return context;
}

function getSettingsText(userId) {
    var userSettings = getUserSettings(userId);
    var text = '--- PENGATURAN SAAT INI ---\n\n';
    text += 'Model: ' + getModelName(userSettings.model) + '\n';
    text += 'Personalitas: ' + getPersonalityName(userSettings.personality) + '\n';
    text += 'Bahasa: ' + userSettings.language.toUpperCase() + '\n\n';
    text += 'Notifikasi: ' + (userSettings.notifications.enabled ? 'Aktif' : 'Nonaktif') + '\n';
    text += 'Auto Kirim Gambar: ' + (userSettings.multimedia.auto_send_images ? 'Ya' : 'Tidak') + '\n';
    text += 'Auto Kirim Voice: ' + (userSettings.multimedia.auto_send_voice ? 'Ya' : 'Tidak') + '\n';
    text += 'Auto Simpan Fakta: ' + (userSettings.memory.auto_save_facts ? 'Ya' : 'Tidak') + '\n';
    text += 'Auto Research: ' + (userSettings.behavior.auto_research ? 'Ya' : 'Tidak') + '\n';
    text += 'Deep Brain: ' + (userSettings.behavior.deep_brain ? 'Ya' : 'Tidak') + '\n';
    text += 'Self Reflection: ' + (userSettings.behavior.self_reflection ? 'Ya' : 'Tidak') + '\n\n';
    text += 'Ketik /settings untuk membuka menu interaktif.';
    return text;
}

module.exports = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    getUserSettings: getUserSettings,
    updateUserSetting: updateUserSetting,
    resetUserSettings: resetUserSettings,
    buildMainMenu: buildMainMenu,
    buildCategoryMenu: buildCategoryMenu,
    handleSettingsCallback: handleSettingsCallback,
    applySettingsToContext: applySettingsToContext,
    getSettingsText: getSettingsText,
    SETTINGS_CATEGORIES: SETTINGS_CATEGORIES,
    MODEL_OPTIONS: MODEL_OPTIONS,
    PERSONALITY_OPTIONS: PERSONALITY_OPTIONS
};