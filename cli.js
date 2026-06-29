#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = __dirname;
const SETTINGS_FILE = path.join(ROOT, 'settings.json');
const DB_FILE = path.join(ROOT, 'database.json');
const MEMORY_BANK_FILE = path.join(ROOT, 'memory_bank.json');
const EVO_FILE = path.join(ROOT, 'data', 'evolution_state.json');
const TOKEN_METRICS_FILE = path.join(ROOT, 'data', 'token_metrics.json');
const LOG_FILE = path.join(ROOT, 'bot_logs.txt');
const PERSONA_DIR = path.join(ROOT, 'Personas');

const dim = s => `\x1b[90m${s}\x1b[0m`;
const cyan = s => `\x1b[36m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function countMessages(db) {
  let total = 0;
  for (const uid of Object.keys(db)) {
    if (uid === '_description') continue;
    if (Array.isArray(db[uid])) total += db[uid].length;
  }
  return total;
}

function countUsers(db) {
  return Object.keys(db).filter(k => k !== '_description').length;
}

function isBotRunning() {
  try {
    const result = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { encoding: 'utf8', stdio: 'pipe' });
    return result.toLowerCase().includes('node.exe');
  } catch {
    return false;
  }
}

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

// ── Command Functions ──
function cmdStatus() {
  const settings = readJSON(SETTINGS_FILE);
  const running = isBotRunning();
  const defaultModel = settings?.default?.model || 'unknown';
  console.log(`  ${running ? green('● Running') : red('● Stopped')}    ${dim('model:')} ${cyan(defaultModel)}    ${dim('provider:')} ${cyan(defaultModel === 'gemini' ? 'Google Gemini' : defaultModel === 'deepseek' ? 'DeepSeek' : defaultModel)}    ${dim('dir:')} ${dim(ROOT)}`);
}

function cmdStats() {
  const db = readJSON(DB_FILE);
  const evo = readJSON(EVO_FILE);
  const tokens = readJSON(TOKEN_METRICS_FILE);
  if (db) {
    console.log(`  ${pad('Users', 16)}${pad('Messages', 16)}${pad('Level', 10)}XP`);
    console.log(`  ${dim('─'.repeat(56))}`);
    const level = evo ? evo.level : '?';
    console.log(`  ${pad(countUsers(db), 16)}${pad(countMessages(db), 16)}${pad(level, 10)}${evo ? `${evo.xp} / ${evo.xp_to_next_level}` : '?'}`);
  }
  if (evo) {
    console.log(`\n  ${dim('interactions:')} ${cyan(evo.total_interactions)}    ${dim('tasks:')} ${cyan(evo.total_tasks_completed)}    ${dim('feedback:')} ${green('👍 ' + evo.total_positive_feedback)} ${red('👎 ' + evo.total_negative_feedback)}`);
  }
  if (tokens) {
    console.log(`  ${dim('tokens:')} ${yellow(fmtNum(tokens.inputTokens))}${dim(' in / ')}${yellow(fmtNum(tokens.outputTokens))}${dim(' out')}    ${dim('requests:')} ${cyan(tokens.totalRequests)}`);
  }
}

function cmdSettings(user) {
  const settings = readJSON(SETTINGS_FILE);
  if (!settings) { console.log(`  ${red('cannot read settings.json')}`); return; }
  if (user) {
    const us = settings[user];
    if (!us) { console.log(`  ${yellow('user not found:')} ${user}`); return; }
    const flatten = (obj, prefix = '') => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'object' && v !== null) flatten(v, key);
        else console.log(`  ${cyan(key)}${dim(':')} ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      }
    };
    console.log(`  ${bold('settings')} ${cyan(user)}`);
    flatten(us);
  } else {
    console.log(`  ${pad('User', 20)}${pad('Model', 14)}${pad('Personality', 22)}Lang`);
    console.log(`  ${dim('─'.repeat(64))}`);
    for (const [uid, data] of Object.entries(settings)) {
      if (uid === '_description') continue;
      console.log(`  ${pad(uid.length > 18 ? uid.slice(0, 17) + '…' : uid, 20)}${pad(data.model || '-', 14)}${pad(data.personality || '-', 22)}${data.language || '-'}`);
    }
  }
}

function cmdSettingsSet(user, key, value) {
  const settings = readJSON(SETTINGS_FILE);
  if (!settings) { console.log(`  ${red('cannot read settings.json')}`); return; }
  if (!settings[user]) { console.log(`  ${yellow('user not found:')} ${user}`); return; }
  const numVal = Number(value);
  const boolVal = value === 'true' ? true : value === 'false' ? false : null;
  let parsed = numVal.toString() === value ? numVal : boolVal !== null ? boolVal : value;
  const keys = key.split('.');
  let target = settings[user];
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]] || typeof target[keys[i]] !== 'object') target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = parsed;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  console.log(`  ${green('✓')} ${user}: ${key} = ${JSON.stringify(parsed)}`);
}

function cmdMemory(user) {
  const bank = readJSON(MEMORY_BANK_FILE);
  if (!bank) { console.log(`  ${red('cannot read memory_bank.json')}`); return; }
  const um = bank[user];
  if (!um) { console.log(`  ${yellow('no memory for')} ${user}`); return; }
  for (const [category, items] of Object.entries(um)) {
    console.log(`\n  ${cyan(category)}`);
    if (Array.isArray(items)) items.forEach(item => console.log(`    ${dim('•')} ${item}`));
    else console.log(`    ${JSON.stringify(items, null, 2).split('\n').join('\n    ')}`);
  }
}

function cmdMemorySearch(query) {
  const bank = readJSON(MEMORY_BANK_FILE);
  if (!bank) { console.log(`  ${red('cannot read memory_bank.json')}`); return; }
  const q = query.toLowerCase();
  let found = false;
  for (const [uid, categories] of Object.entries(bank)) {
    if (uid === '_description') continue;
    for (const [cat, items] of Object.entries(categories)) {
      if (Array.isArray(items)) items.forEach(item => {
        if (item.toLowerCase().includes(q)) {
          if (!found) found = true;
          console.log(`  ${cyan(uid)} ${dim(cat)} ${dim('•')} ${item}`);
        }
      });
    }
  }
  if (!found) console.log(`  ${yellow('no results for')} "${query}"`);
}

function cmdPersona() {
  if (!fs.existsSync(PERSONA_DIR)) { console.log(`  ${red('Personas folder not found')}`); return; }
  const files = fs.readdirSync(PERSONA_DIR).filter(f => f.endsWith('.txt'));
  for (const file of files) {
    const stats = fs.statSync(path.join(PERSONA_DIR, file));
    const name = file.replace('.txt', '').replace('stella_', '');
    console.log(`  ${cyan(name)}${dim('  ' + (stats.size / 1024).toFixed(1) + ' KB')}`);
  }
}

function cmdPersonaSwitch(name, options) {
  const validPersonas = fs.readdirSync(PERSONA_DIR).map(f => f.replace('.txt', ''));
  const personaKey = `stella_${name}`;
  const match = validPersonas.find(p => p === personaKey || p === name);
  const finalKey = match && match.startsWith('stella_') ? match : personaKey;
  if (!match) {
    console.log(`  ${red('persona not found:')} ${name}`);
    console.log(`  ${dim('available:')} ${validPersonas.map(p => p.replace('stella_', '')).join(', ')}`);
    return;
  }
  const settings = readJSON(SETTINGS_FILE);
  if (!settings) { console.log(`  ${red('cannot read settings.json')}`); return; }
  if (options?.user) {
    if (!settings[options.user]) { console.log(`  ${yellow('user not found:')} ${options.user}`); return; }
    settings[options.user].personality = finalKey;
  } else {
    for (const [uid, data] of Object.entries(settings)) {
      if (uid === '_description') continue;
      data.personality = finalKey;
    }
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  const target = options?.user || 'all users';
  console.log(`  ${green('✓')} persona ${cyan(finalKey)} → ${target}`);
}

function cmdLog(options) {
  if (!fs.existsSync(LOG_FILE)) { console.log(`  ${red('log file not found')}`); return; }
  const lines = parseInt(options?.lines) || 20;
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  const allLines = content.split('\n').filter(Boolean);
  const tail = allLines.slice(-lines);
  tail.forEach(line => console.log(`  ${line}`));
  if (options?.follow) {
    let lastSize = fs.statSync(LOG_FILE).size;
    setInterval(() => {
      try {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > lastSize) {
          const newData = fs.readFileSync(LOG_FILE, 'utf8');
          newData.slice(lastSize).split('\n').filter(Boolean).forEach(l => console.log(`  ${l}`));
          lastSize = stats.size;
        }
      } catch {}
    }, 1000);
  }
}

// ── Commander Commands ──
program.name('stella').description('CLI untuk ngontrol bot Telegram Stella').version('1.0.0');

program.command('status').description('Status bot').action(cmdStatus);
program.command('stats').description('Statistik bot').action(cmdStats);
program.command('settings').description('Settings user').argument('[user]', 'User ID').action((user) => cmdSettings(user));
program.command('settings-set').description('Ubah setting').argument('<user>').argument('<key>').argument('<value>').action(cmdSettingsSet);
program.command('memory').description('Memory user').argument('<user>').action(cmdMemory);
program.command('memory-search').description('Cari memory').argument('<query>').action(cmdMemorySearch);
program.command('persona').description('Daftar persona').action(cmdPersona);
program.command('persona-switch').description('Ganti persona').argument('<name>').option('-u, --user <id>', 'User ID').action((name, opts) => cmdPersonaSwitch(name, opts));
program.command('log').description('Log bot').option('-n, --lines <number>', 'Jumlah baris', '20').option('-f, --follow', 'Ikuti').action(cmdLog);

// ── REPL Mode ──
program.command('repl').description('Mode interaktif').action(startREPL);

function startREPL() {
  const readline = require('readline');

  process.stdout.write('\x1b[2J\x1b[0f');
  console.log('');
  console.log(`  ${cyan('Stella Control Panel')}  ${dim('v1.0.0')}`);
  console.log(`  ${dim('type / for commands or /help')}`);
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${cyan('>')} `,
    terminal: true,
    historySize: 100,
    removeHistoryDuplicates: true
  });
  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/':
      case '/help':
      case '/?':
        console.log(`  ${cyan('available commands:')}`);
        console.log(`    ${cyan('/status')}       ${dim('- bot status')}`);
        console.log(`    ${cyan('/stats')}        ${dim('- statistics')}`);
        console.log(`    ${cyan('/settings')}     ${dim('- all user settings')}`);
        console.log(`    ${cyan('/settings <id>')}${dim('  - user settings')}`);
        console.log(`    ${cyan('/set <id> <k>')}  ${dim('- set setting')}`);
        console.log(`    ${cyan('/memory <id>')}   ${dim('- user memory')}`);
        console.log(`    ${cyan('/ms <q>')}        ${dim('- search memory')}`);
        console.log(`    ${cyan('/persona')}       ${dim('- list personas')}`);
        console.log(`    ${cyan('/persona-switch')} ${dim('- switch persona')}`);
        console.log(`    ${cyan('/log [-n]')}      ${dim('- show log')}`);
        console.log(`    ${cyan('/log -f')}        ${dim('- follow log')}`);
        console.log(`    ${cyan('/clear')}         ${dim('- clear screen')}`);
        console.log(`    ${cyan('/exit')}          ${dim('- quit')}`);
        break;
      case '/status': cmdStatus(); break;
      case '/stats': cmdStats(); break;
      case '/settings': args.length ? cmdSettings(args[0]) : cmdSettings(); break;
      case '/set':
        if (args.length < 3) console.log(`  ${yellow('usage: /set <user> <key> <value>')}`);
        else cmdSettingsSet(args[0], args[1], args.slice(2).join(' '));
        break;
      case '/memory':
        args.length ? cmdMemory(args[0]) : console.log(`  ${yellow('usage: /memory <user>')}`);
        break;
      case '/ms':
        args.length ? cmdMemorySearch(args.join(' ')) : console.log(`  ${yellow('usage: /ms <query>')}`);
        break;
      case '/persona': cmdPersona(); break;
      case '/persona-switch':
        args.length ? cmdPersonaSwitch(args[0], {}) : console.log(`  ${yellow('usage: /persona-switch <name>')}`);
        break;
      case '/log': cmdLog({ lines: args.includes('-n') && args[args.indexOf('-n') + 1] || '20', follow: args.includes('-f') }); break;
      case '/clear': process.stdout.write('\x1b[2J\x1b[0f'); break;
      case '/exit': case '/quit': rl.close(); break;
      default: console.log(`  ${red('unknown:')} ${cmd}    ${dim('/')}`);
    }
    rl.prompt();
  });
  rl.on('close', () => { console.log(''); process.exit(0); });
}

// ── Run ──
if (process.argv.includes('--repl') || process.argv.includes('-i') || process.argv[2] === 'repl') {
  startREPL();
} else {
  program.parse(process.argv);
  if (!process.argv.slice(2).length) {
    console.log(`  ${dim('Stella CLI — type "node cli.js repl" for interactive mode')}`);
    console.log(`  ${dim('or "node cli.js --help" for all commands')}\n`);
  }
}
