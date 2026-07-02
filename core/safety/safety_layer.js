const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '..', '..', 'data', 'safety', 'audit.json');
const CONSTRAINTS_FILE = path.join(__dirname, '..', '..', 'data', 'safety', 'constraints.json');

class SafetyLayer {
    constructor(eventBus, EVENTS) {
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.constraints = this._loadConstraints();
        this.audit = this._loadAudit();
    }

    _loadConstraints() {
        try {
            return JSON.parse(fs.readFileSync(CONSTRAINTS_FILE, 'utf-8'));
        } catch {
            return this._defaultConstraints();
        }
    }

    _loadAudit() {
        try {
            return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
        } catch {
            return { log: [], stats: { total: 0, violations: 0, rollbacks: 0 } };
        }
    }

    _saveConstraints() {
        if (!fs.existsSync(path.dirname(CONSTRAINTS_FILE))) {
            fs.mkdirSync(path.dirname(CONSTRAINTS_FILE), { recursive: true });
        }
        fs.writeFileSync(CONSTRAINTS_FILE, JSON.stringify(this.constraints, null, 2));
    }

    _saveAudit() {
        if (!fs.existsSync(path.dirname(AUDIT_FILE))) {
            fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
        }
        fs.writeFileSync(AUDIT_FILE, JSON.stringify(this.audit, null, 2));
    }

    _defaultConstraints() {
        return {
            files: {
                protectedPaths: [
                    'index.js', 'discord_bot.js', 'core/', 'tools/',
                    'data/', 'memory_bank.json', 'database.json', '.env'
                ],
                maxFileSize: 10485760,
                allowedExtensions: ['.js', '.json', '.md', '.txt', '.html', '.css', '.py', '.png', '.jpg', '.wav', '.mp3']
            },
            execution: {
                maxCommandsPerMinute: 10,
                blockedCommands: ['rm -rf /', 'format', 'diskpart', 'del /f /s /q'],
                maxOutputSize: 5242880
            },
            network: {
                allowedDomains: ['*'],
                blockedDomains: [],
                maxDownloadsPerSession: 10
            },
            memory: {
                maxFactsPerUser: 500,
                maxConversationHistory: 200
            },
            autonomy: {
                maxAutonomousActions: 20,
                requireApprovalFor: ['deploy', 'delete', 'format', 'shutdown', 'restart'],
                safetyReviewAfter: 50
            }
        };
    }

    async validate(action, context = {}) {
        const violations = [];

        if (action.type === 'file_write' || action.type === 'file_delete') {
            const targetPath = action.target || '';
            for (const protectedPath of this.constraints.files.protectedPaths) {
                if (targetPath.includes(protectedPath.replace(/\\/g, '/'))) {
                    violations.push({
                        rule: 'protected_path',
                        message: `Cannot modify protected path: ${protectedPath}`,
                        severity: 'critical'
                    });
                }
            }
        }

        if (action.type === 'command') {
            const cmd = (action.command || '').toLowerCase();
            for (const blocked of this.constraints.execution.blockedCommands) {
                if (cmd.includes(blocked)) {
                    violations.push({
                        rule: 'blocked_command',
                        message: `Command blocked: ${blocked}`,
                        severity: 'critical'
                    });
                }
            }
        }

        if (action.type === 'autonomous') {
            const requireApproval = this.constraints.autonomy.requireApprovalFor;
            for (const keyword of requireApproval) {
                if ((action.description || '').toLowerCase().includes(keyword)) {
                    violations.push({
                        rule: 'requires_approval',
                        message: `Action requires user approval: ${keyword}`,
                        severity: 'warning'
                    });
                }
            }
        }

        this._log(action, violations);

        if (violations.length > 0) {
            this.audit.stats.violations++;
            this._saveAudit();

            if (this.bus) {
                this.bus.emit(this.EVENTS.SAFETY_VIOLATION, {
                    action,
                    violations,
                    timestamp: new Date().toISOString()
                });
            }

            const criticalViolations = violations.filter(v => v.severity === 'critical');
            if (criticalViolations.length > 0) {
                return { allowed: false, violations, reason: criticalViolations[0].message };
            }

            return { allowed: true, violations, warning: violations[0]?.message };
        }

        return { allowed: true, violations: [] };
    }

    _log(action, violations) {
        this.audit.log.push({
            timestamp: new Date().toISOString(),
            action: { type: action.type, target: action.target, description: action.description },
            violations: violations.length,
            severity: violations.some(v => v.severity === 'critical') ? 'critical' : violations.length > 0 ? 'warning' : 'info'
        });

        this.audit.stats.total++;
        if (this.audit.log.length > 1000) this.audit.log = this.audit.log.slice(-1000);
        this._saveAudit();
    }

    addConstraint(category, key, value) {
        if (this.constraints[category]) {
            this.constraints[category][key] = value;
            this._saveConstraints();
            return true;
        }
        return false;
    }

    getRecentAudit(limit = 20) {
        return this.audit.log.slice(-limit);
    }

    getStats() {
        return {
            totalActions: this.audit.stats.total,
            violations: this.audit.stats.violations,
            rollbacks: this.audit.stats.rollbacks,
            constraintCategories: Object.keys(this.constraints).length
        };
    }
}

module.exports = SafetyLayer;
