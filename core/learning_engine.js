/**
 * ============================================
 *  🧬 LEARNING ENGINE
 *  Continuous learning system for Stella AI
 * ============================================
 */

const fs = require('fs');
const path = require('path');

const KB_FILE = path.join(__dirname, '..', 'data', 'knowledge_base.json');
const PATTERNS_FILE = path.join(__dirname, '..', 'data', 'interaction_patterns.json');

const STOP_WORDS = new Set([
    'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'ini', 'itu', 'dengan',
    'adalah', 'pada', 'juga', 'tidak', 'akan', 'sudah', 'ada', 'bisa',
    'atau', 'saya', 'aku', 'kamu', 'dia', 'kami', 'mereka', 'nya',
    'kalau', 'mau', 'dong', 'ya', 'kan', 'sih', 'deh', 'nih', 'loh',
    'tuh', 'kok', 'gak', 'nggak', 'udah', 'bantu', 'tolong', 'coba',
    'buat', 'lagi', 'aja', 'kak', 'stella', 'halo', 'hai'
]);

const TOPIC_MAP = {
    coding: ['code', 'coding', 'script', 'program', 'debug', 'error', 'function', 'kode', 'kodingan', 'ngoding', 'laravel', 'javascript', 'python', 'html', 'css', 'php', 'node', 'controller', 'database', 'bug', 'fix'],
    system: ['file', 'folder', 'buka', 'jalankan', 'run', 'install', 'download', 'hapus', 'delete', 'terminal', 'command', 'volume', 'shutdown', 'restart', 'laptop'],
    music: ['lagu', 'music', 'putar', 'play', 'spotify', 'youtube', 'video', 'song'],
    web: ['cari', 'search', 'google', 'website', 'internet', 'web', 'link', 'url'],
    personal: ['curhat', 'cerita', 'perasaan', 'sedih', 'senang', 'marah', 'galau', 'stress'],
    schedule: ['jadwal', 'reminder', 'pengingat', 'alarm', 'waktu', 'jam', 'tanggal'],
    creative: ['tulis', 'cerita', 'puisi', 'novel', 'bikin', 'desain', 'gambar']
};

class LearningEngine {
    constructor() {
        this.knowledgeBase = this._loadJSON(KB_FILE, {
            skills: [], patterns: {}, solutions: [], learned_responses: {},
            topic_frequency: {}, last_updated: null
        });
        this.interactionPatterns = this._loadJSON(PATTERNS_FILE, {
            users: {},
            global_patterns: { peak_hours: {}, common_topics: {}, tool_usage: {}, avg_session_length: 0 }
        });
        this._saveInterval = setInterval(() => this.save(), 60000);
    }

    _loadJSON(filePath, defaultValue) {
        try {
            if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (err) { console.error(`[Learning] Load error: ${err.message}`); }
        return defaultValue;
    }

    save() {
        try {
            this.knowledgeBase.last_updated = new Date().toISOString();
            fs.writeFileSync(KB_FILE, JSON.stringify(this.knowledgeBase, null, 2));
            fs.writeFileSync(PATTERNS_FILE, JSON.stringify(this.interactionPatterns, null, 2));
        } catch (err) { console.error('[Learning] Save error:', err.message); }
    }

    // ── Pattern Tracking ──
    trackInteraction(userId, message, toolsUsed = []) {
        if (!this.interactionPatterns.users[userId]) {
            this.interactionPatterns.users[userId] = {
                interaction_count: 0, first_seen: new Date().toISOString(), last_seen: null,
                hourly_activity: {}, topic_history: [], tool_preferences: {},
                avg_message_length: 0, session_starts: [], favorite_topics: {}
            };
        }
        const user = this.interactionPatterns.users[userId];
        const now = new Date();
        const hour = now.getHours().toString();

        user.interaction_count++;
        user.last_seen = now.toISOString();
        user.hourly_activity[hour] = (user.hourly_activity[hour] || 0) + 1;
        this.interactionPatterns.global_patterns.peak_hours[hour] =
            (this.interactionPatterns.global_patterns.peak_hours[hour] || 0) + 1;

        const topics = this._extractTopics(message);
        topics.forEach(topic => {
            user.favorite_topics[topic] = (user.favorite_topics[topic] || 0) + 1;
            this.knowledgeBase.topic_frequency[topic] = (this.knowledgeBase.topic_frequency[topic] || 0) + 1;
        });
        user.topic_history.push({ topics, time: now.toISOString() });
        if (user.topic_history.length > 100) user.topic_history.shift();

        toolsUsed.forEach(tool => {
            user.tool_preferences[tool] = (user.tool_preferences[tool] || 0) + 1;
            this.interactionPatterns.global_patterns.tool_usage[tool] =
                (this.interactionPatterns.global_patterns.tool_usage[tool] || 0) + 1;
        });

        user.avg_message_length = Math.round(
            ((user.avg_message_length * (user.interaction_count - 1)) + message.length) / user.interaction_count
        );

        if (user.session_starts.length === 0 ||
            (now - new Date(user.session_starts[user.session_starts.length - 1])) > 30 * 60 * 1000) {
            user.session_starts.push(now.toISOString());
            if (user.session_starts.length > 50) user.session_starts.shift();
        }
    }

    getUserPeakHours(userId) {
        const user = this.interactionPatterns.users[userId];
        if (!user) return [];
        return Object.entries(user.hourly_activity).sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }));
    }

    getUserTopTopics(userId, limit = 5) {
        const user = this.interactionPatterns.users[userId];
        if (!user) return [];
        return Object.entries(user.favorite_topics).sort((a, b) => b[1] - a[1]).slice(0, limit)
            .map(([topic, count]) => ({ topic, count }));
    }

    // ── Response Scoring ──
    recordFeedback(messageHash, responseSnippet, positive, topics = []) {
        const key = `resp_${messageHash}`;
        if (!this.knowledgeBase.learned_responses[key]) {
            this.knowledgeBase.learned_responses[key] = {
                snippet: responseSnippet.substring(0, 100), topics, positive: 0, negative: 0,
                first_feedback: new Date().toISOString()
            };
        }
        if (positive) this.knowledgeBase.learned_responses[key].positive++;
        else this.knowledgeBase.learned_responses[key].negative++;
        this.save();
    }

    // ── Skill Memory ──
    learnSkill(trigger, solution, category, toolsUsed = []) {
        const existing = this.knowledgeBase.skills.find(s => s.trigger === trigger && s.category === category);
        if (existing) {
            existing.times_used++;
            existing.last_used = new Date().toISOString();
            existing.success_rate = Math.min(1, existing.success_rate + 0.05);
        } else {
            this.knowledgeBase.skills.push({
                trigger, solution, category, tools_used: toolsUsed,
                times_used: 1, success_rate: 0.7,
                learned_at: new Date().toISOString(), last_used: new Date().toISOString()
            });
            if (this.knowledgeBase.skills.length > 200) {
                this.knowledgeBase.skills.sort((a, b) => b.success_rate - a.success_rate);
                this.knowledgeBase.skills = this.knowledgeBase.skills.slice(0, 200);
            }
        }
        this.save();
    }

    findRelevantSkills(query, limit = 3) {
        const queryTokens = this._tokenize(query);
        const scored = this.knowledgeBase.skills.map(skill => {
            const triggerTokens = this._tokenize(skill.trigger);
            const overlap = queryTokens.filter(t => triggerTokens.includes(t)).length;
            return { ...skill, relevance: overlap / Math.max(queryTokens.length, 1) * skill.success_rate };
        });
        return scored.filter(s => s.relevance > 0.1).sort((a, b) => b.relevance - a.relevance).slice(0, limit);
    }

    recordSolution(problem, toolChain, outcome) {
        this.knowledgeBase.solutions.push({
            problem: problem.substring(0, 200), tool_chain: toolChain,
            outcome: outcome.substring(0, 200), recorded_at: new Date().toISOString(), reuse_count: 0
        });
        if (this.knowledgeBase.solutions.length > 500) this.knowledgeBase.solutions = this.knowledgeBase.solutions.slice(-500);
        this.save();
    }

    // ── NLP Utilities ──
    _tokenize(text) {
        if (!text || typeof text !== 'string') return [];
        return text.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/)
            .filter(word => word.length > 2 && !STOP_WORDS.has(word));
    }

    _extractTopics(message) {
        const tokens = this._tokenize(message);
        if (tokens.length === 0) return ['general'];
        const scores = {};
        for (const [topic, keywords] of Object.entries(TOPIC_MAP)) {
            const matches = tokens.filter(t => keywords.some(k => t.includes(k) || k.includes(t)));
            if (matches.length > 0) scores[topic] = matches.length;
        }
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        return sorted.length === 0 ? ['general'] : sorted.slice(0, 2).map(([t]) => t);
    }

    detectSentiment(message) {
        const text = message.toLowerCase();
        const pos = ['bagus', 'keren', 'mantap', 'hebat', 'suka', 'senang', 'makasih', 'thanks', 'wow', 'nice', 'oke', 'berhasil'];
        const neg = ['jelek', 'buruk', 'salah', 'error', 'gagal', 'rusak', 'kesal', 'marah', 'benci', 'bodoh', 'payah', 'lambat'];
        const pScore = pos.filter(w => text.includes(w)).length;
        const nScore = neg.filter(w => text.includes(w)).length;
        if (pScore > nScore) return 'positive';
        if (nScore > pScore) return 'negative';
        return 'neutral';
    }

    detectIntent(message) {
        const text = message.toLowerCase();
        const intents = [
            { name: 'command', kw: ['buka', 'jalankan', 'run', 'exec', 'tutup', 'close', 'start', 'stop'] },
            { name: 'question', kw: ['apa', 'kenapa', 'gimana', 'bagaimana', 'mengapa', 'kapan', 'siapa', 'dimana', 'jelaskan'] },
            { name: 'file_op', kw: ['file', 'baca', 'tulis', 'read', 'write', 'edit', 'buat file', 'hapus file'] },
            { name: 'search', kw: ['cari', 'search', 'google', 'temukan'] },
            { name: 'greeting', kw: ['halo', 'hai', 'hey', 'selamat pagi', 'selamat siang', 'selamat malam'] },
            { name: 'reminder', kw: ['ingatkan', 'remind', 'jadwal', 'alarm', 'set timer'] }
        ];
        let best = 'conversation', bestScore = 0;
        for (const i of intents) {
            const score = i.kw.filter(k => text.includes(k)).length;
            if (score > bestScore) { bestScore = score; best = i.name; }
        }
        return best;
    }

    getLearningContext(userId) {
        const user = this.interactionPatterns.users[userId];
        if (!user) return '';
        const peakHours = this.getUserPeakHours(userId);
        const topTopics = this.getUserTopTopics(userId, 3);
        let ctx = `\n--- STELLA LEARNING DATA ---\n`;
        ctx += `Total interaksi: ${user.interaction_count}\n`;
        if (peakHours.length > 0) ctx += `Jam aktif: ${peakHours.map(h => `${h.hour}:00`).join(', ')}\n`;
        if (topTopics.length > 0) ctx += `Topik favorit: ${topTopics.map(t => t.topic).join(', ')}\n`;
        ctx += `--- END LEARNING DATA ---\n`;
        return ctx;
    }

    hashMessage(message) {
        let hash = 0;
        const str = message.substring(0, 100).toLowerCase();
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    recordOutcome(userId, task, success, toolsUsed = []) {
        const user = this.interactionPatterns.users[userId];
        if (!user) return;

        if (!user.outcomes) user.outcomes = [];
        user.outcomes.push({
            task: task.substring(0, 200),
            success,
            toolsUsed,
            timestamp: new Date().toISOString()
        });
        if (user.outcomes.length > 100) user.outcomes = user.outcomes.slice(-100);

        if (!user.successRate) user.successRate = { total: 0, success: 0 };
        user.successRate.total++;
        if (success) user.successRate.success++;

        const patternKey = toolsUsed.sort().join('+');
        if (!user.toolPatterns) user.toolPatterns = {};
        if (!user.toolPatterns[patternKey]) user.toolPatterns[patternKey] = { used: 0, success: 0 };
        user.toolPatterns[patternKey].used++;
        if (success) user.toolPatterns[patternKey].success++;

        if (success) {
            const skill = this._extractSkill(task, toolsUsed);
            if (skill) {
                this.learnSkill(skill.trigger, skill.solution, skill.category, toolsUsed, true);
            }
        }

        this.save();
    }

    getBestToolSequence(userId, task) {
        const user = this.interactionPatterns.users[userId];
        if (!user || !user.toolPatterns) return null;

        const scored = Object.entries(user.toolPatterns)
            .map(([pattern, data]) => ({
                pattern,
                tools: pattern.split('+'),
                successRate: data.used > 0 ? data.success / data.used : 0,
                uses: data.used
            }))
            .filter(s => s.successRate > 0.5 && s.uses >= 2)
            .sort((a, b) => b.successRate - a.successRate);

        return scored.length > 0 ? scored[0].tools : null;
    }

    getOutcomeStats(userId) {
        const user = this.interactionPatterns.users[userId];
        if (!user || !user.successRate) return { total: 0, successRate: 0 };
        return {
            total: user.successRate.total,
            successRate: user.successRate.total > 0
                ? (user.successRate.success / user.successRate.total * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    _extractSkill(task, toolsUsed) {
        if (toolsUsed.length === 0) return null;
        const toolKey = toolsUsed.join('_');

        const categoryMap = {
            execute_command: 'system_admin', read_file: 'file_management',
            write_file: 'file_management', search_web: 'web_search',
            generate_image: 'media_creation', generate_voice: 'voice_interaction',
            send_media: 'media_creation', download_file: 'file_management',
            screenshot_web: 'web_search'
        };

        const category = toolsUsed.map(t => categoryMap[t] || 'conversation').filter(Boolean)[0] || 'conversation';
        const trigger = task.substring(0, 80);
        const solution = `Use tools: ${toolsUsed.join(', ')}`;

        return { trigger, solution, category };
    }

    getAverageSuccessRate() {
        let total = 0, success = 0;
        for (const user of Object.values(this.interactionPatterns.users)) {
            if (user.successRate) {
                total += user.successRate.total;
                success += user.successRate.success;
            }
        }
        return total > 0 ? (success / total) : 0.5;
    }

    destroy() {
        if (this._saveInterval) clearInterval(this._saveInterval);
        this.save();
    }
}

module.exports = LearningEngine;
