const fs = require('fs');
const path = require('path');

const TASKS_FILE = path.join(__dirname, '..', '..', 'data', 'scheduler', 'tasks.json');

class Scheduler {
    constructor(eventBus, EVENTS) {
        this.bus = eventBus;
        this.EVENTS = EVENTS;
        this.tasks = this._load();
        this.intervals = new Map();
        this.lastActivity = Date.now();
        this.isIdle = false;
        this.idleThresholdMs = 5 * 60 * 1000;
        this._startIdleDetector();
        this._start();
    }

    _startIdleDetector() {
        setInterval(() => {
            const now = Date.now();
            const wasIdle = this.isIdle;
            this.isIdle = (now - this.lastActivity) > this.idleThresholdMs;

            if (this.isIdle && !wasIdle && this.bus) {
                this.bus.emit(this.EVENTS.USER_IDLE, { idleDuration: now - this.lastActivity });
            } else if (!this.isIdle && wasIdle && this.bus) {
                this.bus.emit(this.EVENTS.USER_RETURNED, { idleDuration: now - this.lastActivity });
            }
        }, 30000);
    }

    markActive() {
        this.lastActivity = Date.now();
        if (this.isIdle) {
            this.isIdle = false;
            if (this.bus) {
                this.bus.emit(this.EVENTS.USER_RETURNED, { idleDuration: 0 });
            }
        }
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
        } catch {
            return {
                recurring: [],
                oneTime: [],
                history: [],
                stats: { totalExecuted: 0 }
            };
        }
    }

    _save() {
        if (!fs.existsSync(path.dirname(TASKS_FILE))) {
            fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
        }
        fs.writeFileSync(TASKS_FILE, JSON.stringify(this.tasks, null, 2));
    }

    _start() {
        this._tick();
        setInterval(() => this._tick(), 60000);
    }

    _tick() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        for (const task of this.tasks.recurring) {
            if (!task.active) continue;
            if (!this._matchesSchedule(task, hour, minute)) continue;

            const isHeavy = (task.metadata && task.metadata.heavy) || false;
            if (isHeavy && !this.isIdle) {
                continue;
            }

            this._execute(task);
        }

        const oneTimeToRun = this.tasks.oneTime.filter(t => {
            if (t.executed) return false;
            return new Date(t.scheduledAt) <= now;
        });

        for (const task of oneTimeToRun) {
            task.executed = true;
            this._execute(task);
        }

        this.tasks.oneTime = this.tasks.oneTime.filter(t => !t.executed);
    }

    _matchesSchedule(task, hour, minute) {
        if (task.type === 'interval') {
            const lastExec = task.lastExecuted ? new Date(task.lastExecuted).getTime() : 0;
            return (Date.now() - lastExec) >= task.intervalMs;
        }
        if (task.type === 'daily') {
            const [h, m] = task.time.split(':').map(Number);
            return hour === h && minute === m;
        }
        if (task.type === 'hourly') {
            return minute === 0;
        }
        return false;
    }

    _execute(task) {
        task.lastExecuted = new Date().toISOString();
        task.executionCount = (task.executionCount || 0) + 1;
        this.tasks.stats.totalExecuted++;
        this.tasks.history.push({
            taskId: task.id,
            name: task.name,
            executedAt: task.lastExecuted
        });
        if (this.tasks.history.length > 200) this.tasks.history = this.tasks.history.slice(-200);
        this._save();

        if (this.bus) {
            this.bus.emit(this.EVENTS.SCHEDULER_TICK, {
                taskId: task.id,
                taskName: task.name,
                action: task.action
            });
        }
    }

    addTask(name, action, schedule, options = {}) {
        const task = {
            id: 'sch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name,
            action,
            type: schedule.type || 'interval',
            time: schedule.time || null,
            intervalMs: schedule.intervalMs || null,
            active: options.active !== undefined ? options.active : true,
            createdAt: new Date().toISOString(),
            lastExecuted: null,
            executionCount: 0,
            metadata: options.metadata || {}
        };

        if (schedule.type === 'recurring') {
            this.tasks.recurring.push(task);
        } else {
            task.scheduledAt = schedule.scheduledAt || new Date().toISOString();
            task.executed = false;
            this.tasks.oneTime.push(task);
        }

        this._save();
        return task;
    }

    buildDefaults() {
        this.addTask('deep_reflection', 'run_deep_reflection', { type: 'interval', intervalMs: 6 * 60 * 60 * 1000 },
            { active: true, metadata: { priority: 'high', category: 'cognition', heavy: true } });

        this.addTask('knowledge_consolidation', 'consolidate_knowledge', { type: 'interval', intervalMs: 12 * 60 * 60 * 1000 },
            { active: true, metadata: { priority: 'medium', category: 'memory', heavy: true } });

        this.addTask('memory_cleanup', 'cleanup_memory', { type: 'daily', time: '03:00' },
            { active: true, metadata: { priority: 'low', category: 'maintenance', heavy: false } });

        this.addTask('experience_processing', 'process_experiences', { type: 'interval', intervalMs: 60 * 60 * 1000 },
            { active: true, metadata: { priority: 'medium', category: 'learning', heavy: false } });

        this.addTask('model_retrain', 'retrain_models', { type: 'interval', intervalMs: 24 * 60 * 60 * 1000 },
            { active: true, metadata: { priority: 'low', category: 'maintenance', heavy: true } });

        this.addTask('curiosity_trigger', 'run_curiosity_scan', { type: 'interval', intervalMs: 4 * 60 * 60 * 1000 },
            { active: true, metadata: { priority: 'low', category: 'growth', heavy: false } });
    }

    listTasks() {
        return {
            recurring: this.tasks.recurring.map(t => ({
                id: t.id, name: t.name, type: t.type,
                active: t.active, lastExecuted: t.lastExecuted,
                executionCount: t.executionCount
            })),
            pending: this.tasks.oneTime.map(t => ({
                id: t.id, name: t.name,
                scheduledAt: t.scheduledAt, active: !t.executed
            }))
        };
    }

    getStats() {
        return {
            recurringTasks: this.tasks.recurring.length,
            pendingTasks: this.tasks.oneTime.filter(t => !t.executed).length,
            totalExecuted: this.tasks.stats.totalExecuted
        };
    }
}

module.exports = Scheduler;
