/**
 * ============================================
 *  🌳 BEHAVIOR TREE ENGINE
 *  Generic BT implementation for Stella AI
 * ============================================
 * 
 * Node Types:
 *   - Selector:  Runs children until one SUCCESS (OR logic)
 *   - Sequence:  Runs children until one FAILURE (AND logic)
 *   - Action:    Leaf node that executes a function
 *   - Condition: Leaf node that checks a boolean
 *   - Decorator: Wraps a child with modifier logic
 */

const STATUS = {
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    RUNNING: 'RUNNING'
};

// ─── Base Node ───
class BTNode {
    constructor(name) {
        this.name = name;
        this.status = null;
    }

    async tick(context) {
        throw new Error(`tick() not implemented for ${this.name}`);
    }

    reset() {
        this.status = null;
    }
}

// ─── Selector (OR) ───
// Runs children in order. Returns SUCCESS on first child SUCCESS.
// Returns FAILURE only if ALL children fail.
class Selector extends BTNode {
    constructor(name, children = []) {
        super(name);
        this.children = children;
    }

    async tick(context) {
        for (const child of this.children) {
            const result = await child.tick(context);
            if (result === STATUS.SUCCESS) {
                this.status = STATUS.SUCCESS;
                return STATUS.SUCCESS;
            }
            if (result === STATUS.RUNNING) {
                this.status = STATUS.RUNNING;
                return STATUS.RUNNING;
            }
        }
        this.status = STATUS.FAILURE;
        return STATUS.FAILURE;
    }
}

// ─── Sequence (AND) ───
// Runs children in order. Returns FAILURE on first child FAILURE.
// Returns SUCCESS only if ALL children succeed.
class Sequence extends BTNode {
    constructor(name, children = []) {
        super(name);
        this.children = children;
    }

    async tick(context) {
        for (const child of this.children) {
            const result = await child.tick(context);
            if (result === STATUS.FAILURE) {
                this.status = STATUS.FAILURE;
                return STATUS.FAILURE;
            }
            if (result === STATUS.RUNNING) {
                this.status = STATUS.RUNNING;
                return STATUS.RUNNING;
            }
        }
        this.status = STATUS.SUCCESS;
        return STATUS.SUCCESS;
    }
}

// ─── Action Node ───
// Leaf node that executes an async function.
// The function should return STATUS.SUCCESS, FAILURE, or RUNNING.
class Action extends BTNode {
    constructor(name, actionFn) {
        super(name);
        this.actionFn = actionFn;
    }

    async tick(context) {
        try {
            const result = await this.actionFn(context);
            this.status = result;
            return result;
        } catch (err) {
            console.error(`[BT] Action "${this.name}" error:`, err.message);
            this.status = STATUS.FAILURE;
            return STATUS.FAILURE;
        }
    }
}

// ─── Condition Node ───
// Leaf node that evaluates a boolean condition.
class Condition extends BTNode {
    constructor(name, conditionFn) {
        super(name);
        this.conditionFn = conditionFn;
    }

    async tick(context) {
        try {
            const result = await this.conditionFn(context);
            this.status = result ? STATUS.SUCCESS : STATUS.FAILURE;
            return this.status;
        } catch (err) {
            console.error(`[BT] Condition "${this.name}" error:`, err.message);
            this.status = STATUS.FAILURE;
            return STATUS.FAILURE;
        }
    }
}

// ─── Decorator: Inverter ───
// Inverts the result of its child (SUCCESS ↔ FAILURE)
class Inverter extends BTNode {
    constructor(name, child) {
        super(name);
        this.child = child;
    }

    async tick(context) {
        const result = await this.child.tick(context);
        if (result === STATUS.SUCCESS) {
            this.status = STATUS.FAILURE;
            return STATUS.FAILURE;
        }
        if (result === STATUS.FAILURE) {
            this.status = STATUS.SUCCESS;
            return STATUS.SUCCESS;
        }
        this.status = STATUS.RUNNING;
        return STATUS.RUNNING;
    }
}

// ─── Decorator: Cooldown ───
// Prevents a child from running more than once within a given time window.
class Cooldown extends BTNode {
    constructor(name, child, cooldownMs) {
        super(name);
        this.child = child;
        this.cooldownMs = cooldownMs;
        this.lastRun = 0;
    }

    async tick(context) {
        const now = Date.now();
        if (now - this.lastRun < this.cooldownMs) {
            this.status = STATUS.FAILURE;
            return STATUS.FAILURE;
        }
        const result = await this.child.tick(context);
        if (result === STATUS.SUCCESS) {
            this.lastRun = now;
        }
        this.status = result;
        return result;
    }
}

// ─── Decorator: RetryUntilSuccess ───
// Retries child up to N times until it succeeds.
class RetryUntilSuccess extends BTNode {
    constructor(name, child, maxRetries = 3) {
        super(name);
        this.child = child;
        this.maxRetries = maxRetries;
    }

    async tick(context) {
        for (let i = 0; i < this.maxRetries; i++) {
            const result = await this.child.tick(context);
            if (result === STATUS.SUCCESS) {
                this.status = STATUS.SUCCESS;
                return STATUS.SUCCESS;
            }
        }
        this.status = STATUS.FAILURE;
        return STATUS.FAILURE;
    }
}

// ─── Behavior Tree (Root) ───
// The main tree runner. Holds root node and execution context.
class BehaviorTree {
    constructor(name, rootNode) {
        this.name = name;
        this.root = rootNode;
        this.tickCount = 0;
        this.executionLog = [];
    }

    async tick(context) {
        this.tickCount++;
        this.executionLog = [];

        // Attach logging function to the original context to ensure modifications persist
        context._btLog = (nodeName, status) => {
            this.executionLog.push({ node: nodeName, status, tick: this.tickCount });
        };

        const result = await this.root.tick(context);

        return {
            status: result,
            tickCount: this.tickCount,
            log: this.executionLog
        };
    }

    getExecutionSummary() {
        return this.executionLog.map(e => `  [${e.status}] ${e.node}`).join('\n');
    }
}

module.exports = {
    STATUS,
    BTNode,
    Selector,
    Sequence,
    Action,
    Condition,
    Inverter,
    Cooldown,
    RetryUntilSuccess,
    BehaviorTree
};
