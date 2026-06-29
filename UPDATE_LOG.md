# UPDATE LOG

## [2026-05-04] - Perbaikan Bug Pengiriman Ganda
- Masalah: Fitur `send_media` mengirimkan file sebanyak dua kali.
- Solusi: Menambahkan variabel `isSending` sebagai *lock mechanism* di dalam `tools/telegram_manager.js` untuk mencegah eksekusi fungsi secara bersamaan.
- Status: Berhasil diterapkan.
