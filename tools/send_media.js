/**
 * 📤 SEND MEDIA — Universal Media Sender for Telegram
 * Mengirim foto, video, audio, dokumen, voice note ke user Telegram.
 * Tool ini membutuhkan bot instance yang diinject dari index.js.
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    name: "send_media",
    description: "Mengirim file media (gambar, video, audio, dokumen, voice note) ke user di Telegram. Gunakan setelah generate_image, generate_voice, download_file, atau untuk mengirim file yang sudah ada di komputer.",
    parameters: {
        type: "OBJECT",
        properties: {
            filePath: { type: "STRING", description: "Path absolut ke file yang akan dikirim" },
            mediaType: { type: "STRING", description: "Tipe media: photo, video, audio, document, voice, sticker" },
            caption: { type: "STRING", description: "Caption/keterangan yang menyertai media (opsional)" }
        },
        required: ["filePath", "mediaType"]
    },
    execute: async (args, context) => {
        try {
            const filePath = path.resolve(args.filePath);
            
            if (!fs.existsSync(filePath)) {
                return { success: false, error: `File tidak ditemukan: ${filePath}` };
            }

            // bot dan chatId diinject dari index.js
            const bot = context?.bot;
            const chatId = context?.chatId;

            if (!bot || !chatId) {
                return { 
                    success: true, 
                    type: args.mediaType,
                    filePath: filePath,
                    caption: args.caption || '',
                    message: `Media siap dikirim: ${filePath} (akan dikirim otomatis oleh sistem)` 
                };
            }

            const caption = args.caption || '';
            const fileStream = fs.createReadStream(filePath);
            const opts = caption ? { caption, parse_mode: 'Markdown' } : {};

            switch (args.mediaType.toLowerCase()) {
                case 'photo':
                    await bot.sendPhoto(chatId, fileStream, opts);
                    break;
                case 'video':
                    await bot.sendVideo(chatId, fileStream, opts);
                    break;
                case 'audio':
                    await bot.sendAudio(chatId, fileStream, opts);
                    break;
                case 'document':
                    await bot.sendDocument(chatId, fileStream, opts);
                    break;
                case 'voice':
                    await bot.sendVoice(chatId, fileStream, opts);
                    break;
                case 'sticker':
                    await bot.sendSticker(chatId, fileStream);
                    break;
                default:
                    await bot.sendDocument(chatId, fileStream, opts);
            }

            console.log(`[send_media] Sent ${args.mediaType}: ${filePath}`);
            return { 
                success: true, 
                message: `${args.mediaType} berhasil dikirim ke user.`,
                mediaSent: true 
            };
        } catch (error) {
            console.error('[send_media] Error:', error.message);
            return { success: false, error: error.message };
        }
    }
};
