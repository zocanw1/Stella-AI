const fs = require('fs');
const path = require('path');

const PLAN_FILE = path.join(__dirname, '..', '..', 'data', 'engine', 'plans.json');

class PlanningEngine {
    constructor(deepBrain, skillEngine, eventBus, EVENTS) {
        this.deepBrain = deepBrain;
        this.skills = skillEngine;
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.history = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(PLAN_FILE, 'utf-8'));
        } catch {
            return { plans: [], outcomes: [], stats: { total: 0, success: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(PLAN_FILE))) {
            fs.mkdirSync(path.dirname(PLAN_FILE), { recursive: true });
        }
        fs.writeFileSync(PLAN_FILE, JSON.stringify(this.history, null, 2));
    }

    async plan(task, context = {}) {
        const subsystems = context.availableSubsystems || {};
        const skillset = context.skills || [];

        const plan = {
            id: 'pln_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            goal: task.substring(0, 300),
            createdAt: new Date().toISOString(),
            subtasks: [],
            estimatedTotalCost: 0,
            estimatedTotalTime: null,
            risks: [],
            overallConfidence: 0.5,
            requiredTools: [],
            fallback: null,
            requiredMemory: [],
            expectedOutcome: null,
            alternatives: [],
            status: 'draft'
        };

        const subtaskDefs = this._decompose(task);
        let totalCost = 0;
        let totalConfidence = 0;
        const allRisks = [];
        const allTools = new Set();

        for (const def of subtaskDefs) {
            const subtask = {
                name: def.name,
                description: def.description,
                estimatedCost: this._estimateCost(def),
                risk: this._assessRisk(def, context),
                confidence: await this._predictConfidence(def, context),
                requiredTools: def.requiredTools || [],
                expectedResult: def.expectedResult || 'unknown',
                dependencies: def.dependencies || [],
                status: 'pending'
            };

            totalCost += subtask.estimatedCost;
            totalConfidence += subtask.confidence;
            if (subtask.risk) allRisks.push(subtask.risk);
            for (const tool of subtask.requiredTools) allTools.add(tool);

            plan.subtasks.push(subtask);
        }

        plan.estimatedTotalCost = totalCost;
        plan.estimatedTotalTime = this._estimateTotalTime(plan.subtasks);
        plan.overallConfidence = plan.subtasks.length > 0 ? totalConfidence / plan.subtasks.length : 0.5;
        plan.risks = this._consolidateRisks(allRisks);
        plan.requiredTools = [...allTools];
        plan.fallback = this._getFallback(task, plan);
        plan.requiredMemory = this._getRequiredMemory(task, plan);
        plan.expectedOutcome = this._predictOutcome(task, plan);
        plan.alternatives = await this._generateAlternatives(task, plan, context);

        this.history.plans.push(plan);
        this.history.stats.total++;
        if (this.history.plans.length > 100) this.history.plans = this.history.plans.slice(-100);
        this._save();

        return plan;
    }

    _decompose(task) {
        const text = task.toLowerCase();
        const subtasks = [];

        if (/\b(deploy|publish|production)\b/.test(text)) {
            subtasks.push(
                { name: 'install_deps', description: 'Install dependencies', requiredTools: ['execute_command'], expectedResult: 'dependencies installed', dependencies: [] },
                { name: 'build', description: 'Build project', requiredTools: ['execute_command'], expectedResult: 'build successful', dependencies: ['install_deps'] },
                { name: 'test', description: 'Run tests', requiredTools: ['execute_command'], expectedResult: 'tests passing', dependencies: ['build'] },
                { name: 'deploy', description: 'Deploy to target', requiredTools: ['execute_command', 'read_file'], expectedResult: 'deployment complete', dependencies: ['test'] },
                { name: 'verify', description: 'Verify deployment', requiredTools: ['fetch_webpage'], expectedResult: 'deployment verified', dependencies: ['deploy'] }
            );
        } else if (/\b(riset|research|analyze|analisis|teliti)\b/.test(text)) {
            subtasks.push(
                { name: 'search', description: 'Search for information', requiredTools: ['search_web'], expectedResult: 'search results', dependencies: [] },
                { name: 'fetch_sources', description: 'Fetch relevant sources', requiredTools: ['fetch_webpage'], expectedResult: 'source content', dependencies: ['search'] },
                { name: 'synthesize', description: 'Synthesize findings', requiredTools: [], expectedResult: 'synthesized analysis', dependencies: ['fetch_sources'] }
            );
        } else if (/\b(gambar|image|foto|generate)\b/.test(text)) {
            subtasks.push(
                { name: 'generate_media', description: 'Generate image', requiredTools: ['generate_image'], expectedResult: 'generated image file', dependencies: [] },
                { name: 'send_media', description: 'Send image to user', requiredTools: ['send_media'], expectedResult: 'image sent', dependencies: ['generate_media'] }
            );
        } else if (/\b(debug|error|bug|fix|perbaiki)\b/.test(text)) {
            subtasks.push(
                { name: 'identify', description: 'Identify the issue', requiredTools: ['read_file', 'execute_command'], expectedResult: 'issue identified', dependencies: [] },
                { name: 'fix', description: 'Apply fix', requiredTools: ['write_file'], expectedResult: 'fix applied', dependencies: ['identify'] },
                { name: 'verify', description: 'Verify the fix', requiredTools: ['execute_command'], expectedResult: 'fix verified', dependencies: ['fix'] }
            );
        } else {
            subtasks.push(
                { name: 'understand', description: 'Understand the request', requiredTools: [], expectedResult: 'request understood', dependencies: [] },
                { name: 'execute', description: 'Execute the plan', requiredTools: [], expectedResult: 'task completed', dependencies: ['understand'] }
            );
        }

        return subtasks;
    }

    _estimateCost(subtask) {
        const costs = {
            install_deps: 3, build: 5, test: 4, deploy: 6, verify: 2,
            search: 2, fetch_sources: 3, synthesize: 4,
            generate_media: 4, send_media: 1,
            identify: 5, fix: 6,
            understand: 1, execute: 3
        };
        return costs[subtask.name] || 3;
    }

    _assessRisk(subtask, context) {
        const riskMap = {
            deploy: { level: 'high', factor: 'production changes', mitigation: 'test before deploy' },
            build: { level: 'medium', factor: 'build may fail', mitigation: 'check dependencies' },
            fix: { level: 'high', factor: 'changes may break other things', mitigation: 'backup before edit' }
        };
        return riskMap[subtask.name] || { level: 'low', factor: 'standard operation', mitigation: 'none needed' };
    }

    async _predictConfidence(subtask, context) {
        const baseConfidence = {
            install_deps: 0.8, build: 0.6, test: 0.5, deploy: 0.4, verify: 0.6,
            search: 0.7, fetch_sources: 0.6, synthesize: 0.5,
            generate_media: 0.7, send_media: 0.9,
            identify: 0.4, fix: 0.3,
            understand: 0.9, execute: 0.6
        };
        return baseConfidence[subtask.name] || 0.5;
    }

    _consolidateRisks(risks) {
        const high = risks.filter(r => r.level === 'high').length;
        const medium = risks.filter(r => r.level === 'medium').length;
        return { high, medium, low: risks.length - high - medium, details: risks };
    }

    _estimateTotalTime(subtasks) {
        const timeMap = {
            install_deps: '30s', build: '60s', test: '30s', deploy: '20s', verify: '10s',
            search: '15s', fetch_sources: '20s', synthesize: '15s',
            generate_media: '30s', send_media: '5s',
            identify: '30s', fix: '60s',
            understand: '5s', execute: '30s'
        };
        let totalSec = 0;
        for (const s of subtasks) {
            const t = timeMap[s.name] || '15s';
            totalSec += parseInt(t) || 15;
        }
        if (totalSec < 60) return totalSec + 's';
        return Math.ceil(totalSec / 60) + 'm';
    }

    _getFallback(task, plan) {
        const text = task.toLowerCase();
        if (/\b(deploy|publish)\b/.test(text)) return { strategy: 'manual_verify', description: 'Verify manually after deployment' };
        if (/\b(debug|fix)\b/.test(text)) return { strategy: 'alternate_approach', description: 'Try different debugging approach' };
        if (/\b(buat|create|generate)\b/.test(text)) return { strategy: 'simplified', description: 'Create minimal version first' };
        return { strategy: 'retry', description: 'Retry with different parameters' };
    }

    _getRequiredMemory(task, plan) {
        const required = [];
        const text = task.toLowerCase();
        if (text.includes('config') || text.includes('setting')) required.push('config values');
        if (text.includes('user') || text.includes('nama')) required.push('user preferences');
        if (text.includes('history') || text.includes('sebelum')) required.push('previous conversation context');
        if (plan.requiredTools.includes('read_file') || plan.requiredTools.includes('write_file')) {
            required.push('file paths and permissions');
        }
        return required;
    }

    _predictOutcome(task, plan) {
        return {
            summary: `Plan to: ${task.substring(0, 100)}`,
            totalSteps: plan.subtasks.length,
            estimatedConfidence: plan.overallConfidence,
            toolCount: plan.requiredTools.length
        };
    }

    async _generateAlternatives(task, plan, context) {
        if (plan.subtasks.length < 2) return [];
        const alt = {
            name: 'simplified',
            description: 'Fewer steps, lower confidence but faster',
            subtaskCount: Math.max(1, Math.floor(plan.subtasks.length / 2)),
            estimatedConfidence: Math.max(0.2, plan.overallConfidence - 0.15)
        };
        return [alt];
    }

    recordOutcome(planId, success, actualCost = 0) {
        const plan = this.history.plans.find(p => p.id === planId);
        if (plan) {
            plan.status = success ? 'success' : 'failed';
            this.history.outcomes.push({
                planId,
                success,
                actualCost,
                predictedCost: plan.estimatedTotalCost,
                predictedConfidence: plan.overallConfidence,
                timestamp: new Date().toISOString()
            });
            if (success) this.history.stats.success++;
            this._save();
        }
    }

    getStats() {
        return {
            totalPlans: this.history.stats.total,
            successRate: this.history.stats.total > 0
                ? (this.history.stats.success / this.history.stats.total * 100).toFixed(1) + '%'
                : '0%',
            historySize: this.history.outcomes.length
        };
    }
}

module.exports = PlanningEngine;
