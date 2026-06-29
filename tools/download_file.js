/**
 * 📥 DOWNLOAD FILE — Download file dari internet
 * Mengunduh file dari URL apapun dan menyimpannya ke komputer lokal.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');

module.exports = {
    name: "download_file",
    description: "Mengunduh file dari URL internet dan menyimpannya di komputer. Bisa download gambar, video, musik, dokumen, atau file apapun. Setelah berhasil, gunakan send_media untuk mengirimnya ke user.",
    parameters: {
        type: "OBJECT",
        properties: {
            url: { type: "STRING", description: "URL file yang akan didownload" },
            filename: { type: "STRING", description: "Nama file untuk menyimpan (opsional, akan auto-detect dari URL)" }
        },
        required: ["url"]
    },
    execute: async (args) => {
        try {
            if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

            // Determine filename
            let filename = args.filename;
            if (!filename) {
                const urlPath = new URL(args.url).pathname;
                filename = path.basename(urlPath) || `download_${Date.now()}`;
            }

            const filePath = path.join(DOWNLOADS_DIR, filename);
            console.log(`[download_file] Downloading: ${args.url}`);

            const response = await axios({
                method: 'GET',
                url: args.url,
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxContentLength: 50 * 1024 * 1024 // Max 50MB
            });

            fs.writeFileSync(filePath, Buffer.from(response.data));

            const fileSize = fs.statSync(filePath).size;
            const sizeText = fileSize > 1024 * 1024 
                ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` 
                : `${(fileSize / 1024).toFixed(1)} KB`;

            // Detect media type from extension
            const ext = path.extname(filename).toLowerCase();
            let mediaType = 'document';
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) mediaType = 'photo';
            else if (['.mp4', '.avi', '.mkv', '.webm', '.mov'].includes(ext)) mediaType = 'video';
            else if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) mediaType = 'audio';

            console.log(`[download_file] Saved: ${filePath} (${sizeText})`);

            return {
                success: true,
                type: mediaType,
                filePath: filePath,
                filename: filename,
                size: sizeText,
                message: `File berhasil didownload: ${filename} (${sizeText})`
            };
        } catch (error) {
            console.error('[download_file] Error:', error.message);
            return { success: false, error: error.message };
        }
    }
};
