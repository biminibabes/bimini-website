// Talks to the `claude` command-line tool the user already has installed.
// Each message you send is one `claude -p` run; follow-ups pass --resume so
// Claude keeps the whole conversation.

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Apps opened from the Dock don't get the PATH your terminal has, so ask the
// login shell for it once. Falls back to the usual Mac install spots.
let cachedPath = null;
function loginPath() {
  if (cachedPath) return cachedPath;
  const h = os.homedir();
  const extra = [
    path.join(h, '.local/bin'),
    path.join(h, '.claude/local'),
    path.join(h, '.npm-global/bin'),
    path.join(h, '.volta/bin'),
    path.join(h, '.bun/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...nvmBins(h),
  ];
  let shellPath = '';
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const out = execFileSync(shell, ['-ilc', 'echo "__P__$PATH__P__"'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/__P__(.*)__P__/);
    if (m) shellPath = m[1];
  } catch { /* use fallbacks */ }
  const parts = [...shellPath.split(':'), ...(process.env.PATH || '').split(':'), ...extra];
  cachedPath = [...new Set(parts.filter(Boolean))].join(':');
  return cachedPath;
}

// Node installed with nvm keeps each version in its own folder; newest first.
function nvmBins(h) {
  const dir = path.join(h, '.nvm/versions/node');
  try {
    return fs.readdirSync(dir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(v => path.join(dir, v, 'bin'));
  } catch { return []; }
}

const isRunnable = p => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; } };

// `preferred` is a location you picked yourself in the app; it wins if it still works.
function findClaude(preferred) {
  if (preferred && isRunnable(preferred)) return preferred;
  for (const dir of loginPath().split(':')) {
    const p = path.join(dir, 'claude');
    if (isRunnable(p)) return p;
  }
  return null;
}

// Claude installed through npm needs `node`, which usually sits right next to it.
const envFor = bin => ({ ...process.env, PATH: [path.dirname(bin), loginPath()].join(':') });

function claudeVersion(bin) {
  try {
    return execFileSync(bin, ['--version'], {
      encoding: 'utf8', timeout: 10000, env: envFor(bin),
    }).trim();
  } catch { return null; }
}

// Build the argument list for one turn.
// mode: 'manual' (asks = blocked, you approve after), 'acceptEdits', or 'plan'.
function buildArgs({ sessionId, mode, allowedTools }) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  if (sessionId) args.push('--resume', sessionId);
  if (mode) args.push('--permission-mode', mode);
  if (allowedTools && allowedTools.length) args.push('--allowedTools', ...allowedTools);
  return args;
}

// Turn one line of Claude's stream into the small events the window cares about.
function toEvents(msg) {
  const out = [];
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') out.push({ kind: 'init', sessionId: msg.session_id, model: msg.model });
      break;
    case 'assistant':
      for (const c of msg.message?.content || []) {
        if (c.type === 'text' && c.text.trim()) out.push({ kind: 'text', text: c.text });
        if (c.type === 'tool_use') out.push({ kind: 'tool', name: c.name, summary: summarizeTool(c.name, c.input) });
      }
      break;
    case 'rate_limit_event': {
      // Not documented by Anthropic; read defensively and skip if the shape changes.
      const w = msg.rate_limit_info?.unifiedWindows;
      if (w) out.push({
        kind: 'usage',
        fiveHour: w.five_hour ? { pct: Math.round(w.five_hour.utilization * 100), resetsAt: w.five_hour.resetsAt } : null,
        week: w.seven_day ? { pct: Math.round(w.seven_day.utilization * 100), resetsAt: w.seven_day.resetsAt } : null,
      });
      break;
    }
    case 'result':
      out.push({
        kind: 'done',
        sessionId: msg.session_id,
        isError: !!msg.is_error,
        errorText: msg.is_error ? (msg.result || msg.subtype) : null,
        blocked: (msg.permission_denials || []).map(d => ({
          tool: d.tool_name,
          summary: summarizeTool(d.tool_name, d.tool_input),
          rule: allowRule(d.tool_name, d.tool_input),
        })),
      });
      break;
  }
  return out;
}

function summarizeTool(name, input = {}) {
  const s = rawSummary(name, input);
  return s.length > 160 ? s.slice(0, 157) + '…' : s;
}

function rawSummary(name, input) {
  if (name === 'Bash') return String(input.command || '').replace(/\s+/g, ' ').trim();
  if (input.file_path) return path.basename(input.file_path);
  if (input.pattern) return input.pattern;
  if (input.url) return input.url;
  if (input.description) return input.description;
  return '';
}

// The narrowest rule that lets exactly this action through next time.
function allowRule(name, input = {}) {
  if (name === 'Bash' && input.command) return `Bash(${input.command})`;
  return name;
}

// Run one turn. Returns a handle with stop(). Calls onEvent for each event.
function runTurn({ bin, cwd, text, sessionId, mode, allowedTools }, onEvent) {
  const child = spawn(bin, buildArgs({ sessionId, mode, allowedTools }), {
    cwd, env: envFor(bin),
  });
  let buf = '', errBuf = '', finished = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      for (const ev of toEvents(msg)) {
        if (ev.kind === 'done') finished = true;
        onEvent(ev);
      }
    }
  });
  child.stderr.on('data', c => { errBuf = (errBuf + c).slice(-4000); });
  child.on('error', err => { finished = true; onEvent({ kind: 'done', isError: true, errorText: err.message, blocked: [] }); });
  child.on('close', code => {
    if (!finished) onEvent({ kind: 'done', isError: true, errorText: errBuf.trim() || `Claude stopped (exit code ${code}).`, blocked: [] });
  });

  child.stdin.end(text);
  return { stop: () => child.kill('SIGINT') };
}

module.exports = { loginPath, findClaude, claudeVersion, buildArgs, toEvents, runTurn, allowRule };
