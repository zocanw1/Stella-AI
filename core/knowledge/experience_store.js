const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'experiences.json');

class ExperienceStore {
    constructor() {
        this.experiences = this._load();
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
        fs.writeFileSync(STORE_FILE, JSON.stringify(this.experiences, null, 2));
    }

    add(exp) {
        this.experiences.push({
            ...exp,
            id: 'exp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            storedAt: new Date().toISOString()
        });
        if (this.experiences.length > 500) this.experiences = this.experiences.slice(-500);
        this._save();
        return this.experiences[this.experiences.length - 1];
    }

    findByOutcome(success) {
        return this.experiences.filter(e => e.outcome === (success ? 'success' : 'failure'));
    }

    findByTool(toolName) {
        return this.experiences.filter(e => (e.tools || []).includes(toolName));
    }

    getRecent(limit = 10) {
        return this.experiences.slice(-limit).reverse();
    }

    getAll() { return this.experiences; }
    count() { return this.experiences.length; }
}

module.exports = ExperienceStore;
