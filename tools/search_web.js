const axios = require('axios');

module.exports = {
    name: "search_web",
    description: "Sedang mencari informasi ",
    parameters: {
        type: "OBJECT",
        properties: {
            query: { type: "STRING", description: "Kata kunci pencarian" }
        },
        required: ["query"]
    },
    execute: async (args) => {
        const query = args.query;
        let finalResults = [];
        const SEARXNG_URL = "http://localhost:8888/search";

        try {
            console.log(`[search_web] Connecting to Local SearXNG: "${query}"`);
            const response = await axios.get(SEARXNG_URL, {
                params: {
                    q: query,
                    format: "json",
                    language: "id-ID",
                    safesearch: 1
                },
                timeout: 10000
            });

            if (response.data && response.data.results) {
                // Ambil 5 hasil teratas yang memiliki konten
                response.data.results.slice(0, 5).forEach(res => {
                    if (res.content) {
                        const snippet = res.content.replace(/<\/?[^>]+(>|$)/g, "").trim();
                        finalResults.push(`[${res.title}] ${snippet}\nLink: ${res.url}`);
                    }
                });
            }
        } catch (e) {
            console.error(`[search_web] Local SearXNG Error: ${e.message}`);

            // --- Fallback ke Wikipedia jika SearXNG mati ---
            try {
                console.log(`[search_web] SearXNG failed, falling back to Wikipedia...`);
                const wikiRes = await axios.get(
                    `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json`,
                    { timeout: 5000 }
                );
                const searchResults = wikiRes.data?.query?.search || [];
                for (const item of searchResults) {
                    const text = item.snippet.replace(/<\/?[^>]+(>|$)/g, '').trim();
                    finalResults.push(`[Source: Wikipedia] ${text}`);
                    if (finalResults.length >= 5) break;
                }
            } catch (wikiErr) { }
        }

        if (finalResults.length === 0) return { result: "Maaf Kak, Stella tidak bisa terhubung ke SearXNG lokal dan Wikipedia juga gagal memberikan informasi." };

        return {
            result: finalResults.join("\n\n"),
            status: "Search via Local SearXNG Completed",
            source: "http://localhost:8888"
        };
    }
};
