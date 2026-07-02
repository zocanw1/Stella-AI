const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'rules.json');

class RuleStore {
    constructor() {
        this.rules = this._load();
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
        fs.writeFileSync(STORE_FILE, JSON.stringify(this.rules, null, 2));
    }

    add(rule) {
        this.rules.push({
            ...rule,
            id: 'rule_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            storedAt: new Date().toISOString()
        });
        if (this.rules.length > 300) this.rules = this.rules.slice(-300);
        this._save();
        return this.rules[this.rules.length - 1];
    }

    match(text) {
        const lower = text.toLowerCase();
        return this.rules
            .filter(r => !r.disabled)
            .filter(r => (r.triggers || []).some(t => lower.includes(t.toLowerCase())))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    getAll() { return this.rules.filter(r => !r.disabled); }
    count() { return this.rules.length; }
}

module.exports = RuleStore;
