const fs = require('fs');
const path = require('path');

const GOAL_FILE = path.join(__dirname, '..', '..', 'data', 'engine', 'goals.json');

class GoalEngine {
    constructor(eventBus, EVENTS) {
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.state = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(GOAL_FILE, 'utf-8'));
        } catch {
            return { goals: [], archived: [], stats: { totalDetected: 0, completed: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(GOAL_FILE))) {
            fs.mkdirSync(path.dirname(GOAL_FILE), { recursive: true });
        }
        fs.writeFileSync(GOAL_FILE, JSON.stringify(this.state, null, 2));
    }

    detectGoal(message, userId) {
        const text = message.toLowerCase();
        let detected = null;
        let confidence = 0;

        const patterns = [
            { regex: /\b(saya mau|aku ingin|i want|i need|saya perlu|target saya)\b(.+)/i, priority: 1 },
            { regex: /\b(tujuan|goal|target|rencana|plan)\b.*\b(adalah|is|yaitu|:)\s*(.+)/i, priority: 1 },
            { regex: /\b(belajar|learn|menguasai|master)\s+(.+)/i, priority: 2 },
            { regex: /\b(bikin|buat|membangun|build|create|develop)\s+(.+)/i, priority: 2 },
            { regex: /\b(selesaikan|finish|complete|selesain)\s+(.+)/i, priority: 2 },
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern.regex);
            if (match) {
                const goalText = match[match.length - 1].trim().substring(0, 200);
                if (goalText.length > 5) {
                    detected = goalText;
                    confidence = pattern.priority === 1 ? 0.8 : 0.6;
                    break;
                }
            }
        }

        if (detected) {
            return this._addGoal(detected, userId, confidence);
        }

        const goalKeywords = ['ingin', 'mau', 'target', 'cita-cita', 'rencana', 'goal', 'aim'];
        const hasGoalIntent = goalKeywords.some(k => text.includes(k));

        if (hasGoalIntent && text.length > 20) {
            const lastWords = text.split(/\s+/).slice(-10).join(' ');
            if (lastWords.length > 10) {
                return this._addGoal(lastWords, userId, 0.4);
            }
        }

        return null;
    }

    _addGoal(goalText, userId, confidence) {
        const existing = this.state.goals.find(g =>
            g.text.toLowerCase().includes(goalText.toLowerCase().slice(0, 20)) &&
            g.userId === userId && g.status === 'active'
        );

        if (existing) {
            existing.confidence = Math.max(existing.confidence, confidence);
            existing.lastMentioned = new Date().toISOString();
            existing.mentionCount++;
            this._save();
            return existing;
        }

        const goal = {
            id: 'goal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            text: goalText,
            userId,
            confidence,
            status: 'active',
            progress: 0,
            createdAt: new Date().toISOString(),
            lastMentioned: new Date().toISOString(),
            mentionCount: 1,
            milestones: [],
            relatedTasks: []
        };

        this.state.goals.push(goal);
        this.state.stats.totalDetected++;
        if (this.state.goals.length > 50) this.state.goals = this.state.goals.slice(-50);
        this._save();

        if (this.bus) {
            this.bus.emit(this.EVENTS.GOAL_DETECTED, { goalId: goal.id, text: goal.text, confidence });
        }

        return goal;
    }

    updateProgress(goalId, delta = 0.05) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (goal && goal.status === 'active') {
            goal.progress = Math.min(1, Math.max(0, goal.progress + delta));
            if (goal.progress >= 1) {
                goal.status = 'completed';
                goal.completedAt = new Date().toISOString();
                this.state.stats.completed++;
                if (this.bus) this.bus.emit(this.EVENTS.GOAL_COMPLETED, { goalId, text: goal.text });
            } else {
                if (this.bus) this.bus.emit(this.EVENTS.GOAL_PROGRESS, { goalId, progress: goal.progress });
            }
            this._save();
            return true;
        }
        return false;
    }

    addMilestone(goalId, description) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (goal) {
            goal.milestones.push({
                description,
                achievedAt: new Date().toISOString()
            });
            this.updateProgress(goalId, 0.1);
            this._save();
            return true;
        }
        return false;
    }

    addRelatedTask(goalId, taskDescription) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (goal) {
            goal.relatedTasks.push({
                task: taskDescription,
                timestamp: new Date().toISOString()
            });
            this._save();
            return true;
        }
        return false;
    }

    getActiveGoals(userId) {
        return this.state.goals.filter(g => g.userId === userId && g.status === 'active')
            .sort((a, b) => b.confidence - a.confidence);
    }

    getGoalsContext(userId) {
        const active = this.getActiveGoals(userId);
        if (active.length === 0) return null;

        let context = 'User goals:\n';
        for (const g of active) {
            const bar = '[' + '=' .repeat(Math.round(g.progress * 10)) + '-'.repeat(10 - Math.round(g.progress * 10)) + ']';
            context += `- ${g.text} ${bar} ${Math.round(g.progress * 100)}%\n`;
        }
        return context;
    }

    getStats() {
        const active = this.state.goals.filter(g => g.status === 'active').length;
        const completed = this.state.stats.completed;
        return { active, completed, totalDetected: this.state.stats.totalDetected };
    }
}

module.exports = GoalEngine;
