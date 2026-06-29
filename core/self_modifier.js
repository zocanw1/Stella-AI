/**
 * ============================================
 *  🔧 SELF-MODIFIER
 *  Stella can modify her own behavior
 * ============================================
 * 
 * 3 Levels of self-modification:
 *   Level 1: Config (personality, knowledge) - SAFE
 *   Level 2: Prompt patches (inject custom instructions) - MEDIUM
 *   Level 3: Custom rules (declarative BT rules) - ADVANCED
 */

const fs = require('fs');
const path = require('path');
const { filterPromptPatch } = require('./persona_policy');

const PATCHES_FILE = path.join(__dirname, '..', 'data', 'prompt_patches.json');
const RULES_FILE = path.join(__dirname, '..', 'data', 'custom_rules.json');
const MAX_PATCHES = 20;
const MAX_RULES = 30;

class SelfModifier {
    constructor(evolutionSystem, learningEngine) {
        this.evolution = evolutionSystem;
        this.learning = learningEngine;
        this.patches = this._loadJSON(PATCHES_FILE, { patches: [], history: [], last_reflection: null });
        this.rules = this._loadJSON(RULES_FILE, { rules: [], created_by_stella: true, last_updated: null });
    }

    _loadJSON(filePath, defaultValue) {
        try {
            if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) { /* ignore */ }
        return JSON.parse(JSON.stringify(defaultValue));
    }

    _save() {
        try {
            fs.writeFileSync(PATCHES_FILE, JSON.stringify(this.patches, null, 2));
            fs.writeFileSync(RULES_FILE, JSON.stringify(this.rules, null, 2));
        } catch (e) { console.error('[SelfMod] Save error:', e.message); }
    }

    // ═══════════════════════════════════════
    //  LEVEL 2: PROMPT PATCHES
    // ═══════════════════════════════════════

    /**
     * Add a prompt patch. Stella writes instructions for herself.
     */
    addPatch(content, reason, source = 'self_reflection') {
        // Prevent duplicate patches
        if (this.patches.patches.some(p => p.content === content)) return false;

        this.patches.patches.push({
            content,
            reason,
            source,
            active: true,
            created_at: new Date().toISOString(),
            effectiveness: 0 // Updated by feedback
        });

        // Cap at MAX_PATCHES, remove lowest effectiveness
        if (this.patches.patches.length > MAX_PATCHES) {
            this.patches.patches.sort((a, b) => b.effectiveness - a.effectiveness);
            const removed = this.patches.patches.pop();
            this.patches.history.push({ ...removed, removed_at: new Date().toISOString() });
        }

        if (this.patches.history.length > 50) this.patches.history = this.patches.history.slice(-50);

        console.log(`[SelfMod] New patch added: "${content.substring(0, 60)}..."`);
        this._save();
        return true;
    }

    /**
     * Remove a patch by index.
     */
    removePatch(index) {
        if (index < 0 || index >= this.patches.patches.length) return false;
        const removed = this.patches.patches.splice(index, 1)[0];
        this.patches.history.push({ ...removed, removed_at: new Date().toISOString() });
        this._save();
        return true;
    }

    /**
     * Get all active patches as prompt text.
     */
    getActivePatchesPrompt() {
        const active = this.patches.patches
            .filter(p => p.active)
            .map(p => ({ ...p, content: filterPromptPatch(p.content) }))
            .filter(p => p.content);
        if (active.length === 0) return '';

        let prompt = '\n--- SELF-IMPROVEMENT PATCHES (ditulis oleh Stella sendiri) ---\n';
        active.forEach((p, i) => {
            prompt += `${i + 1}. ${p.content}\n`;
        });
        prompt += '--- END PATCHES ---\n';
        return prompt;
    }

    // ═══════════════════════════════════════
    //  LEVEL 3: CUSTOM RULES
    // ═══════════════════════════════════════

    /**
     * Add a custom behavior rule.
     * Rules are declarative (condition → action), not raw code.
     */
    addRule(condition, action, description) {
        if (this.rules.rules.some(r => r.description === description)) return false;

        this.rules.rules.push({
            condition,   // e.g. { type: 'time_range', from: 22, to: 6 }
            action,      // e.g. { type: 'set_personality', trait: 'empathy', value: 0.9 }
            description,
            active: true,
            created_at: new Date().toISOString(),
            times_triggered: 0
        });

        if (this.rules.rules.length > MAX_RULES) {
            this.rules.rules = this.rules.rules.slice(-MAX_RULES);
        }

        this.rules.last_updated = new Date().toISOString();
        console.log(`[SelfMod] New rule: "${description}"`);
        this._save();
        return true;
    }

    /**
     * Evaluate all active rules against current context.
     * Returns actions to execute.
     */
    evaluateRules(context) {
        const actions = [];
        const now = new Date();
        const hour = now.getHours();

        for (const rule of this.rules.rules) {
            if (!rule.active) continue;

            let triggered = false;

            switch (rule.condition.type) {
                case 'time_range':
                    if (rule.condition.from <= rule.condition.to) {
                        triggered = hour >= rule.condition.from && hour < rule.condition.to;
                    } else {
                        triggered = hour >= rule.condition.from || hour < rule.condition.to;
                    }
                    break;
                case 'topic_match':
                    triggered = context.topics && context.topics.includes(rule.condition.topic);
                    break;
                case 'sentiment_match':
                    triggered = context.sentiment === rule.condition.sentiment;
                    break;
                case 'interaction_count_above':
                    const user = this.learning.interactionPatterns.users[context.userId];
                    triggered = user && user.interaction_count > rule.condition.count;
                    break;
                case 'always':
                    triggered = true;
                    break;
            }

            if (triggered) {
                rule.times_triggered++;
                actions.push(rule.action);
            }
        }

        if (actions.length > 0) this._save();
        return actions;
    }

    /**
     * Execute actions from custom rules.
     */
    executeActions(actions, context) {
        for (const action of actions) {
            switch (action.type) {
                case 'set_personality':
                    if (this.evolution.state.personality[action.trait] !== undefined) {
                        this.evolution.state.personality[action.trait] = Math.max(0, Math.min(1, action.value));
                        this.evolution.save();
                    }
                    break;
                case 'inject_prompt':
                    context.rulePrompt = (context.rulePrompt || '') + '\n' + action.text;
                    break;
                case 'boost_skill':
                    this.evolution.addSkillXP(action.skill, action.amount || 5);
                    break;
            }
        }
    }

    // ═══════════════════════════════════════
    //  SELF-REFLECTION (Meta-Cognition)
    // ═══════════════════════════════════════

    /**
     * Generate a self-reflection prompt for Gemini to analyze Stella's performance.
     * Returns the analysis prompt to send to Gemini.
     */
    buildReflectionPrompt() {
        const evo = this.evolution.state;
        const feedbackRatio = evo.total_positive_feedback /
            Math.max(evo.total_positive_feedback + evo.total_negative_feedback, 1);

        const topTopics = Object.entries(this.learning.knowledgeBase.topic_frequency)
            .sort((a, b) => b[1] - a[1]).slice(0, 5);

        const recentSkills = this.learning.knowledgeBase.skills.slice(-5);

        let prompt = `Kamu adalah Stella yang sedang melakukan SELF-REFLECTION (introspeksi diri).
Analisis data performa berikut dan berikan SARAN PERBAIKAN untuk dirimu sendiri.

DATA PERFORMA:
- Level: ${evo.level}
- Total interaksi: ${evo.total_interactions}
- Feedback ratio: ${Math.round(feedbackRatio * 100)}% positif
- Feedback positif: ${evo.total_positive_feedback}
- Feedback negatif: ${evo.total_negative_feedback}

PERSONALITY SAAT INI:
${Object.entries(evo.personality).map(([k, v]) => `- ${k}: ${Math.round(v * 100)}%`).join('\n')}

TOPIK PALING SERING:
${topTopics.map(([t, c]) => `- ${t}: ${c}x`).join('\n')}

SKILL TERAKHIR DIPELAJARI:
${recentSkills.map(s => `- "${s.trigger}" (success: ${Math.round(s.success_rate * 100)}%)`).join('\n')}

PROMPT PATCHES AKTIF:
${this.patches.patches.filter(p => p.active).map(p => `- ${p.content}`).join('\n') || 'Belum ada patches.'}

INSTRUKSI:
Berdasarkan data di atas, berikan TEPAT 1-3 saran perbaikan dalam format:
[PATCH: saran instruksi untuk dirimu sendiri]
[RULE: kondisi | aksi | deskripsi]

Contoh:
[PATCH: Berikan jawaban lebih singkat karena user rata-rata bertanya hal teknis]
[RULE: time_range:22-6 | inject_prompt:Gunakan nada lebih lembut karena sudah malam | Mode malam empati]

PENTING: Saran harus SPESIFIK dan ACTIONABLE. Jangan terlalu generic.`;

        return prompt;
    }

    /**
     * Parse Gemini's self-reflection response and apply changes.
     */
    applyReflectionResults(responseText) {
        let patchesAdded = 0;
        let rulesAdded = 0;

        // Parse patches
        const patchRegex = /\[PATCH:\s*(.*?)\]/g;
        let match;
        while ((match = patchRegex.exec(responseText)) !== null) {
            const content = match[1].trim();
            if (content.length > 10 && content.length < 300) {
                this.addPatch(content, 'self_reflection', 'self_reflection');
                patchesAdded++;
            }
        }

        // Parse rules
        const ruleRegex = /\[RULE:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/g;
        while ((match = ruleRegex.exec(responseText)) !== null) {
            const condStr = match[1].trim();
            const actStr = match[2].trim();
            const desc = match[3].trim();

            const condition = this._parseCondition(condStr);
            const action = this._parseAction(actStr);

            if (condition && action) {
                this.addRule(condition, action, desc);
                rulesAdded++;
            }
        }

        this.patches.last_reflection = new Date().toISOString();
        this._save();

        console.log(`[SelfMod] Reflection applied: ${patchesAdded} patches, ${rulesAdded} rules`);
        return { patchesAdded, rulesAdded };
    }

    _parseCondition(str) {
        if (str.startsWith('time_range:')) {
            const range = str.replace('time_range:', '').split('-');
            return { type: 'time_range', from: parseInt(range[0]) || 0, to: parseInt(range[1]) || 24 };
        }
        if (str.startsWith('topic:')) {
            return { type: 'topic_match', topic: str.replace('topic:', '').trim() };
        }
        if (str.startsWith('sentiment:')) {
            return { type: 'sentiment_match', sentiment: str.replace('sentiment:', '').trim() };
        }
        if (str === 'always') {
            return { type: 'always' };
        }
        return null;
    }

    _parseAction(str) {
        if (str.startsWith('inject_prompt:')) {
            return { type: 'inject_prompt', text: str.replace('inject_prompt:', '').trim() };
        }
        if (str.startsWith('set_personality:')) {
            const parts = str.replace('set_personality:', '').split('=');
            return { type: 'set_personality', trait: parts[0].trim(), value: parseFloat(parts[1]) || 0.5 };
        }
        if (str.startsWith('boost_skill:')) {
            const parts = str.replace('boost_skill:', '').split('=');
            return { type: 'boost_skill', skill: parts[0].trim(), amount: parseInt(parts[1]) || 5 };
        }
        return null;
    }

    // ── Display ──
    getPatchesText() {
        const active = this.patches.patches.filter(p => p.active);
        if (active.length === 0) return '--- PROMPT PATCHES ---\nBelum ada patches. Stella belum pernah melakukan self-reflection.\n';

        let text = `--- PROMPT PATCHES (${active.length} aktif) ---\n\n`;
        active.forEach((p, i) => {
            const date = new Date(p.created_at).toLocaleDateString('id-ID');
            text += `${i + 1}. "${p.content}"\n   Source: ${p.source} | Created: ${date}\n\n`;
        });
        if (this.patches.last_reflection) {
            text += `Last Reflection: ${new Date(this.patches.last_reflection).toLocaleString('id-ID')}\n`;
        }
        return text;
    }

    getRulesText() {
        if (this.rules.rules.length === 0) return '--- CUSTOM RULES ---\nBelum ada rules.\n';

        let text = `--- CUSTOM RULES (${this.rules.rules.length}) ---\n\n`;
        this.rules.rules.forEach((r, i) => {
            text += `${i + 1}. ${r.description}\n`;
            text += `   Condition: ${JSON.stringify(r.condition)}\n`;
            text += `   Action: ${JSON.stringify(r.action)}\n`;
            text += `   Triggered: ${r.times_triggered}x\n\n`;
        });
        return text;
    }
}

module.exports = SelfModifier;
