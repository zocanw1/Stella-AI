const axios = require('axios');
const cheerio = require('cheerio');

/**
 * File ini berfungsi untuk mengambil (scraping) isi konten teks dari sebuah halaman web.
 */
module.exports = {
    name: "fetch_webpage",
    description: "Mengambil konten teks lengkap dari sebuah URL untuk dibaca dan dirangkum.",
    parameters: {
        type: "OBJECT",
        properties: {
            url: {
                type: "STRING",
                description: "URL halaman web yang ingin dibaca."
            }
        },
        required: ["url"]
    },
    async execute({ url }) {
        console.log(`[Scraper] Membaca halaman: ${url}`);
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            
            // Hapus elemen yang tidak berguna
            $('script, style, nav, footer, header, ads').remove();
            
            let text = $('body').text();
            
            // Bersihkan whitespace berlebih
            text = text.replace(/\s+/g, ' ').trim();
            
            // Batasi panjang teks agar tidak overload context window
            if (text.length > 15000) {
                text = text.substring(0, 15000) + "... (konten dipotong karena terlalu panjang)";
            }

            return {
                url,
                title: $('title').text() || "Tanpa Judul",
                content: text
            };
        } catch (error) {
            return { error: `Gagal membaca halaman: ${error.message}` };
        }
    }
};
