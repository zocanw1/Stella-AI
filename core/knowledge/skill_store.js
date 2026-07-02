const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'skills.json');

class SkillStore {
    constructor() {
        this.skills = this._load();
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
        fs.writeFileSync(STORE_FILE, JSON.stringify(this.skills, null, 2));
    }

    add(skill) {
        this.skills.push({
            ...skill,
            id: 'sk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            storedAt: new Date().toISOString()
        });
        if (this.skills.length > 500) this.skills = this.skills.slice(-500);
        this._save();
        return this.skills[this.skills.length - 1];
    }

    findByTool(toolName) {
        return this.skills.filter(s => (s.tools || []).includes(toolName));
    }

    findByCategory(category) {
        return this.skills.filter(s => s.category === category);
    }

    getAll() { return this.skills; }
    count() { return this.skills.length; }
}

module.exports = SkillStore;
