# 04. MEMORY & STATE MANAGEMENT

Dokumen ini menjelaskan bagaimana ingatan jangka panjang dan jangka pendek Stella dikelola, sehingga dia bisa mengingat fakta spesifik dari setiap user.

## Struktur Data
Data-data ini tersimpan di *root* atau folder `data/`:

### 1. `database.json`
Menyimpan riwayat obrolan (*Chat History*) jangka pendek untuk masing-masing user Telegram. Ini adalah konteks yang diberikan ke Gemini setiap kali merespons, memastikan obrolan memiliki kesinambungan.

### 2. `memory_bank.json`
Ini adalah **Memori Jangka Panjang**. Jika di dalam percakapan Stella merasa user memberitahu sebuah fakta penting (misalnya: "Nama kucingku Snowy"), sistem Prompt Stella secara eksplisit diinstruksikan untuk menyisipkan *tag* khusus pada balasan aslinya, seperti:
`[CATAT: KESUKAAN | User memiliki kucing bernama Snowy]`
Ketika `index.js` menangkap tag ini, baris tersebut akan dihapus dari teks yang dikirim ke Telegram, dan disalin ke `memory_bank.json`. Di obrolan berikutnya, isi file ini selalu di-*inject* (disisipkan) di awal *System Instruction*.

### 3. `reminders.json`
Sama seperti Memory Bank, jika user meminta alarm ("Ingatkan aku minum obat jam 8 malam"), Stella akan membalas dengan tag:
`[JADWAL: 2026-05-04 20:00 | Minum obat]`
Cron internal pada Node.js secara berkala akan mengecek file ini dan secara otomatis memicu pesan (via `bot.sendMessage`) jika waktunya sudah tiba.

### 4. `data/knowledge_base.json`
Dikelola oleh `learning_engine.js`. Setiap chat akan di-ekstrak *topic* (topiknya) dan *entities*-nya. Tujuannya adalah membangun grafik pengetahuan umum. Data ini juga akan dibaca oleh *AutoResearcher* untuk menentukan seberapa jarang suatu topik dibicarakan (menjadi pertimbangan perlu mencari di web atau tidak).

## Kebijakan Pemeliharaan
Semua data disimpan dalam format `.json` murni. Hal ini dilakukan demi *simplicity* dan kecepatan *prototyping*. Jika ke depannya ukuran file menjadi sangat masif (ribuan user), barulah direkomendasikan untuk melakukan migrasi ke PostgreSQL atau MongoDB.
