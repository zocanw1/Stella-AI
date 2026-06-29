# 03. DEEP LEARNING & EVOLUTION

Dokumen ini mencakup penjelasan mengenai fitur *self-learning* dan peningkatan kemampuan Stella.

## 🧠 DeepBrain (TensorFlow.js)
Terletak di `core/deep_brain.js`. Modul ini adalah Jaringan Saraf Tiruan lokal (Sequential Model) yang menggunakan `tfjs` murni.

**Tugas Utama:**
1. **Klasifikasi Intensi:** Mengkategorikan setiap kalimat masuk ke berbagai label (misal: `command`, `question`, `greeting`). Hasil ini dilempar ke *Behavior Tree* agar Stella tahu apakah pesan ini butuh riset tambahan atau sekadar *chit-chat*.
2. **Prediksi Kualitas:** Memprediksi apakah balasan Stella memuaskan atau tidak, berdasarkan riwayat umpan balik pengguna.

DeepBrain bukan jalur wajib setiap pesan. `core/token_router.js` menangani salam, chat ringan, dan perintah jelas dengan rule ringan; DeepBrain hanya dipanggil saat pesan ambigu atau kompleks.

**Sistem File I/O Custom:**
Karena OS Windows pada lingkungan ini sering bermasalah dengan instalasi C++ Backend (`tfjs-node`), `deep_brain.js` menggunakan *custom fileSystemIO* Handler. Model dan memori bobot disimpan sebagai `model.json` dan `weights.bin` di direktori `data/models/`. Otak ini melakukan *auto-retrain* (pelatihan ulang otomatis) ketika sampel data baru mencapai batas tertentu (misal: 50 pesan).

## 🌱 Evolution System
Terletak di `core/evolution.js`.
Stella memiliki sistem *Gamification* internal yang mensimulasikan pertumbuhan:
- **XP & Leveling:** Stella mendapatkan XP setiap kali dia membalas pesan (+5 XP), berhasil menggunakan *tool* (+10 XP), menyelesaikan tugas kompleks (+20 XP), atau menerima umpan balik positif dari user (tekanan tombol 👍) (+15 XP).
- **Skill Tree:** XP yang dikumpulkan dapat membuka *skills* baru secara otonom (misal: *File Management Lv.3*).

## 🪞 Self-Modifier
Terletak di `core/self_modifier.js`.
Setiap 6 jam (atau sesuai periode *cron* yang ditentukan), sistem ini akan "bermeditasi". 
Ia akan meminta Gemini untuk menganalisis riwayat `Memory/chat_log_*.md`. Berdasarkan log kesalahan atau koreksi pengguna, Gemini akan merumuskan "Prompt Patch" (aturan instruksi tambahan). Aturan baru ini disimpan di `data/prompt_patches.json` dan disuntikkan ke instruksi sistem utama, membuat Stella terus menjadi lebih baik tanpa perlu programmer manusia menyentuh kodenya.
