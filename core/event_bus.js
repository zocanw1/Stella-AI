const EventEmitter = require('events');

const EVENTS = {
    MESSAGE_RECEIVED:    'message:received',
    TASK_STARTED:        'task:started',
    TASK_COMPLETED:      'task:completed',
    TASK_FAILED:         'task:failed',
    TOOL_CALLED:         'tool:called',
    TOOL_RESULT:         'tool:result',
    MEMORY_STORED:       'memory:stored',
    MEMORY_RETRIEVED:    'memory:retrieved',
    KNOWLEDGE_UPDATED:   'knowledge:updated',
    GOAL_DETECTED:       'goal:detected',
    GOAL_PROGRESS:       'goal:progress',
    GOAL_COMPLETED:      'goal:completed',
    SKILL_LEARNED:       'skill:learned',
    SKILL_USED:          'skill:used',
    EXPERIENCE_RECORDED: 'experience:recorded',
    REFLECTION_DONE:     'reflection:done',
    PLANNING_DONE:       'planning:done',
    CURIOUS_QUERY:       'curious:query',
    SAFETY_VIOLATION:    'safety:violation',
    SCHEDULER_TICK:      'scheduler:tick',
    WORKFLOW_STARTED:    'workflow:started',
    WORKFLOW_STEP:       'workflow:step',
    WORKFLOW_COMPLETED:  'workflow:completed',
    WORKFLOW_FAILED:     'workflow:failed',
    SYNC_REQUEST:        'sync:request',

    // v5.1 — Enhanced Events
    SUCCESS:             'system:success',
    ERROR:               'system:error',
    USER_IDLE:           'user:idle',
    USER_RETURNED:       'user:returned',
    DECISION_MADE:       'decision:made',
    DECISION_OUTCOME:    'decision:outcome',
    CONTEXT_BUILT:       'context:built',
    NEED_ANALYZED:       'need:analyzed',
    MEMORY_UPDATED:      'memory:updated',
    NEW_SKILL:           'skill:discovered',
    MODULE_ACTIVATED:    'module:activated',
    MODULE_SKIPPED:      'module:skipped'
};

class EventBus {
    constructor() {
        this.emitter = new EventEmitter();
        this.emitter.setMaxListeners(100);
        this.history = [];
        this.maxHistory = 200;
        this.listeners = new Map();
    }

    emit(event, data = {}) {
        const payload = {
            event,
            data,
            timestamp: new Date().toISOString(),
            id: this._generateId()
        };
        this.history.push({ event, id: payload.id, timestamp: payload.timestamp });
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(-this.maxHistory);
        }
        this.emitter.emit(event, payload);
        this.emitter.emit('*', payload);

        if (event !== 'scheduler:tick' && event !== 'memory:retrieved') {
            setImmediate(() => this._notifyListeners(event, payload));
        }
        return payload.id;
    }

    on(event, handler) {
        if (event === '*') {
            this.emitter.on('*', handler);
        } else {
            this.emitter.on(event, handler);
        }
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        this.emitter.off(event, handler);
        const set = this.listeners.get(event);
        if (set) set.delete(handler);
    }

    once(event, handler) {
        this.emitter.once(event, handler);
    }

    waitFor(event, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, handler);
                reject(new Error(`Event "${event}" timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            const handler = (payload) => {
                clearTimeout(timer);
                resolve(payload);
            };
            this.once(event, handler);
        });
    }

    getRecent(limit = 20) {
        return this.history.slice(-limit);
    }

    listenerCount(event) {
        return this.emitter.listenerCount(event);
    }

    _notifyListeners(event, payload) {
        try {
            this.emitter.emit(event, payload);
        } catch (err) {
            console.error(`[EventBus] Error notifying ${event}:`, err.message);
        }
    }

    _generateId() {
        return 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
}

const bus = new EventBus();

module.exports = { bus, EVENTS, EventBus };
