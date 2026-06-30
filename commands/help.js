module.exports = {
    match: (msg) => msg.startsWith('/help'),
    execute: async (ctx, deps) => {
        let reply = '--- PANDUAN PERINTAH STELLA ---\n\n';
        reply += '🔹 /stats - Cek statistik, level, dan model AI.\n';
        reply += '🔹 /skills - Lihat daftar kemampuan yang dikuasai.\n';
        reply += '🔹 /learn - Lihat topik favorit dan jam aktifmu.\n';
        reply += '🔹 /patches - Lihat perbaikan sistem otomatis.\n';
        reply += '🔹 /rules - Lihat aturan kustom yang aktif.\n';
        reply += '🔹 /reflect - Jalankan evaluasi diri (Self-Reflection).\n';
        reply += '🔹 /settings - Buka menu pengaturan interaktif.\n';
        reply += '🔹 /model [codex|gemini|groq] - Ganti mode respons Stella.\n';
        reply += '🔹 /clear - Reset chat history (jika Stella error).\n';
        reply += '🔹 /ping - Cek apakah Stella aktif.\n';
        reply += '🔹 /restart - Restart sistem Stella.\n';
        reply += '🔹 /reload - Reload semua command tanpa restart.\n';
        reply += '🔹 /leave - Keluar dari grup.\n';
        reply += '🔹 /kick @user - Tendang anggota dari grup (admin).\n';
        reply += '\n💡 Kamu juga bisa chat biasa buat minta gambar, voice note, atau riset web.';
        ctx.directReply = reply;
        ctx.skipAI = true;
        return deps.STATUS.SUCCESS;
    }
};