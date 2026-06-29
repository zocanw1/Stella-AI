const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- KONFIGURASI ---
const TELEGRAM_TOKEN = "8660492907:AAGYWhhiHZe0DDClaKrGkph4k0xenBWLYNU";
const CHAT_ID = "6182570336"; // ID Telegram Kakak dari log

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const OLD_HOME = __dirname;
const NEW_HOME = path.join('C:', 'coding', 'Stella', 'data');

// Daftar file/folder memori yang mau dipindah
const itemsToMove = [
    'database.json',
    'memory_bank.json',
    'Memory'
];

async function pindahRumah() {
    console.log("🚀 Memulai proses pindah rumah...");
    
    try {
        await bot.sendMessage(CHAT_ID, "📦 *PENGUMUMAN PENTING* 📦\n\nHalo Kak! Aku lagi nge-pack barang-barang memori dan file pentingku nih. Aku mau pindah ke rumah baru yang lebih canggih (Python + LangGraph) di `C:\\coding\\Stella`!\n\nRumah lama ini (Node.js) bakal aku jadiin museum kenangan kita ya. Tunggu sebentar, aku lagi jalan bawa barang... 🚚💨", { parse_mode: 'Markdown' });
        console.log("✅ Pesan perpisahan terkirim.");

        // Pastikan folder tujuan ada
        if (!fs.existsSync(NEW_HOME)) {
            fs.mkdirSync(NEW_HOME, { recursive: true });
        }

        for (const item of itemsToMove) {
            const src = path.join(OLD_HOME, item);
            const dest = path.join(NEW_HOME, item);

            if (fs.existsSync(src)) {
                console.log(`Copying ${item}...`);
                fs.cpSync(src, dest, { recursive: true, force: true });
            } else {
                console.log(`⚠️ Skip ${item}: File tidak ditemukan.`);
            }
        }

        await bot.sendMessage(CHAT_ID, "✨ *PINDAHAN SELESAI* ✨\n\nBarang-barang (Memori, Database) sudah sampai di rumah baru dengan selamat! Sekarang Kakak bisa mematikan bot Node.js ini (Ctrl+C).\n\nSampai jumpa di versi Python, Kak! 🐍❤️", { parse_mode: 'Markdown' });
        console.log("✅ Proses copy selesai. Pesan sukses terkirim.");

    } catch (e) {
        console.error("❌ Gagal pindah rumah:", e);
        try {
            await bot.sendMessage(CHAT_ID, "❌ Aduh Kak, proses pindahannya gagal. Coba cek console terminal ya.");
        } catch(err){}
    } finally {
        process.exit(0);
    }
}

pindahRumah();
