# AI DEVELOPMENT GUIDE

## Konfigurasi
- Status: Aktif
- Versi: Stella v4 — Multimedia AI
- Kemampuan:
  - generate_image (Gemini Native Image Generation via @google/genai SDK)
  - generate_voice (Text-to-Speech via gTTS)
  - send_media (Universal Telegram Media Sender — photo/video/audio/document/voice)
  - download_file (Internet File Downloader)
  - screenshot_web (Web Screenshot via thum.io API)
  - execute_command (Terminal/CLI)
  - read_file / write_file (File System)
  - search_web (DuckDuckGo + Wikipedia Fallback)

## UPDATE LOG
- 2026-06-29: Semua API key dipindah dari hardcoded `index.js` ke `.env` (TELEGRAM_TOKEN, GEMINI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY). Menambahkan custom env loader agar kompatibel dengan semua versi Node.js. `start-stella.bat` divalidasi untuk semua required keys.
- 2026-06-23: Mengurangi context Telegram lebih agresif: instruksi maksimal 3.200 karakter, memori 800, ringkasan 400, dan tiap dari enam pesan riwayat maksimal 600. AutoResearch kini hanya berjalan pada route riset eksplisit, sehingga pertanyaan biasa tidak salah memicu pencarian. Debug, trace, dan telemetry terminal disembunyikan secara default; aktifkan hanya dengan `STELLA_DEBUG=true`.
- 2026-06-23: Memperbarui `start-stella.bat` agar memeriksa keberadaan `.env` dan `DEEPSEEK_API_KEY` tanpa menampilkan nilainya sebelum menjalankan Stella.
- 2026-06-23: Tahap Telegram hemat token. Menambahkan `core/token_router.js`, `core/token_telemetry.js`, dan `core/persona_policy.js`. Rule ringan kini menentukan route lebih dulu; DeepBrain hanya dipanggil untuk pesan ambigu atau kompleks. Riwayat dibatasi menjadi enam pesan terbaru plus ringkasan ringan, memori dibatasi, tool schema hanya dikirim pada route aksi, dan penggunaan prompt/token dicatat di `data/token_metrics.json`. Persona aktif dan backup kini memakai gaya santai dengan panggilan "kamu" dan "aku".
- 2026-06-23: Menambahkan `core/deepseek_provider.js` dan `core/runtime_env.js`. `index.js` sekarang memuat `DEEPSEEK_API_KEY` dari `.env`, memakai `deepseek-chat` sebagai model teks utama, dan menerjemahkan tool declaration lama ke format tool-call DeepSeek. Jalur Gemini tetap menjadi fallback untuk foto dan voice.
- 2026-05-25: Mengembalikan model Codex app-server ke `gpt-5.4` karena `gpt-5.3` ditolak untuk akun ChatGPT pada Codex. Behavior tree sekarang mengenali alias natural seperti `balikin ke gpt 54 yang medium` sebagai switch lokal ke mode `codex`, tanpa meneruskan pesan ke Codex. Handler notifikasi app-server juga diberi catch agar error server tidak menjatuhkan proses Node.
- 2026-05-25: Menambahkan handler bahasa natural untuk ganti model (`ganti/ubah/switch model ...`) langsung di behavior tree agar tidak masuk ke Codex. Alias `gpt` diarahkan ke mode `codex`. `core/codex_bridge.js` juga diberi larangan eksplisit memakai native exec internal Codex dan timeout turn 90 detik agar app-server error tidak menggantung.
- 2026-05-25: Model thread default di `core/codex_bridge.js` diganti dari `gpt-5.4` ke `gpt-5.3` agar sesi Stella via Codex app-server memakai model yang diminta user.
- 2026-05-25: Optimasi loop Codex untuk permintaan baca/cek/listing. `index.js` sekarang mengenali read-only info request dan setelah tool pertama mengirim hasil kembali ke Stella tanpa daftar tool agar tidak mengulang command. `core/codex_bridge.js` juga diperketat agar hasil tool langsung dirangkum, payload hasil tool tidak cepat terpotong, dan log delta tidak membanjiri terminal. Intent neural di `core/deep_brain.js` kini lebih menghormati `ruleIntent` saat sinyal action aktif.
- 2026-05-25: Merombak alur berpikir Stella menjadi neural policy layer. `core/deep_brain.js` sekarang punya state bobot+bias per koneksi (`data/models/neural_state.json`), forward pass input -> weight * input + bias -> output tendensi, rekaman thought samples, dan learning dari feedback. `core/stella_tree.js` memakai hasil neural sebagai sinyal utama intent/research/context, sementara rule lama menjadi fallback keselamatan.
- 2026-05-25: Mengganti bridge `codex exec` per-pesan menjadi sesi persisten `codex app-server` via stdio JSON-RPC. `core/codex_bridge.js` sekarang menahan proses Codex tetap hidup, membuat `thread` per user Telegram, dan mengirim `turn/start` ke thread yang sama agar percakapan Stella lebih natural dan tidak spawn proses baru untuk setiap pesan.
- 2026-05-25: Mengubah backend utama Stella dari provider model langsung menjadi `Codex CLI Bridge`. Menambahkan `core/codex_bridge.js` dan `data/codex_response.schema.json`, mengganti default model menjadi `codex`, memperluas `/model` agar mendukung `codex`, dan mengalihkan loop respons Telegram di `index.js` agar Stella memakai `codex exec` lalu tetap menjalankan tool lokal project (`generate_image`, `send_media`, `execute_command`, dan lainnya).
- 2026-05-25: Integrasi persona inti Stella ke runtime. `index.js` sekarang memuat identitas dari folder `Personas/` (prioritas: `stella_ramah.txt`, fallback: `stella_backup_lengkap.txt`) dan menyuntikkannya langsung ke `systemInstruction`, sehingga karakter Stella menjadi sumber tunggal yang konsisten.
- 2026-05-04: Implementasi modul `core/image_generator.py` untuk generate gambar menggunakan Hugging Face API (Stable Diffusion v1.5). Token API dikonfigurasi.
- **[2026-05-04]**: Mengembangkan diri secara mandiri dengan membuat modul `core/image_generator.js` untuk integrasi image generation dan memperbarui panduan pengembangan. - (File: `core/image_generator.js`, `AI_DEVELOPMENT_GUIDE.md`)
- **[2026-05-04]**: Melakukan perbaikan logika pada `core/image_generator.js` agar lebih presisi dalam mengenali atribut warna (pink) pada prompt pengguna. - (File: `core/image_generator.js`, `AI_DEVELOPMENT_GUIDE.md`)
- **[2026-05-04]**: Merombak sistem menjadi *Dynamic Tools Architecture*. Semua `tools` bawaan Gemini dipindah dari `index.js` ke dalam folder `tools/`. Ini memungkinkan Stella untuk memecahkan masalah (problem solving) secara mandiri dengan langsung membuat fungsi baru (seperti file `tools/generate_image.js`) dan menggunakannya tanpa perlu merestart sistem atau mengedit `index.js`. - (File: `index.js`, `tools/*.js`, `AI_DEVELOPMENT_GUIDE.md`)
- **[2026-05-04]**: Perbaikan Bug Sistem Core:
  - Memperbaiki TensorFlow.js `DeepBrain` yang gagal menyimpan ingatan (`Cannot find any save handlers`) dengan cara mengimplementasikan *custom file system IO Handler*.
  - Menambahkan *Wikipedia API Fallback* pada `AutoResearcher` dan `search_web` untuk menangani *timeout* jaringan DuckDuckGo, sehingga bot tidak mogok saat koneksi terputus. - (File: `core/deep_brain.js`, `core/auto_researcher.js`, `tools/search_web.js`, `AI_DEVELOPMENT_GUIDE.md`)
- **[2026-05-04] MAJOR UPGRADE v4 — Multimedia AI:**
  - Upgrade dari "text-only" menjadi "full multimedia". Stella sekarang bisa generate gambar, voice note, download file, screenshot web, dan mengirim semua jenis media ke Telegram.
  - Tambah `@google/genai` SDK untuk Gemini Native Image Generation (model `gemini-2.5-flash-image`).
  - Tambah `gtts` untuk Text-to-Speech tanpa API key tambahan.
  - Tools baru: `generate_image.js`, `generate_voice.js`, `send_media.js`, `download_file.js`, `screenshot_web.js`.
  - Upgrade `index.js`: inject bot context ke tools, smart auto-send media, expand agentic loop 5→10, update system instruction dengan kemampuan multimedia.
  - Upgrade `evolution.js`: tambah skill `media_creation` dan `voice_interaction`.
  - Cleanup dead code: hapus `core/image_generator.js`, `core/image_generator.py`, `test_image_gen.py`, `image_generator/image_engine.js`.
  - (File: `index.js`, `tools/*.js`, `core/evolution.js`, `AI_DEVELOPMENT_GUIDE.md`, `package.json`)
