/**
 * ============================================
 *  🔍 AUTO-RESEARCHER
 *  Knowledge gap detection + auto web search
 * ============================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'research_cache.json');
const CACHE_EXPIRY_DAYS = 7;

// Keywords that indicate user is asking about something current/unknown
const RESEARCH_TRIGGERS = [
    'apa itu', 'siapa itu', 'what is', 'who is', 'terbaru', 'update',
    'berita', 'news', 'cara', 'how to', 'tutorial', 'panduan',
    'artinya', 'maksudnya', 'penjelasan', 'definisi', 'pengertian'
];

// Topics that Stella should already know (no research needed)
const KNOWN_DOMAINS = [
    'greeting', 'personal', 'schedule', 'reminder'
];

class AutoResearcher {
    constructor(learningEngine) {
        this.learningEngine = learningEngine;
        this.cache = this._loadCache();
        this._cleanExpiredCache();
    }

    _loadCache() {
        try {
            if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        } catch (e) { /* ignore */ }
        return { cache: {}, stats: { total_searches: 0, cache_hits: 0, last_search: null } };
    }

    _saveCache() {
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        } catch (e) { console.error('[Researcher] Save error:', e.message); }
    }

    _cleanExpiredCache() {
        const now = Date.now();
        const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        let cleaned = 0;
        for (const [key, entry] of Object.entries(this.cache.cache)) {
            if (now - entry.timestamp > expiryMs) {
                delete this.cache.cache[key];
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[Researcher] Cleaned ${cleaned} expired cache entries`);
            this._saveCache();
        }
    }

    /**
     * Detect if there's a knowledge gap that needs researching.
     * Returns: { needsResearch: boolean, reason: string, searchQuery: string }
     */
    detectKnowledgeGap(message, topics, intent) {
        const text = message.toLowerCase();

        // Skip research for known simple domains
        if (KNOWN_DOMAINS.includes(topics[0])) {
            return { needsResearch: false, reason: 'known_domain' };
        }

        // Check if message contains research trigger phrases
        const hasTrigger = RESEARCH_TRIGGERS.some(t => text.includes(t));
        if (hasTrigger) {
            return {
                needsResearch: true,
                reason: 'explicit_question',
                searchQuery: this._buildSearchQuery(message)
            };
        }

        // Check if topic is rare/never seen (frequency < 3)
        const topicFreq = this.learningEngine.knowledgeBase.topic_frequency;
        const isUnknownTopic = topics.every(t => (topicFreq[t] || 0) < 3 && t !== 'general');
        if (isUnknownTopic && intent === 'question') {
            return {
                needsResearch: true,
                reason: 'unknown_topic',
                searchQuery: this._buildSearchQuery(message)
            };
        }

        // Check for named entities (capitalized words that might be proper nouns)
        const namedEntities = message.match(/[A-Z][a-z]{2,}/g) || [];
        const unknownEntities = namedEntities.filter(e => {
            const lower = e.toLowerCase();
            return !['stella', 'kak', 'saya', 'kakak'].includes(lower);
        });
        if (unknownEntities.length > 0 && intent === 'question') {
            return {
                needsResearch: true,
                reason: 'named_entity',
                searchQuery: unknownEntities.join(' ') + ' ' + this._extractKeywords(message)
            };
        }

        return { needsResearch: false, reason: 'sufficient_knowledge' };
    }

    /**
     * Perform web research and return results.
     */
    async research(searchQuery) {
        // Check cache first
        const cacheKey = this._hashQuery(searchQuery);
        if (this.cache.cache[cacheKey]) {
            this.cache.stats.cache_hits++;
            this._saveCache();
            console.log(`[Researcher] Cache hit for: "${searchQuery}"`);
            return this.cache.cache[cacheKey].results;
        }

        console.log(`[Researcher] Searching: "${searchQuery}"`);
        this.cache.stats.total_searches++;
        this.cache.stats.last_search = new Date().toISOString();

        let snippets = [];
        let titles = [];

        // 1. DUCKDUCKGO SEARCH
        try {
            const response = await axios.get(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
                {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 8000
                }
            );

            const html = response.data;

            // Extract snippets
            const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gi;
            let match;
            while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
                const clean = match[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
                if (clean.length > 20) snippets.push(clean);
            }

            // Extract titles
            const titleRegex = /<a class="result__a"[^>]*>(.*?)<\/a>/gi;
            while ((match = titleRegex.exec(html)) !== null && titles.length < 5) {
                titles.push(match[1].replace(/<\/?[^>]+(>|$)/g, '').trim());
            }
        } catch (err) {
            console.error(`[Researcher] DuckDuckGo gagal (${err.message}). Beralih ke Wikipedia Fallback...`);
        }

        // 2. WIKIPEDIA FALLBACK (Jika DDG gagal atau tidak ada hasil)
        if (snippets.length === 0) {
            try {
                const wikiRes = await axios.get(
                    `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&utf8=&format=json`,
                    { headers: { 'User-Agent': 'StellaBot/1.0' }, timeout: 8000 }
                );
                const searchResults = wikiRes.data?.query?.search || [];
                for (const item of searchResults) {
                    const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, '').trim();
                    snippets.push(cleanSnippet);
                    titles.push(item.title);
                }
                if (snippets.length > 0) console.log(`[Researcher] Wikipedia Fallback berhasil mendapatkan hasil.`);
            } catch (wikiErr) {
                console.error(`[Researcher] Wikipedia Fallback gagal: ${wikiErr.message}`);
            }
        }

        if (snippets.length === 0) {
            return {
                query: searchQuery,
                snippets: [],
                titles: [],
                summary: 'Pencarian gagal, tidak bisa mengakses internet atau tidak menemukan hasil.',
                found_at: new Date().toISOString()
            };
        }

        const results = {
            query: searchQuery,
            snippets,
            titles,
            summary: this._buildSummary(snippets),
            found_at: new Date().toISOString()
        };

        // Cache the results
        this.cache.cache[cacheKey] = {
            results,
            timestamp: Date.now()
        };
        this._saveCache();

        console.log(`[Researcher] Found ${snippets.length} results for: "${searchQuery}"`);
        return results;
    }

    /**
     * Build a context injection string from research results.
     */
    buildResearchContext(results) {
        if (!results || results.snippets.length === 0) return '';

        let context = `\n--- HASIL RISET OTOMATIS ---\n`;
        context += `Query: "${results.query}"\n`;
        context += `Temuan:\n`;
        results.snippets.forEach((s, i) => {
            context += `${i + 1}. ${s}\n`;
        });
        context += `--- END RISET ---\n`;
        context += `INSTRUKSI: Gunakan informasi di atas untuk menjawab pertanyaan user. Jika informasi tidak relevan, abaikan saja.\n`;
        return context;
    }

    // ── Helpers ──
    _buildSearchQuery(message) {
        // Remove stop words and build a search-friendly query
        const stopWords = ['apa', 'itu', 'siapa', 'yang', 'dan', 'di', 'ke', 'dari',
            'kak', 'stella', 'tolong', 'bisa', 'gak', 'dong', 'ya', 'nih'];
        const words = message.toLowerCase().split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.includes(w));
        return words.slice(0, 6).join(' ');
    }

    _extractKeywords(message) {
        return message.toLowerCase().split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 3).join(' ');
    }

    _buildSummary(snippets) {
        if (snippets.length === 0) return 'Tidak ditemukan informasi relevan.';
        // Take first 2 snippets as summary
        return snippets.slice(0, 2).join(' ').substring(0, 500);
    }

    _hashQuery(query) {
        let hash = 0;
        const str = query.toLowerCase().trim();
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return 'q_' + Math.abs(hash).toString(36);
    }

    getStatsText() {
        const s = this.cache.stats;
        return `--- AUTO-RESEARCHER ---\n` +
            `Total Searches: ${s.total_searches}\n` +
            `Cache Hits: ${s.cache_hits}\n` +
            `Cache Size: ${Object.keys(this.cache.cache).length}\n` +
            `Last Search: ${s.last_search ? new Date(s.last_search).toLocaleString('id-ID') : 'Belum pernah'}\n`;
    }
}

module.exports = AutoResearcher;
