const fs = require('fs');
const path = require('path');

const CURIOSITY_FILE = path.join(__dirname, '..', '..', 'data', 'engine', 'curiosity.json');

class CuriosityEngine {
    constructor(knowledgeBase, eventBus, EVENTS) {
        this.knowledge = knowledgeBase;
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.state = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(CURIOSITY_FILE, 'utf-8'));
        } catch {
            return { gaps: [], questions: [], explored: [], stats: { totalGaps: 0, questionsAsked: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(CURIOSITY_FILE))) {
            fs.mkdirSync(path.dirname(CURIOSITY_FILE), { recursive: true });
        }
        fs.writeFileSync(CURIOSITY_FILE, JSON.stringify(this.state, null, 2));
    }

    detectKnowledgeGap(message, context = {}) {
        const text = message.toLowerCase();
        const gap = { detected: false, query: null, confidence: 0, reason: '' };

        const knowledgeTriggers = [
            { pattern: /\b(apa itu|siapa itu|what is|who is)\s+(.+)/i, confidence: 0.8 },
            { pattern: /\b(bagaimana cara|how to|how do i|cara|tutorial)\s+(.+)/i, confidence: 0.7 },
            { pattern: /\b(berita|news|terbaru|update|latest)\s+(.+)/i, confidence: 0.6 },
            { pattern: /\b(jelaskan|explain|apaan|maksudnya)\s+(.+)/i, confidence: 0.65 },
            { pattern: /\b(kapan|when|dimana|where)\s+(.+)/i, confidence: 0.5 },
        ];

        for (const t of knowledgeTriggers) {
            const match = text.match(t.pattern);
            if (match) {
                const query = match[match.length - 1]?.trim();
                if (query && query.length > 3) {
                    gap.detected = true;
                    gap.query = query;
                    gap.confidence = t.confidence;
                    gap.reason = `explicit_question: ${match[1].trim()}`;
                    break;
                }
            }
        }

        if (!gap.detected && text.length > 30 && /\?$/.test(text)) {
            const last10 = text.split(/\s+/).slice(-8).join(' ');
            if (last10.length > 10) {
                gap.detected = true;
                gap.query = last10;
                gap.confidence = 0.4;
                gap.reason = 'implicit_question';
            }
        }

        if (gap.detected) {
            this.state.gaps.push({
                query: gap.query,
                confidence: gap.confidence,
                reason: gap.reason,
                timestamp: new Date().toISOString()
            });
            this.state.stats.totalGaps++;
            if (this.state.gaps.length > 100) this.state.gaps = this.state.gaps.slice(-100);
            this._save();
        }

        return gap;
    }

    generateQuestion(context = {}) {
        if (this.state.gaps.length === 0) return null;

        const recentGaps = this.state.gaps
            .filter(g => {
                const age = Date.now() - new Date(g.timestamp).getTime();
                return age < 3600000 && !this.state.explored.includes(g.query);
            })
            .sort((a, b) => b.confidence - a.confidence);

        if (recentGaps.length === 0) return null;

        const gap = recentGaps[0];
        this.state.explored.push(gap.query);
        this.state.stats.questionsAsked++;
        if (this.state.explored.length > 50) this.state.explored = this.state.explored.slice(-50);
        this._save();

        const question = {
            query: gap.query,
            reason: gap.reason,
            timestamp: new Date().toISOString(),
            type: gap.confidence > 0.6 ? 'active_research' : 'passive_inquiry'
        };

        this.state.questions.push(question);
        this._save();

        if (this.bus) {
            this.bus.emit(this.EVENTS.CURIOUS_QUERY, {
                query: gap.query,
                confidence: gap.confidence
            });
        }

        return question;
    }

    suggestExploration(context = {}) {
        const topics = this.state.gaps
            .filter(g => {
                const age = Date.now() - new Date(g.timestamp).getTime();
                return age < 86400000;
            })
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 3);

        if (topics.length === 0) return null;

        return {
            topics: topics.map(t => t.query),
            suggestion: `I noticed you asked about "${topics[0].query}". Should I research this deeper?`
        };
    }

    getStats() {
        return {
            totalGaps: this.state.stats.totalGaps,
            questionsAsked: this.state.stats.questionsAsked,
            pendingGaps: this.state.gaps.filter(g => {
                return !this.state.explored.includes(g.query);
            }).length
        };
    }
}

module.exports = CuriosityEngine;
