const fs = require('fs');
const path = require('path');

const GT_DIR = path.join(__dirname, '..', '..', 'data', 'ml', 'ground_truth');
const GT_FILE = path.join(GT_DIR, 'ground_truth.json');
const VERSIONS_DIR = path.join(GT_DIR, 'versions');

const VALID_SOURCES = new Set([
    'user_correction', 'tool_outcome', 'reflection',
    'manual', 'feedback_positive', 'feedback_negative'
]);

const DEFAULT_META = Object.freeze({
    version: 1,
    createdAt: null,
    lastUpdated: null,
    totalSamples: 0
});

class GroundTruthManager {
    constructor() {
        this.meta = { ...DEFAULT_META };
        this.samples = [];
        this._load();
    }

    _load() {
        try {
            const data = JSON.parse(fs.readFileSync(GT_FILE, 'utf-8'));
            this.meta = Object.assign({ ...DEFAULT_META }, data.meta || {});
            this.samples = Array.isArray(data.samples) ? data.samples : [];
        } catch {
            this.meta = { ...DEFAULT_META, createdAt: new Date().toISOString() };
            this.samples = [];
            this._save();
        }
    }

    _save() {
        this.meta.totalSamples = this.samples.length;
        this.meta.lastUpdated = new Date().toISOString();
        if (!this.meta.createdAt) this.meta.createdAt = this.meta.lastUpdated;
        if (!fs.existsSync(GT_DIR)) fs.mkdirSync(GT_DIR, { recursive: true });
        fs.writeFileSync(GT_FILE, JSON.stringify({ meta: this.meta, samples: this.samples }, null, 2));
    }

    _generateId() {
        return 'gt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    _normalize(text) {
        return (text || '').toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 500);
    }

    addSample(text, label, source = 'manual', metadata = {}) {
        if (!VALID_SOURCES.has(source)) source = 'manual';
        const normalized = this._normalize(text);
        if (!normalized || !label) return null;

        const isDuplicate = this.samples.some(
            s => s.text === normalized && s.label === label
        );
        if (isDuplicate) return null;

        const sample = {
            id: this._generateId(),
            text: normalized,
            label,
            source,
            confidence: metadata.confidence || 1.0,
            metadata,
            versionAdded: this.meta.version,
            createdAt: new Date().toISOString()
        };

        this.samples.push(sample);
        this._save();
        return sample;
    }

    addSamples(samples) {
        const added = [];
        for (const s of samples || []) {
            const result = this.addSample(s.text, s.label, s.source, s.metadata || {});
            if (result) added.push(result);
        }
        return added;
    }

    removeSample(id) {
        const idx = this.samples.findIndex(s => s.id === id);
        if (idx < 0) return false;
        this.samples.splice(idx, 1);
        this._save();
        return true;
    }

    getSamples(filters = {}) {
        let result = [...this.samples];
        if (filters.label) result = result.filter(s => s.label === filters.label);
        if (filters.source) result = result.filter(s => s.source === filters.source);
        if (filters.since) {
            const since = new Date(filters.since).getTime();
            result = result.filter(s => new Date(s.createdAt).getTime() >= since);
        }
        if (filters.limit && filters.limit > 0) result = result.slice(-filters.limit);
        return result;
    }

    hasSample(text, label) {
        const normalized = this._normalize(text);
        return this.samples.some(s => s.text === normalized && s.label === label);
    }

    getStats() {
        const byLabel = {};
        const bySource = {};
        for (const s of this.samples) {
            byLabel[s.label] = (byLabel[s.label] || 0) + 1;
            bySource[s.source] = (bySource[s.source] || 0) + 1;
        }
        return {
            ...this.meta,
            byLabel,
            bySource
        };
    }

    createVersion() {
        this.meta.version++;
        const versionDir = path.join(VERSIONS_DIR, `v${this.meta.version}`);
        if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });
        const snapshot = { meta: { ...this.meta }, samples: JSON.parse(JSON.stringify(this.samples)) };
        fs.writeFileSync(path.join(versionDir, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
        this._save();
        return this.meta.version;
    }

    getVersion(version) {
        if (version === this.meta.version) {
            return { meta: { ...this.meta }, samples: [...this.samples] };
        }
        try {
            const file = path.join(VERSIONS_DIR, `v${version}`, 'snapshot.json');
            return JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch {
            return null;
        }
    }

    exportDataset() {
        return {
            meta: { ...this.meta },
            samples: this.samples.map(s => ({
                text: s.text,
                label: s.label,
                source: s.source
            }))
        };
    }

    importDataset(data, source = 'import') {
        if (!data || !Array.isArray(data.samples)) return 0;
        return this.addSamples(data.samples.map(s => ({
            text: s.text, label: s.label,
            source: s.source || source,
            metadata: s.metadata || {}
        }))).length;
    }
}

module.exports = GroundTruthManager;
