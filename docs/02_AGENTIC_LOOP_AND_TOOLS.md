# 02. AGENTIC LOOP & DYNAMIC TOOLS

Dokumen ini menjelaskan bagaimana Stella dapat "bertindak" di luar kemampuannya membalas teks.

## Dynamic Tools Architecture
Sistem *tools* Stella berada dalam arsitektur modular (*hot-reload*). Untuk pesan teks, deklarasi tool diterjemahkan ke format DeepSeek; jalur Gemini tetap digunakan untuk media.

Tool schema tidak dikirim pada chat ringan. `core/token_router.js` hanya mengaktifkan schema tool ketika route membutuhkan aksi, riset, atau tugas kompleks sehingga biaya konteks lebih kecil.

### Cara Kerja Hot-Reload
Pada `index.js`, terdapat fungsi `loadDynamicTools()`. Fungsi ini membaca semua file `.js` di dalam folder `tools/` **setiap kali** menerima pesan masuk. 
Sistem akan menghapus cache Node.js (`delete require.cache`), sehingga setiap file *tool* yang baru dibuat akan **langsung tersedia detik itu juga** tanpa perlu me-restart proses Node.js.

### Tools Bawaan Saat Ini
1. `execute_command.js`: Mengizinkan Stella mengeksekusi instruksi Terminal/CMD di komputer lokal.
2. `read_file.js`: Membaca isi teks dari file di komputer.
3. `write_file.js`: Mengubah atau membuat file baru di komputer. (Fitur ini yang paling sering digunakan Stella untuk menulis kodenya sendiri).
4. `search_web.js`: Memanfaatkan DuckDuckGo (dengan *fallback* ke Wikipedia API) untuk mencari jawaban di internet secara *real-time*.
5. `generate_image.js`: **[v4 BARU]** Menghasilkan gambar dari prompt teks menggunakan Gemini Native Image Generation (`@google/genai` SDK). Gambar disimpan di `local_images/`.
6. `generate_voice.js`: **[v4 BARU]** Mengubah teks menjadi voice note (TTS) menggunakan gTTS. Audio disimpan di `local_audio/`.
7. `send_media.js`: **[v4 BARU]** Mengirim media ke Telegram — foto, video, audio, dokumen, voice note, sticker. Menerima `bot` instance via context injection.
8. `download_file.js`: **[v4 BARU]** Mengunduh file dari URL internet apapun. File disimpan di `downloads/`.
9. `screenshot_web.js`: **[v4 BARU]** Mengambil screenshot halaman web menggunakan API gratis (thum.io). Screenshot disimpan di `local_images/`.

## Context Injection (v4)
Tools yang membutuhkan akses ke Telegram Bot API (seperti `send_media`) menerima `context` object berisi `{ bot, chatId }` sebagai parameter kedua dari `handleToolCall()`. Ini memungkinkan tools untuk mengirim media langsung ke user tanpa harus melalui respons teks.

## Smart Auto-Send Media (v4)
Setelah agentic loop selesai, `index.js` secara otomatis mendeteksi jika ada tool yang mengembalikan `{ type: "photo"|"voice"|"video"|..., filePath: "..." }`. Jika ada, media tersebut akan dikirim langsung ke Telegram menggunakan `bot.sendPhoto()`, `bot.sendVoice()`, dll. Ini membuat Stella tidak perlu lagi berkata "file sudah disimpan di..." — dia langsung mengirimnya!

## The Agentic Loop
Ketika user mengirim tugas kompleks (misalnya: "Buatkan gambar kucing dan kirim ke aku"), alurnya adalah:
1. Pesan teks dikirim ke model utama DeepSeek. Pesan foto/voice tetap menuju jalur Gemini.
2. Provider dapat merespons bukan dengan teks balasan, melainkan dengan daftar pemanggilan fungsi, seperti `generate_image` dan `send_media`.
3. `index.js` menangkap ini, lalu memunculkan teks *"🎨 Membuat gambar..."* di Telegram.
4. `index.js` mengeksekusi `generate_image` dan mengembalikan hasilnya kembali ke Gemini.
5. Gemini memproses hasil, lalu memanggil `send_media`.
6. Teks status diubah menjadi *"📤 Mengirim media..."*.
7. Loop berlanjut hingga Gemini merespons murni dengan teks biasa (menyelesaikan tugas), atau mencapai batas maksimal (**10 iterasi**, dinaikkan dari 5 di v3) agar tidak terjadi *infinite loop*.

## Mengembangkan Tool Baru
Jika AI lain diminta untuk menambah fitur (misal `translate_text`, `convert_file`), maka AI HANYA perlu menggunakan `write_file` untuk membuat file baru di dalam `tools/`. Formatnya harus mengekspor objek dengan `name`, `description`, `parameters` (skema JSON), dan fungsi `execute(args, context)`. Parameter `context` opsional dan berisi `{ bot, chatId }`.
