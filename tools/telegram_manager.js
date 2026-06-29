// tools/telegram_manager.js
let isSending = false;

async function sendMedia(chatId, filePath, mediaType, caption = "") {
    if (isSending) {
        console.log("Log: Pengiriman sedang diproses, mengabaikan request ganda.");
        return;
    }
    
    isSending = true;
    try {
        console.log(`Log: Mengirim media ke Telegram. Tipe: ${mediaType}, Path: ${filePath}`);
        // Simulasi fungsi kirim ke Telegram
        // ... kode pengiriman asli ...
    } finally {
        isSending = false;
        console.log("Log: Pengiriman selesai.");
    }
}
