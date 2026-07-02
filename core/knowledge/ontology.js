const fs = require('fs');
const path = require('path');

const ONTOLOGY_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'ontology.json');

class OntologyEngine {
    constructor(embeddings) {
        this.embeddings = embeddings;
        this.ontology = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(ONTOLOGY_FILE, 'utf-8'));
        } catch {
            return {
                categories: {},
                relations: {},
                inheritances: [],
                metadata: { lastUpdated: null }
            };
        }
    }

    _save() {
        this.ontology.metadata.lastUpdated = new Date().toISOString();
        if (!fs.existsSync(path.dirname(ONTOLOGY_FILE))) {
            fs.mkdirSync(path.dirname(ONTOLOGY_FILE), { recursive: true });
        }
        fs.writeFileSync(ONTOLOGY_FILE, JSON.stringify(this.ontology, null, 2));
    }

    defineCategory(name, parent = null, properties = {}) {
        const key = name.toLowerCase().replace(/\s+/g, '_');
        if (this.ontology.categories[key]) {
            Object.assign(this.ontology.categories[key].properties, properties);
            this._save();
            return this.ontology.categories[key];
        }

        const cat = {
            key,
            name,
            parent,
            properties,
            createdAt: new Date().toISOString()
        };
        this.ontology.categories[key] = cat;

        if (parent) {
            const parentKey = parent.toLowerCase().replace(/\s+/g, '_');
            this.ontology.inheritances.push({
                child: key,
                parent: parentKey,
                createdAt: new Date().toISOString()
            });
        }
        this._save();
        return cat;
    }

    defineRelation(type, description, properties = {}) {
        if (!this.ontology.relations[type]) {
            this.ontology.relations[type] = {
                type,
                description,
                properties,
                createdAt: new Date().toISOString()
            };
            this._save();
        }
        return this.ontology.relations[type];
    }

    getParent(childName) {
        const key = childName.toLowerCase().replace(/\s+/g, '_');
        const inh = this.ontology.inheritances.find(i => i.child === key);
        if (!inh) return null;
        return this.ontology.categories[inh.parent] || null;
    }

    getChildren(parentName) {
        const parentKey = parentName.toLowerCase().replace(/\s+/g, '_');
        return this.ontology.inheritances
            .filter(i => i.parent === parentKey)
            .map(i => this.ontology.categories[i.child])
            .filter(Boolean);
    }

    getAllParents(childName) {
        const result = [];
        let current = this.getParent(childName);
        while (current) {
            result.push(current);
            current = this.getParent(current.name);
        }
        return result;
    }

    isSubclassOf(childName, parentName) {
        const parents = this.getAllParents(childName);
        return parents.some(p => p.name.toLowerCase() === parentName.toLowerCase());
    }

    classifyByProperties(item, properties) {
        const scores = [];
        for (const cat of Object.values(this.ontology.categories)) {
            let score = 0;
            const catProps = cat.properties || {};
            for (const [key, value] of Object.entries(properties)) {
                if (catProps[key] === value) score += 1;
                if (typeof catProps[key] === 'number' && typeof value === 'number') {
                    if (Math.abs(catProps[key] - value) < 0.2) score += 0.5;
                }
            }
            if (score > 0) scores.push({ category: cat.name, key: cat.key, score });
        }
        scores.sort((a, b) => b.score - a.score);
        return scores;
    }

    getCategory(name) {
        const key = name.toLowerCase().replace(/\s+/g, '_');
        return this.ontology.categories[key] || null;
    }

    getAllCategories() {
        return Object.values(this.ontology.categories);
    }

    getStats() {
        return {
            categories: Object.keys(this.ontology.categories).length,
            relationTypes: Object.keys(this.ontology.relations).length,
            inheritances: this.ontology.inheritances.length
        };
    }

    async buildDefaultOntology() {
        this.defineCategory('Project', 'Root', { type: 'container' });
        this.defineCategory('Technology', 'Root', { type: 'concept' });
        this.defineCategory('Programming', 'Technology', { type: 'skill' });
        this.defineCategory('DevOps', 'Technology', { type: 'practice' });
        this.defineCategory('Database', 'Technology', { type: 'tool' });
        this.defineCategory('Frontend', 'Programming', { type: 'domain' });
        this.defineCategory('Backend', 'Programming', { type: 'domain' });
        this.defineCategory('AI', 'Technology', { type: 'domain' });
        this.defineCategory('MachineLearning', 'AI', { type: 'subdomain' });
        this.defineCategory('NLP', 'AI', { type: 'subdomain' });
        this.defineCategory('ComputerVision', 'AI', { type: 'subdomain' });

        this.defineRelation('depends_on', 'A depends on B', { directed: true });
        this.defineRelation('implements', 'A implements B', { directed: true });
        this.defineRelation('uses', 'A uses B', { directed: true });
        this.defineRelation('related_to', 'A is related to B', { directed: false });
        this.defineRelation('part_of', 'A is part of B', { directed: true });
    }
}

module.exports = OntologyEngine;
