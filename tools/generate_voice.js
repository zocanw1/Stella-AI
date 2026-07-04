const { EdgeTTS } = require('node-edge-tts');
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

const AUDIO_DIR = path.join(__dirname, '..', 'local_audio');
const TEMP_DIR = path.join(__dirname, '..', 'discord_data', 'voice_temp');
const DEFAULT_VOICE = 'ja-JP-NanamiNeural';

async function generateVoiceFile(text, voiceId, outputPath) {
    const tts = new EdgeTTS({
        voice: voiceId || DEFAULT_VOICE,
        lang: 'ja-JP',
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
        rate: 'default',
        pitch: 'default',
        volume: 'default',
        timeout: 15000
    });
    await tts.ttsPromise(text, outputPath);
    return outputPath;
}

async function generateVoiceBuffer(text, voiceId) {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const tempPath = path.join(TEMP_DIR, `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
    await generateVoiceFile(text, voiceId, tempPath);
    const buffer = fs.readFileSync(tempPath);
    try { fs.unlinkSync(tempPath); } catch (e) {}
    return buffer;
}

function generateVoiceTempPath() {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    return path.join(TEMP_DIR, `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
}

module.exports = {
    name: "generate_voice",
    description: "Mengubah teks menjadi voice note audio. Gunakan tool ini jika user meminta Stella berbicara, membacakan sesuatu, atau mengirim pesan suara. Setelah berhasil, gunakan send_media dengan type 'voice' untuk mengirimnya.",
    parameters: {
        type: "OBJECT",
        properties: {
            text: { type: "STRING", description: "Teks yang akan diubah menjadi suara" },
            voiceId: { type: "STRING", description: "ID voice Edge-TTS (default: ja-JP-NanamiNeural untuk suara anime Jepang)" },
            language: { type: "STRING", description: "Kode bahasa (default: id untuk Indonesia, en untuk Inggris) — fallback gTTS" }
        },
        required: ["text"]
    },
    execute: async (args) => {
        try {
            if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

            const voiceId = args.voiceId || DEFAULT_VOICE;
            const filename = `stella_voice_${Date.now()}.mp3`;
            const filePath = path.join(AUDIO_DIR, filename);

            console.log(`[generate_voice] Edge-TTS: "${args.text.substring(0, 50)}..." (voice: ${voiceId})`);

            try {
                await generateVoiceFile(args.text, voiceId, filePath);
                console.log(`[generate_voice] Saved: ${filePath}`);
                return {
                    success: true,
                    type: "voice",
                    filePath: filePath,
                    message: `Voice note berhasil dibuat (${voiceId})`
                };
            } catch (edgeError) {
                console.error('[generate_voice] Edge-TTS failed, fallback to gTTS:', edgeError.message);

                const lang = args.language || 'id';
                return new Promise((resolve) => {
                    const gtts = new gTTS(args.text, lang);
                    gtts.save(filePath, (err) => {
                        if (err) {
                            console.error('[generate_voice] gTTS Error:', err.message);
                            resolve({ success: false, error: err.message });
                            return;
                        }
                        console.log(`[generate_voice] gTTS Saved: ${filePath}`);
                        resolve({
                            success: true,
                            type: "voice",
                            filePath: filePath,
                            message: `Voice note berhasil dibuat (gTTS ${lang})`
                        });
                    });
                });
            }
        } catch (error) {
            console.error('[generate_voice] Error:', error.message);
            return { success: false, error: error.message };
        }
    },
    generateVoiceBuffer,
    generateVoiceFile,
    generateVoiceTempPath,
    DEFAULT_VOICE
};
