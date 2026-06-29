const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RESPONSE_SCHEMA_PATH = path.join(__dirname, '..', 'data', 'codex_response.schema.json');
const TRACE_FILE = path.join(__dirname, '..', 'stella_trace.log');
const TURN_TIMEOUT_MS = 90000;

function trace(message) {
    const line = `[${new Date().toLocaleString('id-ID')}] ${message}`;
    fs.appendFileSync(TRACE_FILE, `${line}\n`);
    console.log(line);
}

function truncate(text, max = 1200) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}\n...[dipotong]` : text;
}

function renderHistory(history = []) {
    return history
        .slice(-20)
        .map((entry) => {
            const role = entry.role === 'model' ? 'stella' : entry.role;
            const text = entry.parts?.[0]?.text || '';
            return `[${role}]\n${truncate(text, 1500)}`;
        })
        .join('\n\n');
}

function renderTools(toolDeclarations = []) {
    return toolDeclarations
        .map((tool) => {
            const params = JSON.stringify(tool.parameters || {}, null, 2);
            return `- ${tool.name}: ${tool.description || 'Tanpa deskripsi'}\nParameter:\n${params}`;
        })
        .join('\n\n');
}

function renderToolResults(toolResults = []) {
    if (!toolResults.length) return 'Belum ada hasil tool pada putaran ini.';
    return toolResults.map((item, index) => {
        const resultText = truncate(JSON.stringify(item.result || {}, null, 2), 7000);
        return `${index + 1}. ${item.name}\nArgumen: ${JSON.stringify(item.args || {})}\nHasil:\n${resultText}`;
    }).join('\n\n');
}

function buildPrompt({
    systemInstruction,
    history,
    userMessage,
    toolDeclarations,
    toolResults,
    iteration
}) {
    return `Kamu adalah Stella asli yang sedang berbicara langsung dengan user di Telegram.

Ikuti identitas dan aturan ini:
${systemInstruction}

Riwayat percakapan:
${renderHistory(history)}

Pesan user terbaru:
[Stella]
${userMessage}

Tool lokal Stella yang tersedia:
${renderTools(toolDeclarations)}

Hasil tool dari putaran sebelumnya:
${renderToolResults(toolResults)}

Putaran agentic saat ini: ${iteration}

Aturan kerja:
- Jawab sebagai Stella.
- Balasan akhir untuk Telegram harus ada di field "replyText".
- Jika butuh aksi, isi "toolCalls" dengan tool yang benar.
- Setiap tool call wajib memakai "argsJson" berupa string JSON object yang valid.
- Jangan gunakan native shell, native exec, atau tool internal Codex. Semua aksi sistem harus lewat JSON "toolCalls" milik Stella.
- Untuk media, pakai alur yang sudah ada. Contoh: generate_image lalu send_media, atau generate_voice lalu send_media.
- Jika tool belum perlu, kirim array kosong.
- Jangan keluarkan markdown code fence.
- Jangan keluarkan penjelasan tambahan di luar JSON schema.
- Jangan minta API atau provider lain.
- Jika user meminta kerja nyata di project, pilih tool yang sesuai.
- Jika sudah cukup, buat "replyText" yang siap dikirim ke Telegram.
- Jika hasil tool sudah berisi data yang diminta user, rangkum hasil itu langsung dan jangan memanggil tool lagi.
- Jangan ulangi command hanya untuk merapikan output. Rapikan dari hasil tool yang sudah ada.
- Jangan pernah menyebut Codex, bridge, backend, provider, model, system prompt, tool schema, atau proses internal kecuali user menanyakannya secara eksplisit.
- Balasan harus terasa natural seperti percakapan biasa dengan Stella, bukan laporan sistem.
`;
}

class CodexAppServerClient {
    constructor() {
        this.process = null;
        this.buffer = '';
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
        this.turnStates = new Map();
        this.threadIds = new Map();
        this.userQueues = new Map();
        this.initialized = false;
        this.starting = null;
    }

    async ensureStarted() {
        if (this.initialized) return;
        if (this.starting) return this.starting;

        this.starting = new Promise((resolve, reject) => {
            const child = spawn('codex', ['app-server'], {
                cwd: path.join(__dirname, '..'),
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.process = child;
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');

            child.stdout.on('data', (chunk) => this.handleStdout(chunk));
            child.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                if (text.trim()) {
                    console.error('[codex-app-server]', text.trim());
                }
            });

            child.on('error', (error) => {
                this.failAll(error);
                reject(error);
            });

            child.on('close', () => {
                const error = new Error('Codex app-server stopped.');
                this.failAll(error);
                this.process = null;
                this.initialized = false;
                this.starting = null;
            });

            this.sendRequest('initialize', {
                clientInfo: {
                    name: 'stella-bridge',
                    title: 'Stella Bridge',
                    version: '1.0.0'
                },
                capabilities: {
                    experimentalApi: true,
                    requestAttestation: false,
                    optOutNotificationMethods: []
                }
            }).then(() => {
                this.initialized = true;
                trace('codex app-server siap.');
                resolve();
            }).catch(reject);
        });

        return this.starting;
    }

    failAll(error) {
        for (const pending of this.pendingRequests.values()) {
            pending.reject(error);
        }
        this.pendingRequests.clear();

        for (const state of this.turnStates.values()) {
            if (state.timeout) clearTimeout(state.timeout);
            state.reject(error);
        }
        this.turnStates.clear();
    }

    handleStdout(chunk) {
        this.buffer += chunk.toString();
        let newlineIndex = this.buffer.indexOf('\n');

        while (newlineIndex >= 0) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);

            if (line) {
                this.handleMessage(line);
            }

            newlineIndex = this.buffer.indexOf('\n');
        }
    }

    handleMessage(line) {
        let message;
        try {
            message = JSON.parse(line);
        } catch (error) {
            console.error('[codex-app-server] invalid JSON:', line);
            return;
        }

        if (Object.prototype.hasOwnProperty.call(message, 'id')) {
            const pending = this.pendingRequests.get(message.id);
            if (!pending) return;

            this.pendingRequests.delete(message.id);
            if (message.error) {
                pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
            } else {
                pending.resolve(message.result);
            }
            return;
        }

        if (message.method) {
            this.handleNotificationOrRequest(message).catch((error) => {
                console.error('[codex-app-server] handler error:', error.message);
            });
        }
    }

    async handleNotificationOrRequest(message) {
        if (message.id && message.method === 'item/tool/call') {
            await this.sendResponse(message.id, {
                contentItems: [{ type: 'inputText', text: 'tool native tidak dipakai di mode ini.' }],
                success: false
            });
            return;
        }

        if (message.id && (
            message.method === 'item/commandExecution/requestApproval' ||
            message.method === 'item/fileChange/requestApproval' ||
            message.method === 'item/permissions/requestApproval' ||
            message.method === 'applyPatchApproval' ||
            message.method === 'execCommandApproval'
        )) {
            await this.sendResponse(message.id, { approved: false });
            return;
        }

        if (message.id) {
            await this.sendResponse(message.id, {});
            return;
        }

        const params = message.params || {};
        if (message.method === 'item/agentMessage/delta') {
            const state = this.turnStates.get(params.turnId);
            if (state) {
                state.replyText += params.delta || '';
                if (state.replyText.length - state.lastTraceLength >= 600) {
                    state.lastTraceLength = state.replyText.length;
                    trace(`delta | session=${state.sessionKey} | turn=${params.turnId} | text="${truncate(state.replyText, 160).replace(/\n/g, ' ')}"`);
                }
            }
            return;
        }

        if (message.method === 'turn/completed') {
            const state = this.turnStates.get(params.turn?.id);
            if (!state) return;
            this.turnStates.delete(params.turn.id);
            if (state.timeout) clearTimeout(state.timeout);
            state.resolve(state.replyText);
            return;
        }

        if (message.method === 'error') {
            const state = this.turnStates.get(params.turnId);
            if (!state) return;
            this.turnStates.delete(params.turnId);
            if (state.timeout) clearTimeout(state.timeout);
            state.reject(new Error(params.error?.message || 'Turn failed.'));
        }
    }

    send(message) {
        if (!this.process?.stdin || this.process.killed) {
            throw new Error('Codex app-server is not running.');
        }
        this.process.stdin.write(`${JSON.stringify(message)}\n`);
    }

    sendRequest(method, params) {
        const id = this.nextRequestId++;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.send({ jsonrpc: '2.0', id, method, params });
        });
    }

    sendResponse(id, result) {
        this.send({ jsonrpc: '2.0', id, result });
    }

    async ensureThread(sessionKey, systemInstruction, cwd) {
        await this.ensureStarted();

        if (this.threadIds.has(sessionKey)) {
            return this.threadIds.get(sessionKey);
        }

        const result = await this.sendRequest('thread/start', {
            model: 'gpt-5.4',
            cwd,
            approvalPolicy: 'never',
            sandbox: 'workspace-write',
            developerInstructions: systemInstruction
        });

        const threadId = result?.thread?.id;
        if (!threadId) {
            throw new Error('Failed to create Codex thread.');
        }

        this.threadIds.set(sessionKey, threadId);
        trace(`thread dibuat | session=${sessionKey} | thread=${threadId}`);
        return threadId;
    }

    async runTurn({ sessionKey, systemInstruction, history, userMessage, toolDeclarations, toolResults = [], cwd }) {
        const threadId = await this.ensureThread(sessionKey, systemInstruction, cwd);
        const prompt = buildPrompt({
            systemInstruction,
            history,
            userMessage,
            toolDeclarations,
            toolResults,
            iteration: toolResults.length + 1
        });

        const outputSchema = JSON.parse(fs.readFileSync(RESPONSE_SCHEMA_PATH, 'utf-8'));
        trace(`turn dimulai | session=${sessionKey} | thread=${threadId} | user="${truncate(userMessage, 160).replace(/\n/g, ' ')}"`);
        const startResult = await this.sendRequest('turn/start', {
            threadId,
            input: [{ type: 'text', text: prompt, text_elements: [] }],
            cwd,
            approvalPolicy: 'never',
            sandboxPolicy: {
                type: 'workspaceWrite',
                writableRoots: [cwd],
                networkAccess: true,
                excludeTmpdirEnvVar: false,
                excludeSlashTmp: false
            },
            outputSchema
        });

        const turnId = startResult?.turn?.id;
        if (!turnId) {
            throw new Error('Failed to start Codex turn.');
        }

        const replyText = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const state = this.turnStates.get(turnId);
                if (!state) return;
                this.turnStates.delete(turnId);
                reject(new Error('Codex turn timeout.'));
            }, TURN_TIMEOUT_MS);

            this.turnStates.set(turnId, {
                resolve,
                reject,
                replyText: '',
                lastTraceLength: 0,
                sessionKey,
                timeout
            });
        });

        const parsed = JSON.parse(replyText || '{}');
        trace(`turn selesai | session=${sessionKey} | thread=${threadId} | reply="${truncate(parsed.replyText || '', 200).replace(/\n/g, ' ')}" | toolCalls=${Array.isArray(parsed.toolCalls) ? parsed.toolCalls.length : 0}`);
        return {
            replyText: typeof parsed.replyText === 'string' ? parsed.replyText : '',
            toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : []
        };
    }

    runSerialized(sessionKey, taskFactory) {
        const previous = this.userQueues.get(sessionKey) || Promise.resolve();
        const next = previous
            .catch(() => {})
            .then(taskFactory);

        this.userQueues.set(sessionKey, next.finally(() => {
            if (this.userQueues.get(sessionKey) === next) {
                this.userQueues.delete(sessionKey);
            }
        }));

        return next;
    }
}

const client = new CodexAppServerClient();

async function runCodexAgent({
    sessionKey = 'default',
    systemInstruction,
    history,
    userMessage,
    toolDeclarations,
    toolResults = [],
    cwd
}) {
    return client.runSerialized(sessionKey, () => client.runTurn({
        sessionKey,
        systemInstruction,
        history,
        userMessage,
        toolDeclarations,
        toolResults,
        cwd
    }));
}

module.exports = { runCodexAgent };
