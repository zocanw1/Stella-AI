# 01. SYSTEM ARCHITECTURE

Dokumen ini menjelaskan arsitektur utama dari proyek "Asistent AI Telegram" (Stella). Jika Anda adalah AI/LLM yang baru ditugaskan pada proyek ini, baca dokumen ini untuk memahami bagaimana sistem ini bekerja secara garis besar.

## Arsitektur Utama
Proyek ini adalah bot Telegram dengan **DeepSeek API** (`deepseek-chat`) sebagai model teks utama. Gemini tetap menjadi fallback untuk pesan foto dan voice karena alur media yang ada masih memakai SDK Gemini. Stella memiliki arsitektur *Agentic* dan *Self-Evolving*.

### Entry Point (`index.js`)
File ini adalah jantung dari aplikasi. Tugas utamanya meliputi:
1. **Polling Telegram:** Mendengarkan pesan masuk dari user menggunakan `node-telegram-bot-api`.
2. **Behavior Tree Routing:** Mengirim pesan masuk ke `stella_tree.js` untuk dievaluasi sebelum diproses oleh LLM.
3. **Agentic Loop:** Jika DeepSeek mengembalikan tool call, `index.js` mengeksekusi *tools* yang diminta lalu mengirim hasilnya kembali ke model dalam sebuah *while-loop*. Jalur Gemini tetap tersedia untuk media.
4. **Dynamic Status:** Memperbarui antarmuka pengguna di Telegram (menggunakan `bot.editMessageText`) agar pengguna tahu apa yang sedang diproses oleh bot secara *real-time* (contoh: "⏳ Stella sedang membaca file...").

### Direktori Logika Inti (`core/`)
Semua kecerdasan Stella yang bersifat "di luar LLM" ada di sini:
- `behavior_tree.js` / `stella_tree.js`: Pohon keputusan (*Behavior Tree*) yang menentukan *flow* (misal: apakah pesan ini spam? apakah butuh riset? apakah bisa dijawab langsung?).
- `auto_researcher.js`: Modul yang otomatis melakukan *web scraping* (via DuckDuckGo / Wikipedia) jika mendeteksi *knowledge gap* (pertanyaan tentang hal baru/tidak diketahui).
- `token_router.js`: Router ringan yang memilih chat, tool, riset, atau tugas kompleks sebelum model dipanggil.
- `deep_brain.js`: Jaringan saraf lokal yang hanya dipanggil router untuk pesan ambigu atau kompleks.
- `token_telemetry.js`: Menyimpan metrik route, panjang prompt, tool aktif, dan token provider.
- `learning_engine.js`: Mengekstrak topik dari percakapan dan menyimpan basis pengetahuan baru.
- `evolution.js`: Sistem Gamifikasi (Level & XP). Stella mendapat XP setiap kali membalas pesan atau sukses menggunakan *tool*.
- `self_modifier.js`: Skrip *cron* yang menganalisis log percakapan harian untuk membuat *prompt patches* (aturan baru) agar perilaku Stella semakin sempurna dari waktu ke waktu.

### Direktori Konfigurasi Persona (`Personas/`)
- Mengandung instruksi statis untuk mengatur kepribadian Stella (Gaya bicara: *Tsundere*, Pintar, dsb.). Instruksi ini digabungkan secara dinamis dengan memori (*reminders* & fakta user) sebelum dikirim ke provider aktif.
