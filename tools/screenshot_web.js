/**
 * 📸 SCREENSHOT WEB — Ambil screenshot halaman web
 * Menggunakan API gratis untuk mengambil screenshot website.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.join(__dirname, '..', 'local_images');

module.exports = {
    name: "screenshot_web",
    description: "Mengambil screenshot dari sebuah halaman web/website. Berguna untuk menunjukkan tampilan website ke user. Setelah berhasil, gunakan send_media untuk mengirimnya.",
    parameters: {
        type: "OBJECT",
        properties: {
            url: { type: "STRING", description: "URL halaman web yang akan di-screenshot" }
        },
        required: ["url"]
    },
    execute: async (args) => {
        try {
            if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

            let targetUrl = args.url;
            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                targetUrl = 'https://' + targetUrl;
            }

            console.log(`[screenshot_web] Capturing: ${targetUrl}`);

            // Using free screenshot API (thum.io)
            const screenshotUrl = `https://image.thum.io/get/width/1280/crop/900/noanimate/${encodeURIComponent(targetUrl)}`;

            const response = await axios({
                method: 'GET',
                url: screenshotUrl,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            const filename = `screenshot_${Date.now()}.png`;
            const filePath = path.join(IMAGE_DIR, filename);
            fs.writeFileSync(filePath, Buffer.from(response.data));

            console.log(`[screenshot_web] Saved: ${filePath}`);

            return {
                success: true,
                type: "photo",
                filePath: filePath,
                caption: `Screenshot: ${targetUrl}`,
                message: `Screenshot berhasil diambil dari ${targetUrl}`
            };
        } catch (error) {
            console.error('[screenshot_web] Error:', error.message);
            return { success: false, error: error.message };
        }
    }
};
