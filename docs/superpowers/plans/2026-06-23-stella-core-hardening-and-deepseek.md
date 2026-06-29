# Stella Core Hardening and DeepSeek Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stella safe for a private Telegram owner, integrate DeepSeek as the primary text provider, and reduce recurring context/token cost without removing existing capabilities.

**Architecture:** Move secrets and runtime choices into one config module, isolate provider calls behind a common interface, and make a per-user session manager own compact history, summaries, and selected model. DeepBrain remains a cheap local intent/router signal, but only verified decisions change routing; automatic self-modification becomes reviewable instead of directly changing prompts.

**Tech Stack:** Node.js CommonJS, `node --test`, `axios`, `dotenv`, `node-telegram-bot-api`, DeepSeek OpenAI-compatible Chat Completions API, existing TensorFlow.js modules.

---

## File map

- Create: `.env.example` — non-secret runtime-variable template.
- Create: `core/config.js` — validates and exports all runtime configuration.
- Create: `core/access_control.js` — owner-chat authorization and tool permission policy.
- Create: `core/conversation_store.js` — per-user history, compact summary, and token budget.
- Create: `core/providers/deepseek_provider.js` — DeepSeek text/tool-call client.
- Create: `core/providers/gemini_provider.js` — existing Gemini media capability behind the same provider contract.
- Create: `core/provider_router.js` — uses the DeepBrain decision and message capability to select a provider.
- Create: `core/tool_registry.js` — static, policy-checked tool loading.
- Create: `tests/config.test.js`, `tests/access_control.test.js`, `tests/conversation_store.test.js`, `tests/provider_router.test.js`, `tests/deep_brain_routing.test.js`.
- Modify: `index.js` — orchestration only; remove embedded secrets, global model selection, and provider-specific loops.
- Modify: `core/stella_tree.js` — consume a route decision rather than only injecting a neural prompt.
- Modify: `core/deep_brain.js` — make routing deterministic and feedback-driven; stop self-labelled retraining.
- Modify: `core/self_modifier.js` — queue candidate changes for owner approval; do not auto-apply.
- Modify: `core/auto_researcher.js` — research only explicit/current-information requests and bounded cache results.
- Modify: `package.json`, `package-lock.json` — add `dotenv`, `node --test`, and update vulnerable dependencies deliberately.
- Modify: `README.md`, `AI_DEVELOPMENT_GUIDE.md`, `docs/01_SYSTEM_ARCHITECTURE.md`, `docs/02_AGENTIC_LOOP_AND_TOOLS.md`, `docs/03_DEEP_LEARNING_AND_EVOLUTION.md`, `docs/04_MEMORY_AND_STATE.md` — make documentation match the runtime.

### Task 1: Establish safe configuration and rotate compromised credentials

**Files:**
- Create: `.env.example`
- Create: `core/config.js`
- Modify: `.gitignore`
- Modify: `index.js:1-67`
- Test: `tests/config.test.js`

- [ ] **Step 1: Write failing configuration tests**

```js
// tests/config.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAllowedChatIds, requireValue } = require('../core/config');

test('parseAllowedChatIds trims and removes duplicates', () => {
  assert.deepEqual(parseAllowedChatIds('10, 20,10'), new Set(['10', '20']));
});

test('requireValue rejects a missing secret', () => {
  assert.throws(() => requireValue({}, 'DEEPSEEK_API_KEY'), /DEEPSEEK_API_KEY/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/config.test.js`

Expected: failure because `core/config.js` does not exist.

- [ ] **Step 3: Add environment configuration**

```js
// core/config.js
require('dotenv').config();

function requireValue(source, name) {
  const value = source[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseAllowedChatIds(value = '') {
  return new Set(value.split(',').map((id) => id.trim()).filter(Boolean));
}

function loadConfig(env = process.env) {
  const allowedChatIds = parseAllowedChatIds(requireValue(env, 'ALLOWED_CHAT_IDS'));
  if (allowedChatIds.size === 0) throw new Error('ALLOWED_CHAT_IDS must not be empty');
  return {
    telegramToken: requireValue(env, 'TELEGRAM_TOKEN'),
    deepseekApiKey: requireValue(env, 'DEEPSEEK_API_KEY'),
    deepseekModel: env.DEEPSEEK_MODEL || 'deepseek-chat',
    deepseekReasonerModel: env.DEEPSEEK_REASONER_MODEL || 'deepseek-reasoner',
    geminiApiKey: env.GEMINI_API_KEY || '',
    groqApiKey: env.GROQ_API_KEY || '',
    allowedChatIds,
    selfReflectionEnabled: env.SELF_REFLECTION_ENABLED === 'true'
  };
}

module.exports = { loadConfig, parseAllowedChatIds, requireValue };
```

```dotenv
# .env.example
TELEGRAM_TOKEN=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_REASONER_MODEL=deepseek-reasoner
GEMINI_API_KEY=
GROQ_API_KEY=
ALLOWED_CHAT_IDS=
SELF_REFLECTION_ENABLED=false
```

Replace the three hard-coded keys in `index.js` with `const config = loadConfig();`. Keep `.env` ignored; never log secret values.

- [ ] **Step 4: Rotate credentials outside the repository**

Run the provider dashboards to revoke the existing Telegram, Gemini, and Groq tokens that were committed in `index.js`; replace only their new values in the local `.env`. Keep the supplied DeepSeek key only in `.env`.

Expected: no token-shaped literal is returned by `rg -n 'AIza|gsk_|[0-9]{8,}:' -g '*.js' .`.

- [ ] **Step 5: Run tests**

Run: `node --test tests/config.test.js`

Expected: PASS.

### Task 2: Restrict Telegram access and protect local tools

**Files:**
- Create: `core/access_control.js`
- Modify: `index.js:362-380`
- Modify: `tools/execute_command.js`
- Modify: `tools/read_file.js`
- Modify: `tools/write_file.js`
- Modify: `tools/download_file.js`
- Test: `tests/access_control.test.js`

- [ ] **Step 1: Write authorization tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { canUseBot, canExecuteTool } = require('../core/access_control');

test('only configured owner chats may use Stella', () => {
  const owners = new Set(['6182570336']);
  assert.equal(canUseBot('6182570336', owners), true);
  assert.equal(canUseBot('999', owners), false);
});

test('shell commands require an owner', () => {
  assert.equal(canExecuteTool('execute_command', true), true);
  assert.equal(canExecuteTool('execute_command', false), false);
});
```

- [ ] **Step 2: Implement the policy before any AI request**

```js
function canUseBot(chatId, allowedChatIds) {
  return allowedChatIds.has(String(chatId));
}

function canExecuteTool(toolName, isOwner) {
  return isOwner && ['execute_command', 'read_file', 'write_file', 'download_file', 'send_media'].includes(toolName);
}

module.exports = { canUseBot, canExecuteTool };
```

At the beginning of `bot.on('message')`, return immediately when `canUseBot(chatId, config.allowedChatIds)` is false. Pass `isOwner: true` only after this check into tool execution. Limit `execute_command` to an explicit allowlist of read-only diagnostics initially (`node --version`, `npm --version`, `dir`, `Get-ChildItem`); reject everything else until an owner-only confirmation command is designed.

- [ ] **Step 3: Constrain file and download paths**

Resolve all requested file paths against `workspace/` with `path.resolve`, reject paths outside that directory, limit downloads to 25 MB, set Axios timeouts, and disallow non-HTTP(S) URLs.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/access_control.test.js`

Expected: PASS.

### Task 3: Build compact per-user conversation state

**Files:**
- Create: `core/conversation_store.js`
- Modify: `index.js:217-265, 461-462, 478-479, 575, 633, 727-731`
- Test: `tests/conversation_store.test.js`

- [ ] **Step 1: Write history-budget tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { trimHistory } = require('../core/conversation_store');

test('trimHistory keeps the newest messages inside the character budget', () => {
  const messages = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `m${i}`.repeat(40) }));
  const trimmed = trimHistory(messages, 150);
  assert.ok(trimmed.reduce((n, item) => n + item.content.length, 0) <= 150);
  assert.equal(trimmed.at(-1).content.startsWith('m9'), true);
});
```

- [ ] **Step 2: Implement a provider-neutral store**

Store `{ role: 'user'|'assistant', content }` per user. Keep the latest six messages plus a bounded rolling summary; cap raw history at 12,000 characters and injected user facts at 2,000 characters. Convert that neutral structure to Gemini, DeepSeek, or Codex only inside their provider adapters.

- [ ] **Step 3: Remove global model state**

Replace `let currentModel` with a `selectedProvider` field in each user session. `/model` changes only the requesting user's session and never changes another chat.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/conversation_store.test.js`

Expected: PASS.

### Task 4: Add DeepSeek behind a provider interface

**Files:**
- Create: `core/providers/deepseek_provider.js`
- Create: `core/providers/gemini_provider.js`
- Create: `core/provider_router.js`
- Modify: `index.js:2-25, 461-639`
- Test: `tests/provider_router.test.js`

- [ ] **Step 1: Write router tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectProvider } = require('../core/provider_router');

test('text uses DeepSeek chat by default', () => {
  assert.deepEqual(selectProvider({ hasMedia: false, route: 'normal' }), { provider: 'deepseek', model: 'deepseek-chat' });
});

test('media stays on Gemini until DeepSeek media support is verified', () => {
  assert.equal(selectProvider({ hasMedia: true, route: 'normal' }).provider, 'gemini');
});
```

- [ ] **Step 2: Implement a common response contract**

Every provider returns `{ text, toolCalls, usage, finishReason }`. The DeepSeek adapter sends OpenAI-compatible `messages`, `tools`, `tool_choice: 'auto'`, a timeout, and a maximum output token setting. It must preserve tool-call IDs and surface provider errors without exposing request headers or keys.

- [ ] **Step 3: Route by capability and difficulty**

Use `deepseek-chat` for normal text. Permit the reasoner model only for an explicit owner command or a high-confidence `complex` route; it is never the default. Keep Gemini only for image/voice processing until a separate compatibility test proves an equivalent DeepSeek media path. Remove Groq and the Codex bridge from the active path only after the DeepSeek smoke tests pass.

- [ ] **Step 4: Add a local mocked DeepSeek smoke test**

Use an Axios mock adapter or dependency injection to assert that one user message becomes one `/chat/completions` request and returns normalized text. The test must also assert that an API key is never present in thrown errors or logs.

- [ ] **Step 5: Run provider tests**

Run: `node --test tests/provider_router.test.js`

Expected: PASS.

### Task 5: Make DeepBrain an actual cheap router

**Files:**
- Modify: `core/deep_brain.js:341-527`
- Modify: `core/stella_tree.js:70-145`
- Modify: `index.js:461-500`
- Test: `tests/deep_brain_routing.test.js`

- [ ] **Step 1: Write route-decision tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveRoute } = require('../core/deep_brain');

test('explicit coding task gets a complex route', () => {
  assert.equal(deriveRoute('bedah error stack trace dan perbaiki kode', { intent: 'command' }), 'complex');
});

test('greeting gets a direct route', () => {
  assert.equal(deriveRoute('halo stella', { intent: 'greeting' }), 'direct');
});
```

- [ ] **Step 2: Separate routing from model training**

Export a pure `deriveRoute(message, signals)` function with `direct`, `normal`, `research`, `tool`, and `complex` results. Have `stella_tree` store `ctx.route`, and have `provider_router` consume it. Remove the unused `shouldUseCodex` path and do not add every rule-generated intent as neural training data.

- [ ] **Step 3: Make feedback data trustworthy**

Only create quality samples from explicit thumbs-up/down callbacks. Stop automatic retraining by default; add a private owner command that reports class distribution and requires a minimum sample count per intent before training.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/deep_brain_routing.test.js`

Expected: PASS.

### Task 6: Bound research, self-modification, and prompt growth

**Files:**
- Modify: `core/auto_researcher.js:16-111, 206-217`
- Modify: `core/self_modifier.js:233-293`
- Modify: `index.js:286-307, 461-462`
- Test: `tests/provider_router.test.js`

- [ ] **Step 1: Make research opt-in by evidence**

Research only when the user explicitly asks for current information, links, citations, or a web search; do not research ordinary definitions or every capitalized name. Limit injected snippets to three entries and 1,500 characters, cache successful results with the existing expiry, and attach source URLs when available.

- [ ] **Step 2: Queue self-modification instead of applying it**

Change reflection output handling from `applyReflectionResults()` to `createPendingProposal()`. Persist proposal id, source, timestamp, and candidate patch/rule. Add owner-only `/patch approve <id>` and `/patch reject <id>` commands; only approval calls the old patch/rule mutation functions. Set `SELF_REFLECTION_ENABLED=false` by default.

- [ ] **Step 3: Enforce prompt budgets**

Before an AI call, compose persona, summary, facts, skills, research, rules, and patches through a budget allocator. Keep persona first, then current user message, then summary; drop lowest-priority hints first and record only lengths in diagnostics.

- [ ] **Step 4: Verify no automatic mutation occurs**

Run: `node --test tests/provider_router.test.js`

Expected: PASS after a mocked reflection response leaves active patches unchanged.

### Task 7: Replace dynamic production tool loading with a reviewed registry

**Files:**
- Create: `core/tool_registry.js`
- Modify: `index.js:166-215, 464-565`
- Modify: `docs/02_AGENTIC_LOOP_AND_TOOLS.md`
- Test: `tests/access_control.test.js`

- [ ] **Step 1: Define the static registry**

Export `createToolRegistry()` that explicitly imports the reviewed tool files and returns only their public declarations and handlers. Keep hot reload available only when `NODE_ENV=development`; production must not execute a newly dropped JavaScript file on the next Telegram message.

- [ ] **Step 2: Apply access policy before tool execution**

Check owner authorization and tool policy before calling any handler. Return a compact denied result to the provider so it can answer the user without retrying the same forbidden call.

- [ ] **Step 3: Verify tool discovery is stable**

Run: `node --test tests/access_control.test.js`

Expected: PASS and no unregistered tool declaration is exposed.

### Task 8: Modernize dependencies, test the complete flow, and update docs

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `README.md`, `AI_DEVELOPMENT_GUIDE.md`, `docs/01_SYSTEM_ARCHITECTURE.md`, `docs/03_DEEP_LEARNING_AND_EVOLUTION.md`, `docs/04_MEMORY_AND_STATE.md`
- Test: all `tests/*.test.js`

- [ ] **Step 1: Replace the placeholder test script**

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "check": "node --check index.js && node --check core/stella_tree.js && node --check core/deep_brain.js"
  }
}
```

- [ ] **Step 2: Update dependencies deliberately**

Run: `npm install dotenv@latest node-telegram-bot-api@1.1.1`

Run: `npm audit --omit=dev`

Expected: the old `node-telegram-bot-api` request-chain findings are removed or explicitly documented if a remaining dependency cannot be upgraded safely. Do not use `npm audit fix --force`.

- [ ] **Step 3: Update operational documentation**

Document `.env` setup without secrets, owner-chat setup, DeepSeek text routing, Gemini media fallback, `/model` per-user behavior, approved self-modification workflow, tool restrictions, test commands, and recovery steps for failed DeepSeek calls.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: all new tests pass.

Run: `npm run check`

Expected: all syntax checks pass.

Run: `npm audit --omit=dev`

Expected: audit output is reviewed and remaining findings are recorded in `AI_DEVELOPMENT_GUIDE.md`.

- [ ] **Step 5: Perform owner-only runtime smoke test**

Start Stella with the local `.env`, then from the allowed Telegram chat verify: normal text response, a rejected message from a non-owner test chat, one approved safe tool call, one media request through Gemini fallback, `/model` isolation between two sessions, a compact-history response after more than six exchanges, and a rejected pending patch.

## Coverage review

- Secret handling, key rotation, and private-chat authorization: Tasks 1-2.
- Token cost from history, memory, tools, research, and patches: Tasks 3 and 6.
- DeepSeek integration while preserving media: Task 4.
- DeepBrain signals that currently do not route work: Task 5.
- Unsafe hot-loaded tools and unrestricted commands: Tasks 2 and 7.
- Dependency vulnerabilities, tests, and stale documentation: Task 8.

The workspace is not currently a Git repository, so implementation checkpoints must use test output and explicit file review rather than commits until a repository is initialized.
