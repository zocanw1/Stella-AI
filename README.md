# 🤖 Stella AI — Asisten Multimodal Telegram + Discord

Stella adalah asisten AI otonom dengan **machine learning pipeline end-to-end**, neural decision-making, knowledge graph, dan executive brain. Support Telegram + Discord.

---

## ⚡ Status: v5.2

| Modul | Status |
|-------|--------|
| ExecutiveBrain | 12 subsystem, dispatch otomatis |
| Knowledge Graph | Graph + 4 store (fact, skill, rule, experience) |
| Memory Core | 5-tier memory (working → semantic) |
| Reasoning | 10 strategi (deductive, causal, analogical, etc.) |
| Planning | Task decomposition + risk assessment |
| Reflection | Outcome analysis + improvement generation |
| GroundTruth | 40 seed samples, dedup, versioning |
| Feedback Engine | 16 signal patterns + implicit detection |
| Model Registry | Versioning + A/B compare + rollback |
| Scheduler | Idle detection, task priority queue |

---

## 🧠 Arsitektur ML

```
User Message
  │
  ▼
kernel.processMessage()
  ├─► needAnalyzer.analyze()
  │     └─► IntentClassifier (TF.js neural net, 11→16→8→5)
  │
  ├─► contextBuilder.build()
  │     └─► hanya query module yang aktif (hemat token)
  │
  ├─► executiveBrain.dispatch()
  │     └─► dispatch ke safety, memory, knowledge, reasoning, planning, skills
  │
  └─► LLM response

kernel.recordOutcome()
  ├─► experience.record() (episode storage, bukan training)
  ├─► reflection.reflect()
  └─► feedback recordToolOutcome()
        └─► groundTruth.addSample() → deepBrain.addVerifiedSample()
```

### ML Pipeline

```
GroundTruth (validated labels)
  │
  ▼
DatasetManager (split, dedup, balance)
  │
  ▼
Trainer (modelAdapter → train → evaluate → save → register)
  │
  ▼
ModelRegistry (versioning, A/B compare, rollback)
```

### Yang sudah diperbaiki

- **Circular training dihentikan** — model tidak lagi belajar dari prediksi sendiri
- **Retraining hanya dari verified data** — label harus dari ground truth atau user feedback
- **Dead code dihapus** — 6 model TF.js palsu/mati dibuang (~395 lines)
- **Feedback 16 sinyal** — deteksi "salah", "bukan gitu", "maksud aku", "ulangi", "gak nyambung", "bagus", "makasih", "berhasil", "lanjut", plus implicit detection

### Model ML Aktif (TF.js)

| Model | File | Tipe | Dataset |
|-------|------|------|---------|
| Intent Classifier | `deep_brain.js` | 200→64→32→9 | Verified samples dari feedback |
| Discord Voice Intent | `intent_classifier.js` | 11→16→8→5 | 33 seed + user corrections |
| Embedding Autoencoder | `embeddings.js` | 64→32→64 | Knowledge base content |
| Experience Classifier | `experience_engine.js` | 8→16→5 | Verified outcomes only |

---

## 🚀 Cara Menjalankan

### 1. Install
```bash
npm install
```

### 2. `.env` — Telegram
```env
TELEGRAM_TOKEN=xxx
DEEPSEEK_API_KEY=xxx
GEMINI_API_KEY=xxx
GROQ_API_KEY=xxx
```

### 3. `.env` — Discord (opsional)
```env
DISCORD_TOKEN=xxx
```

### 4. Run
```bash
node index.js        # Telegram
node discord_bot.js  # Discord
```

---

## 📁 Arsitektur Folder

```
core/
├── kernel.js                 # Application Kernel (orchestrator)
├── need_analyzer.js          # Intent + complexity classification
├── context_builder.js        # Prompt builder (only active modules)
├── decision_journal.js       # Tool decision logging
├── deep_brain.js             # TF.js intent model + neural policy
├── intent_classifier.js      # TF.js voice intent (Discord join/leave)
├── event_bus.js              # Event-driven communication
├── stella_tree.js            # Behavior Tree (legacy routing)
│
├── engine/
│   ├── executive_brain.js    # Module dispatcher
│   ├── planning_engine.js    # Task decomposition
│   ├── reflection_engine.js  # Outcome analysis
│   ├── goal_engine.js        # Goal detection
│   └── curiosity_engine.js   # Knowledge gap detection
│
├── knowledge/
│   ├── index.js              # Knowledge base orchestrator
│   ├── graph.js              # Concept graph
│   ├── embeddings.js         # TF.js autoencoder
│   ├── facts.js / fact_store.js
│   ├── ontology.js
│   ├── skill_store.js / rule_store.js / experience_store.js
│
├── memory/
│   ├── memory_core.js        # 5-tier memory system
│   └── knowledge_graph.js    # Memory graph
│
├── reasoning/reasoner.js     # 10-strategy reasoning
├── experience/experience_engine.js  # Experience → asset conversion
├── skills/skill_engine.js    # Tool recommendation
├── workflow/workflow_engine.js
├── scheduler/scheduler.js    # Idle detection + task queue
├── safety/safety_layer.js    # Content safety
│
├── ml/                       # ═══ ML Infrastructure (v5.2) ═══
│   ├── ground_truth_manager.js  # Label storage + versioning
│   ├── dataset_manager.js       # Train/test split + balance
│   ├── feedback_engine.js       # 16 signal correction detection
│   ├── trainer.js               # Reusable training pipeline
│   ├── evaluator.js             # Accuracy, F1, confusion matrix
│   ├── model_registry.js        # Versioning + rollback
│   ├── adapters.js              # Model adapter factories
│   └── seed.js                  # 40 default labeled samples
│
├── learning_engine.js        # Rule-based interaction tracking
├── evolution.js              # RPG XP/level system
├── auto_researcher.js        # Web research
└── self_modifier.js          # Prompt patch system

data/ml/
├── ground_truth/             # Validated labels (40 samples)
├── datasets/                 # Exported training datasets
├── models/                   # Trained model weights
├── metrics/                  # Training metrics per model
└── feedback/                 # Feedback log
```

---

## 📊 Feedback Engine — 16 Sinyal Deteksi

### Koreksi Eksplisit (weight 0.5–0.9)
| Sinyal | Weight | Contoh |
|--------|--------|--------|
| `salah`, `bukan`, `nggak benar` | 0.9 | "salah, maksudku debug" |
| `maksudnya`, `maksud aku` | 0.85 | "maksud aku suruh deploy" |
| `koreksi`, `ralat`, `benerin` | 0.9 | "koreksi, bukan itu" |
| `seharusnya`, `yang benar` | 0.85 | "seharusnya yang benar itu..." |
| `ulangi`, `coba lagi` | 0.7 | "ulangi penjelasannya" |
| `gak nyambung`, `salah paham` | 0.8 | "gak nyambung jawabannya" |
| `kok gitu`, `ngawur`, `ngasal` | 0.6 | "kok gitu sih, ngasal" |
| `jelek`, `goblok`, `payah` | 0.5 | (sinyal lemah, emosional) |
| `no`, `enggak`, `tidak` | 0.7 | "no" (singkat) |

### Konfirmasi Positif (weight 0.5–0.9)
| Sinyal | Weight | Contoh |
|--------|--------|--------|
| `bagus`, `mantap`, `keren` | 0.85 | "bagus, mantap!" |
| `makasih`, `terima kasih` | 0.9 | "makasih ya!" |
| `berhasil`, `sukses`, `jalan` | 0.8 | "berhasil, thanks" |
| `lanjut`, `next`, `siap` | 0.6 | "lanjut ke step berikutnya" |
| `oh iya`, `paham`, `ngerti` | 0.6 | "oh iya paham sekarang" |
| `tolong`, `bantu` | 0.5 | "tolong lanjutin" |
| `ya`, `iya`, `betul` | 0.7 | "iya betul" |

### Deteksi Implisit
- User mengulang pertanyaan yang sama (word overlap > 60%) → **potential negative**
- User minta klarifikasi / detail tambahan → **potential negative** (weight 0.4)
- User follow-up natural ("lalu", "terus", "abis itu") → **potential positive** (weight 0.4)
- Tool outcome success/fail → otomatis direkam ke GroundTruth

---

## 📈 Startup Output

```
Stella v5 — Autonomous Intelligence is now ONLINE and ready.
==================================================
Level: 9 | XP: 29/2553
[v5 Modules] ExecutiveBrain | Knowledge | Reasoning | Planning | Reflection | Goal | Curiosity | Experience | Skills | Workflow | Scheduler | Safety
[v5 ML] Embeddings: hash | DeepBrain: Rule | Experience: classifier-ready
[v5.1 Kernel] NeedAnalyzer | ContextBuilder | DecisionJournal | IdleScheduler
[v5.2 ML] GroundTruth: 40 samples | ModelRegistry: 0 models | Feedback: active
==================================================
[v5.2 ML] GroundTruth seeded: 40 samples (v2)
```

---

## 🔧 API ML Modules

### GroundTruthManager
```js
gt.addSample(text, label, source?, metadata?) → sample
gt.getSamples({label?, source?, since?, limit?}) → sample[]
gt.createVersion() → version
gt.getStats() → {version, totalSamples, byLabel, bySource}
```

### DatasetManager
```js
ds.addSample(text, label) → sample
ds.balancedSplit(0.8) → {train, test}
ds.deduplicate() → count
ds.balance('oversample') → this
ds.saveToDisk() / DatasetManager.loadFromDisk(name)
```

### Trainer
```js
trainer.train({
  modelName, modelAdapter, dataset, config: {epochs, batchSize, validationSplit}
}) → {modelName, version, metrics, durationMs, modelPath}
```

### ModelRegistry
```js
registry.registerModel(name, config)
registry.recordVersion(name, metrics)
registry.compare(name, v1, v2) → delta per metrik
registry.rollback(name, v1) → bool
```

### FeedbackEngine
```js
feedback.processUserMessage(userId, msg, ctx) → {type, signal, weight} | null
feedback.recordCorrection(q, wrong, correct) → sample
feedback.recordToolOutcome(task, tool, success) → sample
feedback.rateLastResponse(userId, 1-5)
```

---

## 🛠️ Tools & Commands

- `/start` — Menu utama
- `/help` — Daftar perintah
- `/settings` — Konfigurasi personal
- Image generation, voice notes, web screenshot, file download
- Deploy, debug, research, file management
- Discord: voice join/leave via text command

---

*Dibuat dengan ❤️ — Stella v5.2*
