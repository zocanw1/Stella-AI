/**
 * ============================================
 *  📈 EVOLUTION SYSTEM
 *  Growth, XP, Level, Skill Tree for Stella
 * ============================================
 */

const fs = require('fs');
const path = require('path');
const { shouldLogDebug } = require('./runtime_debug');

const EVO_FILE = path.join(__dirname, '..', 'data', 'evolution_state.json');

// XP rewards for different actions
const XP_TABLE = {
    message_handled: 5,
    tool_used: 10,
    task_completed: 20,
    positive_feedback: 15,
    negative_feedback: -5,
    new_skill_learned: 25,
    proactive_action: 10,
    error_recovered: 8
};

// Skill categories mapped to triggers
const SKILL_CATEGORY_MAP = {
    'execute_command': 'system_admin',
    'read_file': 'file_management',
    'write_file': 'file_management',
    'search_web': 'web_search',
    'generate_image': 'media_creation',
    'generate_voice': 'voice_interaction',
    'send_media': 'media_creation',
    'download_file': 'file_management',
    'screenshot_web': 'web_search',
    'coding': 'coding_help',
    'personal': 'emotional_support',
    'creative': 'creative_writing',
    'schedule': 'scheduling',
    'general': 'conversation'
};

class EvolutionSystem {
    constructor() {
        this.state = this._load();
        if (!this.state.created_at) {
            this.state.created_at = new Date().toISOString();
            this.save();
        }
    }

    _load() {
        try {
            if (fs.existsSync(EVO_FILE)) return JSON.parse(fs.readFileSync(EVO_FILE, 'utf-8'));
        } catch (err) { console.error('[Evolution] Load error:', err.message); }
        return {
            level: 1, xp: 0, xp_to_next_level: 100,
            total_interactions: 0, total_tasks_completed: 0,
            total_positive_feedback: 0, total_negative_feedback: 0,
            personality: {
                friendliness: 0.7, curiosity: 0.5, helpfulness: 0.8,
                humor: 0.4, proactivity: 0.3, patience: 0.6
            },
            skill_tree: {
                conversation: { level: 1, xp: 0 },
                coding_help: { level: 1, xp: 0 },
                system_admin: { level: 1, xp: 0 },
                web_search: { level: 1, xp: 0 },
                file_management: { level: 1, xp: 0 },
                emotional_support: { level: 1, xp: 0 },
                creative_writing: { level: 1, xp: 0 },
                scheduling: { level: 1, xp: 0 },
                media_creation: { level: 1, xp: 0 },
                voice_interaction: { level: 1, xp: 0 }
            },
            milestones: [], created_at: null, last_evolution: null
        };
    }

    save() {
        try {
            fs.writeFileSync(EVO_FILE, JSON.stringify(this.state, null, 2));
        } catch (err) { console.error('[Evolution] Save error:', err.message); }
    }

    // ── XP & Leveling ──
    addXP(amount, reason) {
        this.state.xp += amount;
        if (shouldLogDebug()) console.log(`[Evolution] +${amount} XP (${reason}) | Total: ${this.state.xp}/${this.state.xp_to_next_level}`);

        // Level up check
        let leveledUp = false;
        while (this.state.xp >= this.state.xp_to_next_level) {
            this.state.xp -= this.state.xp_to_next_level;
            this.state.level++;
            this.state.xp_to_next_level = Math.floor(this.state.xp_to_next_level * 1.5);
            leveledUp = true;
            this._addMilestone(`Level Up ke Level ${this.state.level}!`);
            if (shouldLogDebug()) console.log(`🎉 [Evolution] LEVEL UP! Stella sekarang Level ${this.state.level}`);
        }

        // Prevent XP going below 0
        if (this.state.xp < 0) this.state.xp = 0;

        this.save();
        return leveledUp;
    }

    // ── Skill Tree ──
    addSkillXP(skillCategory, amount) {
        const skill = this.state.skill_tree[skillCategory];
        if (!skill) return;

        skill.xp += amount;
        const skillThreshold = 50 * skill.level;

        if (skill.xp >= skillThreshold) {
            skill.xp -= skillThreshold;
            skill.level++;
            this._addMilestone(`Skill "${skillCategory}" naik ke Level ${skill.level}!`);
            if (shouldLogDebug()) console.log(`⭐ [Evolution] Skill "${skillCategory}" -> Level ${skill.level}`);
        }
        this.save();
    }

    getSkillCategory(toolName) {
        return SKILL_CATEGORY_MAP[toolName] || 'conversation';
    }

    // ── Event Handlers ──
    onMessageHandled(topics = []) {
        this.state.total_interactions++;
        this.addXP(XP_TABLE.message_handled, 'message handled');
        this.addSkillXP('conversation', 3);

        // Add skill XP based on topics
        topics.forEach(topic => {
            const cat = SKILL_CATEGORY_MAP[topic];
            if (cat) this.addSkillXP(cat, 2);
        });
    }

    onToolUsed(toolName) {
        this.addXP(XP_TABLE.tool_used, `tool: ${toolName}`);
        const cat = this.getSkillCategory(toolName);
        this.addSkillXP(cat, 5);
    }

    onTaskCompleted() {
        this.state.total_tasks_completed++;
        this.addXP(XP_TABLE.task_completed, 'task completed');
    }

    onPositiveFeedback() {
        this.state.total_positive_feedback++;
        this.addXP(XP_TABLE.positive_feedback, 'positive feedback');
        this._evolvePersonality('friendliness', 0.01);
        this._evolvePersonality('helpfulness', 0.01);
    }

    onNegativeFeedback() {
        this.state.total_negative_feedback++;
        this.addXP(XP_TABLE.negative_feedback, 'negative feedback');
        this._evolvePersonality('patience', 0.01);
        this._evolvePersonality('curiosity', 0.005);
    }

    onNewSkillLearned(skillName) {
        this.addXP(XP_TABLE.new_skill_learned, `new skill: ${skillName}`);
        this._addMilestone(`Belajar skill baru: ${skillName}`);
    }

    // ── Personality Evolution ──
    _evolvePersonality(trait, delta) {
        if (this.state.personality[trait] !== undefined) {
            this.state.personality[trait] = Math.max(0, Math.min(1,
                this.state.personality[trait] + delta
            ));
        }
    }

    getPersonalityPrompt() {
        const p = this.state.personality;
        let prompt = '';

        if (p.friendliness > 0.8) prompt += 'Kamu sangat ramah dan hangat. ';
        else if (p.friendliness < 0.4) prompt += 'Kamu cenderung dingin dan to-the-point. ';

        if (p.humor > 0.7) prompt += 'Kamu suka menyelipkan humor ringan. ';
        if (p.curiosity > 0.7) prompt += 'Kamu sangat penasaran dan suka bertanya balik. ';
        if (p.proactivity > 0.6) prompt += 'Kamu proaktif menawarkan bantuan. ';
        if (p.patience > 0.8) prompt += 'Kamu sangat sabar dengan pertanyaan berulang. ';

        return prompt;
    }

    // ── Milestones ──
    _addMilestone(description) {
        this.state.milestones.push({
            description,
            achieved_at: new Date().toISOString()
        });
        if (this.state.milestones.length > 100) this.state.milestones.shift();
        this.state.last_evolution = new Date().toISOString();
    }

    // ── Stats Display ──
    getSkillPriority(skillCategory) {
        const skill = this.state.skill_tree[skillCategory];
        if (!skill) return 0.5;
        return Math.min(1, 0.3 + (skill.level * 0.1) + (skill.xp / (50 * skill.level) * 0.05));
    }

    getPersonalityModifier() {
        const p = this.state.personality;
        const mods = {};
        if (p.proactivity > 0.6) mods.proactivity = p.proactivity;
        if (p.curiosity > 0.6) mods.curiosity = p.curiosity;
        if (p.patience > 0.7) mods.patience = p.patience;
        if (p.helpfulness > 0.8) mods.helpfulness = p.helpfulness;
        return mods;
    }

    getStatsText() {
        const s = this.state;
        const p = s.personality;
        const xpBar = this._makeProgressBar(s.xp, s.xp_to_next_level);

        let text = `--- STELLA EVOLUTION STATUS ---\n\n`;
        text += `Level: ${s.level}\n`;
        text += `XP: ${xpBar} ${s.xp}/${s.xp_to_next_level}\n\n`;
        text += `Total Interaksi: ${s.total_interactions}\n`;
        text += `Task Selesai: ${s.total_tasks_completed}\n`;
        text += `Feedback: ${s.total_positive_feedback} positif / ${s.total_negative_feedback} negatif\n\n`;

        text += `--- PERSONALITY ---\n`;
        for (const [trait, value] of Object.entries(p)) {
            text += `${trait}: ${this._makeProgressBar(value, 1)} ${Math.round(value * 100)}%\n`;
        }

        text += `\n--- SKILL TREE ---\n`;
        for (const [name, data] of Object.entries(s.skill_tree)) {
            text += `${name}: Lv.${data.level} (XP: ${data.xp}/${50 * data.level})\n`;
        }

        if (s.milestones.length > 0) {
            text += `\n--- MILESTONE TERBARU ---\n`;
            s.milestones.slice(-5).forEach(m => {
                const date = new Date(m.achieved_at).toLocaleDateString('id-ID');
                text += `[${date}] ${m.description}\n`;
            });
        }

        return text;
    }

    getSkillTreeText() {
        let text = `--- STELLA SKILL TREE ---\n\n`;
        for (const [name, data] of Object.entries(this.state.skill_tree)) {
            const bar = this._makeProgressBar(data.xp, 50 * data.level);
            const emoji = this._getSkillEmoji(name);
            text += `${emoji} ${name}\n   Level ${data.level} ${bar} ${data.xp}/${50 * data.level} XP\n\n`;
        }
        return text;
    }

    _makeProgressBar(current, max) {
        const ratio = Math.min(current / Math.max(max, 1), 1);
        const filled = Math.round(ratio * 10);
        return '[' + '='.repeat(filled) + '-'.repeat(10 - filled) + ']';
    }

    _getSkillEmoji(skill) {
        const map = {
            conversation: '💬', coding_help: '💻', system_admin: '🖥️',
            web_search: '🔍', file_management: '📁', emotional_support: '💖',
            creative_writing: '✍️', scheduling: '📅',
            media_creation: '🎨', voice_interaction: '🎙️'
        };
        return map[skill] || '⚡';
    }
}

module.exports = EvolutionSystem;
