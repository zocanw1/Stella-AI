const fs = require('fs');
const path = require('path');
const { SKILL_REGISTRY } = require('./registry');

const SKILL_STATE_FILE = path.join(__dirname, '..', '..', 'data', 'skills', 'state.json');

class SkillEngine {
    constructor(deepBrain, eventBus, EVENTS) {
        this.deepBrain = deepBrain;
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.state = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(SKILL_STATE_FILE, 'utf-8'));
        } catch {
            const skills = {};
            for (const [key, def] of Object.entries(SKILL_REGISTRY)) {
                skills[key] = {
                    level: 0, xp: 0, xpToNext: 50,
                    timesUsed: 0, lastUsed: null,
                    successRate: 0.5, avgConfidence: 0.5
                };
            }
            return { skills, history: [], totalActions: 0 };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(SKILL_STATE_FILE))) {
            fs.mkdirSync(path.dirname(SKILL_STATE_FILE), { recursive: true });
        }
        fs.writeFileSync(SKILL_STATE_FILE, JSON.stringify(this.state, null, 2));
    }

    getSkill(key) {
        return this.state.skills[key] || null;
    }

    getDefinition(key) {
        return SKILL_REGISTRY[key] || null;
    }

    async recordUse(skillKey, toolName, success = true, confidence = 0.7) {
        let skill = this.state.skills[skillKey];
        if (!skill) {
            if (!SKILL_REGISTRY[skillKey]) return null;
            skill = { level: 0, xp: 0, xpToNext: 50, timesUsed: 0, lastUsed: null, successRate: 0.5, avgConfidence: 0.5 };
            this.state.skills[skillKey] = skill;
        }

        skill.timesUsed++;
        skill.lastUsed = new Date().toISOString();
        skill.successRate = (skill.successRate * (skill.timesUsed - 1) + (success ? 1 : 0)) / skill.timesUsed;
        skill.avgConfidence = (skill.avgConfidence * (skill.timesUsed - 1) + confidence) / skill.timesUsed;

        const xpGain = success ? (10 + Math.round(confidence * 10)) : 2;
        skill.xp += xpGain;

        while (skill.xp >= skill.xpToNext) {
            skill.xp -= skill.xpToNext;
            skill.level++;
            skill.xpToNext = Math.round(skill.xpToNext * 1.5);
        }

        this.state.totalActions++;
        this._save();

        if (this.bus) {
            this.bus.emit(this.EVENTS.SKILL_USED, {
                skill: skillKey,
                tool: toolName,
                success,
                level: skill.level
            });
        }

        return skill;
    }

    async canUse(skillKey) {
        const def = SKILL_REGISTRY[skillKey];
        if (!def) return { allowed: false, reason: 'unknown_skill' };

        for (const prereq of def.prerequisites) {
            const pskill = this.state.skills[prereq];
            if (!pskill || pskill.level < 1) {
                return { allowed: false, reason: `missing_prerequisite: ${prereq}` };
            }
        }

        const skill = this.state.skills[skillKey];
        return { allowed: true, level: skill ? skill.level : 0 };
    }

    async recommendTools(task) {
        const scored = [];
        for (const [key, def] of Object.entries(SKILL_REGISTRY)) {
            const skill = this.state.skills[key];
            const level = skill ? skill.level : 0;
            const successRate = skill ? skill.successRate : 0.5;
            const score = this._computeToolScore(task, def, level, successRate);
            if (score > 0) {
                scored.push({ skill: key, definition: def, score, level, successRate });
            }
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 5);
    }

    _computeToolScore(task, def, level, successRate) {
        const text = task.toLowerCase();
        let score = 0;

        const triggers = {
            web_search: ['cari', 'search', 'google', 'temukan', 'cari tahu'],
            code_execution: ['run', 'jalankan', 'execute', 'terminal', 'command', 'npm', 'node'],
            image_generation: ['gambar', 'image', 'foto', 'ilustrasi', 'generate image'],
            voice_generation: ['voice', 'suara', 'bicarakan', 'bacakan'],
            web_screenshot: ['screenshot', 'capture', 'ss halaman'],
            file_management: ['baca file', 'tulis file', 'edit file', 'buat file'],
            web_research: ['riset', 'research', 'analisis', 'teliti'],
            debugging: ['debug', 'error', 'bug', 'salah', 'perbaiki'],
            deploy: ['deploy', 'publish', 'production', 'hosting']
        };

        const toolTriggers = triggers[def.name.toLowerCase().replace(/\s+/g, '_')];
        if (toolTriggers) {
            for (const t of toolTriggers) {
                if (text.includes(t)) score += 2;
            }
        }

        score += level * 0.3;
        score += successRate * 0.5;
        return score;
    }

    getStats() {
        const levels = {};
        for (const [key, skill] of Object.entries(this.state.skills)) {
            if (!levels[skill.level]) levels[skill.level] = [];
            levels[skill.level].push(key);
        }
        return {
            totalSkills: Object.keys(this.state.skills).length,
            registeredSkills: Object.keys(SKILL_REGISTRY).length,
            totalActions: this.state.totalActions,
            levelDistribution: Object.fromEntries(
                Object.entries(levels).map(([k, v]) => [k, v.length])
            )
        };
    }
}

module.exports = SkillEngine;
