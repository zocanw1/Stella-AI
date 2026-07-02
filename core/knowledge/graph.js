const fs = require('fs');
const path = require('path');

const GRAPH_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'graph.json');

class KnowledgeGraph {
    constructor(embeddings) {
        this.embeddings = embeddings;
        this.graph = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf-8'));
        } catch {
            return {
                nodes: {},
                edges: [],
                metadata: { totalNodes: 0, totalEdges: 0, lastUpdated: null }
            };
        }
    }

    _save() {
        this.graph.metadata.totalNodes = Object.keys(this.graph.nodes).length;
        this.graph.metadata.totalEdges = this.graph.edges.length;
        this.graph.metadata.lastUpdated = new Date().toISOString();
        if (!fs.existsSync(path.dirname(GRAPH_FILE))) {
            fs.mkdirSync(path.dirname(GRAPH_FILE), { recursive: true });
        }
        fs.writeFileSync(GRAPH_FILE, JSON.stringify(this.graph, null, 2));
    }

    _normalize(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    async addConcept(name, category = 'general', metadata = {}) {
        const key = this._normalize(name);
        if (!key || key.length < 2) return null;

        if (this.graph.nodes[key]) {
            this.graph.nodes[key].frequency = (this.graph.nodes[key].frequency || 1) + 1;
            this.graph.nodes[key].lastSeen = new Date().toISOString();
            if (metadata.importance) {
                this.graph.nodes[key].importance = Math.max(
                    this.graph.nodes[key].importance || 0, metadata.importance
                );
            }
            this._save();
            return this.graph.nodes[key];
        }

        const node = {
            id: 'cpt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            key,
            name: name.trim(),
            category,
            embedding: await this.embeddings.embed(name),
            frequency: 1,
            importance: metadata.importance || 0.3,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            metadata,
            aliases: [name.trim().toLowerCase()]
        };

        this.graph.nodes[key] = node;
        await this._autoLink(key);
        this._save();
        return node;
    }

    async _autoLink(key) {
        const node = this.graph.nodes[key];
        if (!node) return;

        const candidates = Object.values(this.graph.nodes).filter(n => n.key !== key);
        let added = 0;

        for (const candidate of candidates) {
            const sim = this.embeddings.cosineSimilarity(node.embedding, candidate.embedding);
            if (sim >= 0.55) {
                this._addEdge(key, candidate.key, sim, 'semantic');
                added++;
            }
        }
    }

    _addEdge(source, target, weight = 0.5, type = 'semantic') {
        const edgeKey = [source, target].sort().join('::');
        const existing = this.graph.edges.find(e => e.key === edgeKey);
        if (existing) {
            existing.weight = Math.min(1.0, (existing.weight + weight) / 2);
            existing.lastUpdated = new Date().toISOString();
        } else {
            this.graph.edges.push({
                key: edgeKey,
                source,
                target,
                weight: Math.min(1, Math.max(0, weight)),
                type,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            });
        }
    }

    addRelation(sourceName, targetName, relationType = 'related', weight = 0.7) {
        const srcKey = this._normalize(sourceName);
        const tgtKey = this._normalize(targetName);

        if (!this.graph.nodes[srcKey]) {
            this.addConcept(sourceName, 'general', { autoCreated: true });
        }
        if (!this.graph.nodes[tgtKey]) {
            this.addConcept(targetName, 'general', { autoCreated: true });
        }

        this._addEdge(srcKey, tgtKey, weight, relationType);
        this._save();
    }

    async getRelated(conceptName, opts = {}) {
        const maxResults = opts.maxResults || 10;
        const minWeight = opts.minWeight || 0.3;
        const key = this._normalize(conceptName);
        const node = this.graph.nodes[key];
        if (!node) return [];

        const direct = [];
        for (const edge of this.graph.edges) {
            let otherKey = null;
            if (edge.source === key) otherKey = edge.target;
            else if (edge.target === key) otherKey = edge.source;
            if (!otherKey) continue;
            const other = this.graph.nodes[otherKey];
            if (!other || edge.weight < minWeight) continue;
            direct.push({
                concept: other.name, key: otherKey, category: other.category,
                weight: edge.weight, type: edge.type, frequency: other.frequency
            });
        }

        if (direct.length < maxResults) {
            const queryVec = node.embedding;
            const candidates = Object.values(this.graph.nodes)
                .filter(n => n.key !== key && !direct.some(r => r.key === n.key));
            for (const c of candidates) {
                const sim = this.embeddings.cosineSimilarity(queryVec, c.embedding);
                if (sim >= minWeight) {
                    direct.push({
                        concept: c.name, key: c.key, category: c.category,
                        weight: sim, type: 'semantic', frequency: c.frequency
                    });
                }
            }
        }

        direct.sort((a, b) => b.weight - a.weight);
        return direct.slice(0, maxResults);
    }

    async findPath(fromName, toName) {
        const fromKey = this._normalize(fromName);
        const toKey = this._normalize(toName);
        if (!this.graph.nodes[fromKey] || !this.graph.nodes[toKey]) return [];

        const visited = new Set();
        const queue = [{ key: fromKey, path: [fromKey] }];
        visited.add(fromKey);

        while (queue.length > 0) {
            const { key, path } = queue.shift();
            const neighbors = this.graph.edges
                .filter(e => e.source === key || e.target === key)
                .map(e => e.source === key ? e.target : e.source);

            for (const nk of neighbors) {
                if (nk === toKey) return [...path, nk];
                if (!visited.has(nk)) {
                    visited.add(nk);
                    queue.push({ key: nk, path: [...path, nk] });
                }
            }
        }
        return [];
    }

    getNode(name) {
        return this.graph.nodes[this._normalize(name)] || null;
    }

    search(query, limit = 10) {
        const q = query.toLowerCase();
        return Object.values(this.graph.nodes)
            .filter(n => n.name.toLowerCase().includes(q) || n.category.includes(q))
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, limit)
            .map(n => ({ name: n.name, key: n.key, category: n.category, frequency: n.frequency }));
    }

    getStats() {
        return {
            nodes: Object.keys(this.graph.nodes).length,
            edges: this.graph.edges.length,
            categories: new Set(Object.values(this.graph.nodes).map(n => n.category)).size
        };
    }
}

module.exports = KnowledgeGraph;
