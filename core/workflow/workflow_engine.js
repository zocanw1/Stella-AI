const fs = require('fs');
const path = require('path');

const WORKFLOW_FILE = path.join(__dirname, '..', '..', 'data', 'workflow', 'workflows.json');

class WorkflowEngine {
    constructor(eventBus, EVENTS, skillEngine) {
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.skills = skillEngine;
        this.workflows = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(WORKFLOW_FILE, 'utf-8'));
        } catch {
            return { templates: [], history: [], stats: { total: 0, success: 0, failed: 0 } };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(WORKFLOW_FILE))) {
            fs.mkdirSync(path.dirname(WORKFLOW_FILE), { recursive: true });
        }
        fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(this.workflows, null, 2));
    }

    defineTemplate(name, steps, metadata = {}) {
        const template = {
            id: 'wft_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name,
            steps: steps.map((s, i) => ({
                order: i + 1,
                name: s.name || `step_${i + 1}`,
                description: s.description || '',
                requiredTools: s.requiredTools || [],
                expectedDuration: s.expectedDuration || 'unknown',
                critical: s.critical !== undefined ? s.critical : true,
                retryCount: s.retryCount || 0,
                validationFn: s.validationFn || null
            })),
            metadata,
            createdAt: new Date().toISOString(),
            useCount: 0
        };

        const existing = this.workflows.templates.find(t => t.name === name);
        if (existing) {
            Object.assign(existing, template);
            existing.updatedAt = new Date().toISOString();
        } else {
            this.workflows.templates.push(template);
        }
        this._save();
        return template;
    }

    async findTemplate(task) {
        const text = task.toLowerCase();

        const scored = this.workflows.templates.map(t => {
            let score = 0;
            for (const step of t.steps) {
                if (text.includes(step.name.toLowerCase())) score += 1;
                if (step.description && text.includes(step.description.toLowerCase())) score += 0.5;
            }
            if (text.includes(t.name.toLowerCase())) score += 2;
            return { template: t, score, matchCount: t.steps.length };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.length > 0 && scored[0].score > 0 ? scored[0].template : null;
    }

    async execute(templateName, context = {}) {
        const template = this.workflows.templates.find(t => t.name === templateName);
        if (!template) {
            return { success: false, error: `Template "${templateName}" not found` };
        }

        const execution = {
            id: 'wf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            template: templateName,
            startedAt: new Date().toISOString(),
            completedAt: null,
            steps: [],
            status: 'running',
            results: []
        };

        if (this.bus) {
            this.bus.emit(this.EVENTS.WORKFLOW_STARTED, { executionId: execution.id, template: templateName });
        }

        for (const step of template.steps) {
            const stepResult = {
                step: step.order,
                name: step.name,
                status: 'pending',
                startedAt: new Date().toISOString(),
                completedAt: null,
                result: null,
                error: null,
                retries: 0
            };

            if (this.bus) {
                this.bus.emit(this.EVENTS.WORKFLOW_STEP, {
                    executionId: execution.id,
                    step: step.order,
                    name: step.name
                });
            }

            try {
                stepResult.status = 'running';

                let success = false;
                let lastError = null;
                const maxRetries = Math.max(0, step.retryCount || 0);

                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    if (attempt > 0) {
                        stepResult.retries = attempt;
                    }

                    if (context.executeStep) {
                        try {
                            const result = await context.executeStep(step, execution);
                            stepResult.result = result;
                            success = true;
                            break;
                        } catch (err) {
                            lastError = err;
                        }
                    } else {
                        success = true;
                        stepResult.result = { note: `Step "${step.name}" requires executeStep handler` };
                        break;
                    }
                }

                if (success) {
                    stepResult.status = 'success';
                    stepResult.completedAt = new Date().toISOString();
                    execution.results.push(stepResult);
                } else {
                    throw lastError || new Error(`Step "${step.name}" failed`);
                }
            } catch (err) {
                stepResult.status = 'failed';
                stepResult.error = err.message;
                stepResult.completedAt = new Date().toISOString();
                execution.results.push(stepResult);

                if (step.critical) {
                    execution.status = 'failed';
                    execution.completedAt = new Date().toISOString();
                    if (this.bus) this.bus.emit(this.EVENTS.WORKFLOW_FAILED, { executionId: execution.id, step: step.name, error: err.message });
                    this.workflows.stats.failed++;
                    this._save();
                    return { success: false, error: `Workflow failed at step "${step.name}": ${err.message}`, execution };
                }
            }
        }

        execution.status = 'success';
        execution.completedAt = new Date().toISOString();
        template.useCount++;

        if (this.bus) {
            this.bus.emit(this.EVENTS.WORKFLOW_COMPLETED, { executionId: execution.id, steps: execution.results.length });
        }

        this.workflows.stats.total++;
        this.workflows.stats.success++;
        this.workflows.history.push({
            id: execution.id,
            template: templateName,
            status: 'success',
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            steps: execution.results.length
        });
        if (this.workflows.history.length > 100) this.workflows.history = this.workflows.history.slice(-100);
        this._save();

        return { success: true, execution };
    }

    buildDeployTemplate() {
        return this.defineTemplate('deploy', [
            { name: 'install', description: 'Install dependencies', requiredTools: ['execute_command'], critical: true },
            { name: 'build', description: 'Build the project', requiredTools: ['execute_command'], critical: true },
            { name: 'test', description: 'Run tests', requiredTools: ['execute_command'], critical: false, retryCount: 1 },
            { name: 'deploy', description: 'Deploy to production', requiredTools: ['execute_command'], critical: true },
            { name: 'verify', description: 'Verify deployment', requiredTools: ['fetch_webpage'], critical: true }
        ], { category: 'devops' });
    }

    buildResearchTemplate() {
        return this.defineTemplate('research', [
            { name: 'search', description: 'Search web for information', requiredTools: ['search_web'], critical: true },
            { name: 'fetch', description: 'Fetch relevant pages', requiredTools: ['fetch_webpage'], critical: false },
            { name: 'analyze', description: 'Analyze and synthesize findings', requiredTools: ['read_file'], critical: true }
        ], { category: 'cognitive' });
    }

    getStats() {
        return {
            templates: this.workflows.templates.length,
            total: this.workflows.stats.total,
            success: this.workflows.stats.success,
            failed: this.workflows.stats.failed
        };
    }
}

module.exports = WorkflowEngine;
