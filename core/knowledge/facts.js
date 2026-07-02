const fs = require('fs');
const path = require('path');

const FACTS_FILE = path.join(__dirname, '..', '..', 'data', 'knowledge', 'facts.json');
const MAX_FACTS = 1000;
const CONSOLIDATION_THRESHOLD = 0.82;

class FactEngine {
    constructor(embeddings) {
        this.embeddings = embeddings;
        this.facts = this._load();
    }

    _load() {
        try {
            return JSON.parse(fs.readFileSync(FACTS_FILE, 'utf-8'));
        } catch {
            return { facts: [], metadata: { total: 0, lastConsolidated: null } };
        }
    }

    _save() {
        this.facts.metadata.total = this.facts.facts.length;
        if (!fs.existsSync(path.dirname(FACTS_FILE))) {
            fs.mkdirSync(path.dirname(FACTS_FILE), { recursive: true });
        }
        fs.writeFileSync(FACTS_FILE, JSON.stringify(this.facts, null, 2));
    }

    async addFact(statement, category = 'general', source = 'inference', confidence = 0.7) {
        const fact = {
            id: 'fct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            statement: statement.trim(),
            category,
            source,
            confidence: Math.min(1, Math.max(0, confidence)),
            embedding: await this.embeddings.embed(statement),
            createdAt: new Date().toISOString(),
            lastConfirmed: new Date().toISOString(),
            confirmCount: 1,
            isActive: true
        };

        const existing = await this._findDuplicate(fact);
        if (existing) {
            existing.confirmCount += 1;
            existing.lastConfirmed = new Date().toISOString();
            existing.confidence = Math.min(1, existing.confidence + 0.05);
            if (fact.source === 'direct' && existing.source !== 'direct') {
                existing.source = 'direct';
            }
            this._save();
            return existing;
        }

        this.facts.facts.push(fact);
        if (this.facts.facts.length > MAX_FACTS) {
            this.facts.facts.sort((a, b) => {
                if (a.confidence !== b.confidence) return a.confidence - b.confidence;
                return a.confirmCount - b.confirmCount;
            });
            this.facts.facts = this.facts.facts.slice(-MAX_FACTS);
        }
        this._save();
        return fact;
    }

    async _findDuplicate(fact) {
        for (const existing of this.facts.facts) {
            if (!existing.isActive) continue;
            if (existing.statement.toLowerCase() === fact.statement.toLowerCase()) {
                return existing;
            }
            if (existing._embedding && fact.embedding) {
                const sim = this.embeddings.cosineSimilarity(existing.embedding, fact.embedding);
                if (sim > CONSOLIDATION_THRESHOLD) return existing;
            }
        }
        return null;
    }

    async retrieve(query, opts = {}) {
        const maxResults = opts.maxResults || 10;
        const minConfidence = opts.minConfidence || 0.3;
        const category = opts.category || null;

        let candidates = this.facts.facts.filter(f => f.isActive && f.confidence >= minConfidence);
        if (category) {
            candidates = candidates.filter(f => f.category === category);
        }

        const queryEmbedding = await this.embeddings.embed(query);
        const scored = [];
        for (const fact of candidates) {
            const sim = this.embeddings.cosineSimilarity(queryEmbedding, fact.embedding);
            const combinedScore = 0.6 * sim + 0.4 * fact.confidence;
            if (combinedScore >= 0.2) {
                scored.push({ ...fact, relevanceScore: combinedScore });
            }
        }

        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return scored.slice(0, maxResults).map(f => ({
            id: f.id,
            statement: f.statement,
            category: f.category,
            confidence: f.confidence,
            source: f.source,
            relevanceScore: f.relevanceScore,
            confirmCount: f.confirmCount,
            createdAt: f.createdAt
        }));
    }

    confirmFact(factId) {
        const fact = this.facts.facts.find(f => f.id === factId);
        if (fact) {
            fact.confirmCount += 1;
            fact.lastConfirmed = new Date().toISOString();
            fact.confidence = Math.min(1, fact.confidence + 0.05);
            this._save();
            return true;
        }
        return false;
    }

    disconfirmFact(factId) {
        const fact = this.facts.facts.find(f => f.id === factId);
        if (fact) {
            fact.confidence = Math.max(0.05, fact.confidence - 0.1);
            if (fact.confidence < 0.1) fact.isActive = false;
            this._save();
            return true;
        }
        return false;
    }

    async consolidate() {
        if (this.facts.facts.length < 3) return 0;
        let merged = 0;
        const toRemove = new Set();

        for (let i = 0; i < this.facts.facts.length; i++) {
            if (toRemove.has(i)) continue;
            for (let j = i + 1; j < this.facts.facts.length; j++) {
                if (toRemove.has(j)) continue;
                const sim = this.embeddings.cosineSimilarity(
                    this.facts.facts[i].embedding,
                    this.facts.facts[j].embedding
                );
                if (sim > CONSOLIDATION_THRESHOLD) {
                    const keep = this.facts.facts[i].confidence >= this.facts.facts[j].confidence ? i : j;
                    const remove = keep === i ? j : i;
                    this.facts.facts[keep].confirmCount += this.facts.facts[remove].confirmCount;
                    this.facts.facts[keep].confidence = Math.min(1,
                        (this.facts.facts[keep].confidence + this.facts.facts[remove].confidence) / 2 + 0.05
                    );
                    toRemove.add(remove);
                    merged++;
                }
            }
        }

        if (merged > 0) {
            this.facts.facts = this.facts.facts.filter((_, idx) => !toRemove.has(idx));
        }
        this.facts.metadata.lastConsolidated = new Date().toISOString();
        this._save();
        return merged;
    }

    getCategory(category) {
        return this.facts.facts.filter(f => f.category === category && f.isActive);
    }

    getStats() {
        const active = this.facts.facts.filter(f => f.isActive).length;
        const categories = {};
        for (const f of this.facts.facts) {
            if (f.isActive) categories[f.category] = (categories[f.category] || 0) + 1;
        }
        return { total: this.facts.facts.length, active, categories };
    }
}

module.exports = FactEngine;
