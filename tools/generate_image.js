/**
 * 🎨 GENERATE IMAGE — Powered by Pollinations AI
 * Menghasilkan gambar secara gratis, tanpa limit, dan tanpa API Key.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.join(__dirname, '..', 'local_images');

module.exports = {
    name: "generate_image",
    description: "Menghasilkan gambar dari deskripsi teks. Gunakan tool ini setiap kali user meminta gambar, ilustrasi, desain, atau visual apapun. Setelah berhasil, gunakan send_media untuk mengirim hasilnya.",
    parameters: {
        type: "OBJECT",
        properties: {
            prompt: { type: "STRING", description: "Deskripsi detail gambar yang ingin dibuat (dalam bahasa Inggris untuk hasil terbaik)" }
        },
        required: ["prompt"]
    },
    execute: async (args) => {
        try {
            if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

            console.log(`[generate_image] Generating (Pollinations): "${args.prompt}"`);

            const safePrompt = encodeURIComponent(args.prompt);
            // Menambahkan seed random agar hasil selalu unik
            const seed = Math.floor(Math.random() * 1000000);
            const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
            
            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const filename = `stella_img_${Date.now()}.png`;
            const savedPath = path.join(IMAGE_DIR, filename);
            fs.writeFileSync(savedPath, Buffer.from(response.data));

            console.log(`[generate_image] Saved: ${savedPath}`);
            return {
                success: true,
                type: "photo",
                filePath: savedPath,
                caption: "Gambar berhasil dibuat secara instan! 🎨",
                message: `Gambar berhasil dibuat dan disimpan di ${savedPath}`
            };

        } catch (error) {
            console.error('[generate_image] Error:', error.message);
            return { success: false, error: error.message };
        }
    }
};
