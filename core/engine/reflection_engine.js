const fs = require('fs');
const path = require('path');

const REFLECTION_FILE = path.join(__dirname, '..', '..', 'data', 'engine', 'reflections.json');

class ReflectionEngine {
    constructor(deepBrain, experienceEngine, eventBus, EVENTS) {
        this.deepBrain = deepBrain;
        this.experience = experienceEngine;
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.state = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(REFLECTION_FILE, 'utf-8'));
        } catch {
            return { reflections: [], patterns: [], stats: { total: 0, improvementsGenerated: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(REFLECTION_FILE))) {
            fs.mkdirSync(path.dirname(REFLECTION_FILE), { recursive: true });
        }
        fs.writeFileSync(REFLECTION_FILE, JSON.stringify(this.state, null, 2));
    }

    _assessComplexity(task, result, context) {
        const text = (task + ' ' + (result || '')).toLowerCase();
        const wordCount = text.split(/\s+/).length;
        const hasCode = /```|`[^`]+`|function|const |let |var |import /.test(text);
        const hasError = /\b(error|fail|gagal|exception|timeout|crash)\b/.test(text);
        const toolCount = (context.tools || []).length;
        const hasComplexTask = /\b(deploy|debug|refactor|implement|create|build|research|analyze)\b/.test(text);

        if (wordCount > 100 || hasCode || toolCount > 3) return 'high';
        if (wordCount > 30 || hasError || hasComplexTask) return 'medium';
        return 'low';
    }

    async reflect(task, result, context = {}) {
        const complexity = this._assessComplexity(task, result, context);
        if (complexity === 'low') {
            if (this.bus) {
                this.bus.emit(this.EVENTS.REFLECTION_DONE, {
                    skipped: true,
                    reason: 'low_complexity',
                    task: task.substring(0, 80)
                });
            }
            return null;
        }

        const reflection = {
            id: 'rfl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            task: task.substring(0, 300),
            result: (result || '').substring(0, 500),
            outcome: context.success ? 'success' : 'failure',
            timestamp: new Date().toISOString(),
            duration: context.duration || 0,
            toolsUsed: context.tools || [],
            analysis: null,
            improvements: [],
            patterns: []
        };

        reflection.analysis = this._analyze(reflection);

        if (!context.success) {
            reflection.improvements = await this._generateImprovements(reflection, context);
        }

        const detectedPatterns = await this._detectPatterns(reflection);
        reflection.patterns = detectedPatterns;

        this.state.reflections.push(reflection);
        this.state.stats.total++;
        if (this.state.reflections.length > 200) this.state.reflections = this.state.reflections.slice(-200);
        this._save();

        if (this.experience) {
            const improvementText = reflection.improvements.map(i => i.suggestion).join('. ');
            await this.experience.record(task, result, improvementText, { tools: context.tools || [] });
        }

        if (this.bus) {
            this.bus.emit(this.EVENTS.REFLECTION_DONE, {
                reflectionId: reflection.id,
                outcome: reflection.outcome,
                improvementCount: reflection.improvements.length
            });
        }

        return reflection;
    }

    _analyze(reflection) {
        const text = (reflection.task + ' ' + reflection.result).toLowerCase();

        return {
            wasSuccessful: reflection.outcome === 'success',
            hadErrors: /\b(error|fail|gagal|exception|timeout)\b/.test(text),
            wasHelpful: /\b(thank|makasih|terima|bagus|berhasil|mantap)\b/.test(text) ? true :
                        /\b(salah|jelek|gagal|bencana|tidak|nggak)\b/.test(text) ? false : null,
            complexity: text.length > 500 ? 'high' : text.length > 150 ? 'medium' : 'low',
            toolDiversity: new Set(reflection.toolsUsed).size
        };
    }

    async _generateImprovements(reflection, context) {
        const improvements = [];
        const errors = reflection.result.toLowerCase();

        if (errors.includes('timeout')) {
            improvements.push({
                type: 'optimization',
                suggestion: 'Increase timeout or split task into smaller chunks',
                targetArea: 'execution'
            });
        }
        if (errors.includes('not found') || errors.includes('tidak ditemukan')) {
            improvements.push({
                type: 'preparation',
                suggestion: 'Verify file/resource existence before proceeding',
                targetArea: 'planning'
            });
        }
        if (errors.includes('permission') || errors.includes('denied') || errors.includes('ditolak')) {
            improvements.push({
                type: 'safety',
                suggestion: 'Check permissions before attempting operation',
                targetArea: 'execution'
            });
        }
        if (reflection.toolsUsed.length === 0 && reflection.analysis.complexity === 'high') {
            improvements.push({
                type: 'strategy',
                suggestion: 'Break down complex tasks into tool-using subtasks',
                targetArea: 'planning'
            });
        }

        if (improvements.length === 0) {
            improvements.push({
                type: 'general',
                suggestion: 'Review approach and consider alternative strategies',
                targetArea: 'strategy'
            });
        }

        return improvements;
    }

    async _detectPatterns(reflection) {
        const patterns = [];
        if (reflection.toolsUsed.length > 0) {
            const existing = this.state.patterns.find(p =>
                JSON.stringify(p.tools) === JSON.stringify(reflection.toolsUsed) &&
                p.outcome === reflection.outcome
            );

            if (existing) {
                existing.frequency++;
                existing.lastSeen = new Date().toISOString();
            } else {
                this.state.patterns.push({
                    id: 'pat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    tools: reflection.toolsUsed,
                    outcome: reflection.outcome,
                    frequency: 1,
                    firstSeen: new Date().toISOString(),
                    lastSeen: new Date().toISOString()
                });
            }
            patterns.push({ tools: reflection.toolsUsed, outcome: reflection.outcome });
        }
        if (this.state.patterns.length > 100) this.state.patterns = this.state.patterns.slice(-100);
        return patterns;
    }

    async deepReflect(recentHistory = []) {
        if (recentHistory.length < 3) return null;

        const failures = recentHistory.filter(r => r.outcome === 'failure');
        const successes = recentHistory.filter(r => r.outcome === 'success');

        const summary = {
            id: 'deep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            timestamp: new Date().toISOString(),
            period: {
                from: recentHistory[0]?.timestamp,
                to: recentHistory[recentHistory.length - 1]?.timestamp
            },
            totals: { reflections: recentHistory.length, failures: failures.length, successes: successes.length },
            successRate: recentHistory.length > 0 ? (successes.length / recentHistory.length * 100).toFixed(1) : 0,
            commonFailurePatterns: this._findCommonPatterns(failures),
            commonSuccessPatterns: this._findCommonPatterns(successes),
            improvements: this._prioritizeImprovements(failures),
        };

        this.state.stats.improvementsGenerated += summary.improvements.length;
        this._save();
        return summary;
    }

    _findCommonPatterns(entries) {
        if (entries.length === 0) return [];
        const toolCounts = {};
        for (const e of entries) {
            for (const t of (e.toolsUsed || [])) {
                toolCounts[t] = (toolCounts[t] || 0) + 1;
            }
        }
        return Object.entries(toolCounts)
            .filter(([, count]) => count >= 2)
            .sort(([, a], [, b]) => b - a)
            .map(([tool, count]) => ({ tool, occurrences: count }));
    }

    _prioritizeImprovements(failures) {
        const suggestions = {};
        for (const f of failures) {
            for (const imp of (f.improvements || [])) {
                const key = imp.suggestion;
                suggestions[key] = (suggestions[key] || 0) + 1;
            }
        }
        return Object.entries(suggestions)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([suggestion, frequency]) => ({ suggestion, frequency }));
    }

    getStats() {
        return {
            totalReflections: this.state.stats.total,
            improvementsGenerated: this.state.stats.improvementsGenerated,
            patternsDetected: this.state.patterns.length
        };
    }
}

module.exports = ReflectionEngine;
