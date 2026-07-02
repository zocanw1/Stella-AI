const fs = require('fs');
const path = require('path');

const DATASETS_DIR = path.join(__dirname, '..', '..', 'data', 'ml', 'datasets');

class DatasetManager {
    constructor(name) {
        this.name = name;
        this.samples = [];
        this.meta = { name, createdAt: new Date().toISOString(), totalSamples: 0, classes: {} };
    }

    _generateId() {
        return 'ds_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    addSample(text, label, metadata = {}) {
        const sample = {
            id: this._generateId(),
            text: (text || '').substring(0, 500),
            label,
            metadata,
            addedAt: new Date().toISOString()
        };
        this.samples.push(sample);
        this._updateCounts();
        return sample;
    }

    addSamples(samples) {
        for (const s of samples || []) this.addSample(s.text, s.label, s.metadata || {});
    }

    removeSample(id) {
        const idx = this.samples.findIndex(s => s.id === id);
        if (idx < 0) return false;
        this.samples.splice(idx, 1);
        this._updateCounts();
        return true;
    }

    _updateCounts() {
        this.meta.totalSamples = this.samples.length;
        this.meta.classes = {};
        for (const s of this.samples) {
            this.meta.classes[s.label] = (this.meta.classes[s.label] || 0) + 1;
        }
    }

    deduplicate() {
        const seen = new Set();
        const unique = [];
        let removed = 0;
        for (const s of this.samples) {
            const key = `${s.text.substring(0, 100)}|${s.label}`;
            if (seen.has(key)) { removed++; continue; }
            seen.add(key);
            unique.push(s);
        }
        this.samples = unique;
        this._updateCounts();
        return removed;
    }

    shuffle() {
        for (let i = this.samples.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.samples[i], this.samples[j]] = [this.samples[j], this.samples[i]];
        }
        return this;
    }

    split(ratio = 0.8) {
        const shuffled = [...this.samples];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const splitIdx = Math.floor(shuffled.length * ratio);
        return {
            train: new DatasetManager(`${this.name}_train`).addAll(shuffled.slice(0, splitIdx)),
            test: new DatasetManager(`${this.name}_test`).addAll(shuffled.slice(splitIdx))
        };
    }

    balancedSplit(ratio = 0.8) {
        const byLabel = {};
        for (const s of this.samples) {
            if (!byLabel[s.label]) byLabel[s.label] = [];
            byLabel[s.label].push(s);
        }

        const train = new DatasetManager(`${this.name}_train`);
        const test = new DatasetManager(`${this.name}_test`);

        for (const [label, items] of Object.entries(byLabel)) {
            for (let i = items.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [items[i], items[j]] = [items[j], items[i]];
            }
            const splitIdx = Math.max(1, Math.floor(items.length * ratio));
            for (const s of items.slice(0, splitIdx)) train.addSample(s.text, s.label, s.metadata);
            for (const s of items.slice(splitIdx)) test.addSample(s.text, s.label, s.metadata);
        }

        return { train, test };
    }

    balance(method = 'oversample') {
        if (this.samples.length === 0) return this;

        const counts = this.meta.classes;
        const maxCount = Math.max(...Object.values(counts).filter(Boolean), 0);
        if (maxCount === 0) return this;

        if (method === 'oversample') {
            const balanced = [];
            for (const [label] of Object.entries(counts)) {
                const items = this.samples.filter(s => s.label === label);
                balanced.push(...items);
                const needed = maxCount - items.length;
                for (let i = 0; i < needed; i++) {
                    const src = items[i % items.length];
                    balanced.push({ ...src, id: this._generateId(), synthetic: true, addedAt: new Date().toISOString() });
                }
            }
            this.samples = balanced;
        } else if (method === 'undersample') {
            const minCount = Math.min(...Object.values(counts).filter(Boolean), 0);
            if (minCount === 0) return this;
            const balanced = [];
            for (const [label] of Object.entries(counts)) {
                const items = [...this.samples.filter(s => s.label === label)];
                for (let i = items.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [items[i], items[j]] = [items[j], items[i]];
                }
                balanced.push(...items.slice(0, minCount));
            }
            this.samples = balanced;
        }

        this._updateCounts();
        return this;
    }

    addAll(samples) {
        for (const s of samples || []) this.samples.push(s);
        this._updateCounts();
        return this;
    }

    getStats() {
        return { ...this.meta, classesJSON: JSON.stringify(this.meta.classes) };
    }

    getClasses() {
        return Object.keys(this.meta.classes);
    }

    exportJson() {
        return JSON.stringify({
            meta: this.meta,
            samples: this.samples.map(s => ({
                text: s.text, label: s.label, id: s.id, metadata: s.metadata
            }))
        }, null, 2);
    }

    importJson(jsonStr) {
        const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        if (data && Array.isArray(data.samples)) {
            this.samples = data.samples;
            this._updateCounts();
            return data.samples.length;
        }
        return 0;
    }

    saveToDisk() {
        if (!fs.existsSync(DATASETS_DIR)) fs.mkdirSync(DATASETS_DIR, { recursive: true });
        const fp = path.join(DATASETS_DIR, `${this.name}.json`);
        fs.writeFileSync(fp, this.exportJson());
        return fp;
    }

    static loadFromDisk(name) {
        const fp = path.join(DATASETS_DIR, `${name}.json`);
        if (!fs.existsSync(fp)) return null;
        const ds = new DatasetManager(name);
        ds.importJson(JSON.parse(fs.readFileSync(fp, 'utf-8')));
        return ds;
    }

    slice(start = 0, end) {
        const ds = new DatasetManager(this.name + '_slice');
        ds.addAll(this.samples.slice(start, end));
        return ds;
    }

    toSamples() {
        return this.samples.map(s => ({ text: s.text, label: s.label }));
    }
}

module.exports = DatasetManager;
