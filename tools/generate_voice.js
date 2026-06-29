/**
 * 🎙️ GENERATE VOICE — Text-to-Speech via gTTS
 * Mengubah teks menjadi voice note (file audio).
 * Gratis tanpa API key. Menggunakan Google Translate TTS engine.
 */

const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

const AUDIO_DIR = path.join(__dirname, '..', 'local_audio');

module.exports = {
    name: "generate_voice",
    description: "Mengubah teks menjadi voice note audio. Gunakan tool ini jika user meminta Stella berbicara, membacakan sesuatu, atau mengirim pesan suara. Setelah berhasil, gunakan send_media dengan type 'voice' untuk mengirimnya.",
    parameters: {
        type: "OBJECT",
        properties: {
            text: { type: "STRING", description: "Teks yang akan diubah menjadi suara" },
            language: { type: "STRING", description: "Kode bahasa (default: id untuk Indonesia, en untuk Inggris)" }
        },
        required: ["text"]
    },
    execute: async (args) => {
        try {
            if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

            const lang = args.language || 'id';
            const filename = `stella_voice_${Date.now()}.mp3`;
            const filePath = path.join(AUDIO_DIR, filename);

            console.log(`[generate_voice] TTS: "${args.text.substring(0, 50)}..." (lang: ${lang})`);

            return new Promise((resolve, reject) => {
                const gtts = new gTTS(args.text, lang);
                gtts.save(filePath, (err) => {
                    if (err) {
                        console.error('[generate_voice] Error:', err.message);
                        resolve({ success: false, error: err.message });
                        return;
                    }

                    console.log(`[generate_voice] Saved: ${filePath}`);
                    resolve({
                        success: true,
                        type: "voice",
                        filePath: filePath,
                        message: `Voice note berhasil dibuat (${lang})`
                    });
                });
            });
        } catch (error) {
            console.error('[generate_voice] Error:', error.message);
            return { success: false, error: error.message };
        }
    }
};
