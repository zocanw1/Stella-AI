# 🤖 Stella v4 — Multimedia AI Telegram Assistant

Stella adalah asisten pribadi berbasis AI yang canggih dengan kemampuan multimedia penuh, riset otomatis, dan sistem evolusi mandiri.

---

## 🚀 Cara Menjalankan Stella

Ikuti langkah-langkah berikut untuk menghidupkan Stella:

### 1. Persiapan Lingkungan
Pastikan Kakak sudah menginstal **Node.js** (versi 16 ke atas) di komputer.

### 2. Instalasi Dependensi
Buka terminal di folder proyek ini (`c:\coding\Asistent AI Telegram`) dan jalankan perintah:
```bash
npm install
```

### 3. Konfigurasi API
Simpan API key DeepSeek di file `.env` pada root proyek:
```dotenv
DEEPSEEK_API_KEY=isi_api_key_deepseek
DEEPSEEK_MODEL=deepseek-chat
```
DeepSeek adalah model teks utama. Gemini tetap dipakai sebagai fallback untuk pesan foto atau voice karena jalur media proyek ini masih memakai format Gemini.

### 4. Menghidupkan Bot
Jalankan perintah berikut di terminal:
```bash
node index.js
```
Jika muncul pesan `[Stella] Ready`, berarti Stella sudah siap melayani Kakak di Telegram!

---

## 🛠️ Fitur Utama
- **🎨 Image Generation:** Membuat gambar otomatis via Pollinations AI.
- **🎙️ Voice Notes:** Mengirim pesan suara menggunakan gTTS.
- **🔍 Auto-Research:** Mencari informasi mendalam di Google, DuckDuckGo, dan Yandex.
- **📥 File Downloader:** Mengunduh file dari internet langsung ke sistem.
- **📸 Web Screenshot:** Mengambil snapshot halaman website apapun.
- **🧠 Deep Brain:** Sistem pembelajaran mandiri berbasis TensorFlow.js.
- **🌳 Behavior Tree:** Logika pengambilan keputusan yang cerdas dan terstruktur.

---

## 📝 Protokol Operasional
Stella bekerja dengan alur yang disiplin:
1. **PLAN**: Merencanakan langkah sebelum eksekusi.
2. **Analisis**: Memeriksa kebutuhan file atau tool.
3. **Persetujuan**: Meminta izin Kakak untuk tugas yang berisiko.
4. **Eksekusi**: Menjalankan tugas dan melaporkan hasilnya.

---

## 📂 Struktur Memori
- `memory_bank.json`: Penyimpanan fakta permanen tentang Kakak.
- `StellaBrain_[ID].md`: Ringkasan ingatan yang bisa dibaca manusia.
- `database.json`: Riwayat percakapan lengkap.

---
*Dibuat dengan ❤️ untuk membantu Kakak menjadi lebih produktif.*
