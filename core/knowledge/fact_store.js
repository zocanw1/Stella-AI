const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'facts.json');

class FactStore {
    constructor() {
        this.facts = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        } catch {
            return [];
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(STORE_FILE))) {
            fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
        }
        fs.writeFileSync(STORE_FILE, JSON.stringify(this.facts, null, 2));
    }

    add(fact) {
        this.facts.push({
            ...fact,
            id: 'fact_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            storedAt: new Date().toISOString()
        });
        if (this.facts.length > 1000) this.facts = this.facts.slice(-1000);
        this._save();
        return this.facts[this.facts.length - 1];
    }

    query(filter = {}) {
        let results = [...this.facts];
        if (filter.category) results = results.filter(f => f.category === filter.category);
        if (filter.source) results = results.filter(f => f.source === filter.source);
        if (filter.minConfidence) results = results.filter(f => (f.confidence || 0) >= filter.minConfidence);
        if (filter.limit) results = results.slice(0, filter.limit);
        return results;
    }

    search(text, maxResults = 5) {
        const lower = text.toLowerCase();
        const words = lower.split(/\s+/).filter(w => w.length > 3);
        const scored = this.facts.map(f => {
            const fl = f.statement.toLowerCase();
            const matches = words.filter(w => fl.includes(w)).length;
            return { ...f, score: matches / Math.max(words.length, 1) };
        });
        return scored.filter(f => f.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
    }

    getAll() { return this.facts; }
    count() { return this.facts.length; }
}

module.exports = FactStore;
