const EmbeddingEngine = require('./embeddings');
const KnowledgeGraph = require('./graph');
const OntologyEngine = require('./ontology');
const FactEngine = require('./facts');
const FactStore = require('./fact_store');
const SkillStore = require('./skill_store');
const RuleStore = require('./rule_store');
const ExperienceStore = require('./experience_store');

class KnowledgeBase {
    constructor() {
        this.embeddings = new EmbeddingEngine();
        this.graph = new KnowledgeGraph(this.embeddings);
        this.ontology = new OntologyEngine(this.embeddings);
        this.facts = new FactEngine(this.embeddings);
        this.factStore = new FactStore();
        this.skillStore = new SkillStore();
        this.ruleStore = new RuleStore();
        this.experienceStore = new ExperienceStore();
        this.isReady = false;
    }

    async initialize() {
        await this.embeddings._initTF();
        if (this.ontology.getAllCategories().length === 0) {
            await this.ontology.buildDefaultOntology();
        }
        this.isReady = true;
        return this;
    }

    async learn(statement, category = 'general', source = 'inference', confidence = 0.7) {
        const fact = await this.facts.addFact(statement, category, source, confidence);
        this.factStore.add({ statement, category, source, confidence });

        const words = statement.split(/\s+/).filter(w => w.length > 3);
        for (const word of words.slice(0, 2)) {
            await this.graph.addConcept(word, category, { source: 'fact' });
            this.embeddings.updateVocab(statement);
        }
        if (words.length >= 2) {
            for (let i = 0; i < Math.min(words.length - 1, 2); i++) {
                this.graph.addRelation(words[i], words[i + 1], 'co_occurs', 0.3);
            }
        }
        return fact;
    }

    async query(question, opts = {}) {
        const facts = await this.facts.retrieve(question, opts);
        const concepts = this.graph.search(question, 5);
        const related = concepts.length > 0
            ? await this.graph.getRelated(concepts[0].name, { maxResults: 3 })
            : [];
        return { facts, concepts, related };
    }

    async getContext(query, maxFacts = 5) {
        const result = await this.query(query, { maxResults: maxFacts });
        let context = '';
        if (result.facts.length > 0) {
            context += 'KNOWN FACTS:\n';
            for (const f of result.facts) {
                context += `- [${f.confidence.toFixed(2)}] ${f.statement}\n`;
            }
        }
        if (result.related.length > 0) {
            context += 'RELATED CONCEPTS: ';
            context += result.related.map(r => r.concept).join(', ');
            context += '\n';
        }
        return context || null;
    }

    getStats() {
        return {
            embeddings: this.embeddings.isReady,
            graph: this.graph.getStats(),
            ontology: this.ontology.getStats(),
            facts: this.facts.getStats(),
            factStore: this.factStore.count(),
            skillStore: this.skillStore.count(),
            ruleStore: this.ruleStore.count(),
            experienceStore: this.experienceStore.count(),
            vocabSize: this.embeddings.vocab.size
        };
    }
}

module.exports = KnowledgeBase;
