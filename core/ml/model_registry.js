const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(__dirname, '..', '..', 'data', 'ml', 'model_registry.json');

class ModelRegistry {
    constructor() {
        this.registry = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
        } catch {
            return { models: {} };
        }
    }

    _save() {
        const dir = path.dirname(REGISTRY_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(REGISTRY_FILE, JSON.stringify(this.registry, null, 2));
    }

    registerModel(name, config = {}) {
        if (!this.registry.models[name]) {
            this.registry.models[name] = {
                name,
                versions: [],
                activeVersion: null,
                createdAt: new Date().toISOString(),
                config: {
                    architecture: config.architecture || 'unknown',
                    inputShape: config.inputShape || null,
                    outputClasses: config.outputClasses || []
                }
            };
            this._save();
        }
        return this.registry.models[name];
    }

    recordVersion(name, versionData) {
        this.registerModel(name);
        const model = this.registry.models[name];

        const version = {
            version: (model.versions.length) + 1,
            datasetVersion: versionData.datasetVersion || null,
            trainingDate: versionData.trainingDate || new Date().toISOString(),
            sampleCount: versionData.sampleCount || 0,
            metrics: {
                accuracy: versionData.accuracy || null,
                precision: versionData.precision || null,
                recall: versionData.recall || null,
                f1Score: versionData.f1Score || null,
                trainingLoss: versionData.trainingLoss || null,
                validationLoss: versionData.validationLoss || null,
                inferenceTimeMs: versionData.inferenceTimeMs || null
            },
            modelSizeBytes: versionData.modelSizeBytes || null,
            confusionMatrix: versionData.confusionMatrix || null
        };

        model.versions.push(version);
        model.activeVersion = version.version;
        this._save();
        return version;
    }

    getActiveVersion(name) {
        const model = this.registry.models[name];
        if (!model || !model.activeVersion) return null;
        return model.versions.find(v => v.version === model.activeVersion) || null;
    }

    getModel(name) {
        return this.registry.models[name] || null;
    }

    rollback(name, targetVersion) {
        const model = this.registry.models[name];
        if (!model) return false;
        if (!model.versions.some(v => v.version === targetVersion)) return false;
        model.activeVersion = targetVersion;
        this._save();
        return true;
    }

    compare(name, versionA, versionB) {
        const model = this.registry.models[name];
        if (!model) return null;
        const va = model.versions.find(v => v.version === versionA);
        const vb = model.versions.find(v => v.version === versionB);
        if (!va || !vb) return null;

        const diff = {};
        for (const key of ['accuracy', 'precision', 'recall', 'f1Score']) {
            const a = va.metrics[key] || 0;
            const b = vb.metrics[key] || 0;
            diff[key] = { old: a, new: b, delta: +(b - a).toFixed(4) };
        }
        return {
            modelName: name,
            versionA, versionB,
            active: model.activeVersion,
            winner: (vb.metrics.f1Score || vb.metrics.accuracy || 0) >= (va.metrics.f1Score || va.metrics.accuracy || 0) ? 'B' : 'A',
            diff
        };
    }

    getAllModels() {
        return Object.entries(this.registry.models).map(([name, model]) => ({
            name,
            versions: model.versions.length,
            activeVersion: model.activeVersion,
            createdAt: model.createdAt,
            config: model.config
        }));
    }

    getStats(name) {
        const model = this.registry.models[name];
        if (!model) return null;
        const active = this.getActiveVersion(name);
        return {
            name,
            totalVersions: model.versions.length,
            activeVersion: model.activeVersion,
            latestMetrics: active ? active.metrics : null,
            createdAt: model.createdAt
        };
    }
}

module.exports = ModelRegistry;
