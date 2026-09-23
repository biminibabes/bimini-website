// Reads your past Claude Code sessions from ~/.claude/projects.
// Anthropic documents where these files live, but not what's inside them, so
// everything here is read defensively: a line we don't understand is skipped.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(os.homedir(), '.claude', 'projects');

function eachLine(file, fn) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    rl.on('line', fn);
    rl.on('close', resolve);
    rl.on('error', resolve);
  });
}

function userText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(c => c.type === 'text').map(c => c.text).join('\n');
}

// Messages Claude Code adds on its own (command wrappers, reminders) start with a tag.
const isNoise = t => !t.trim() || /^\s*<[a-z-]+[\s>]/i.test(t);

async function readSummary(file) {
  const s = { id: path.basename(file, '.jsonl'), file, title: null, firstPrompt: null, cwd: null, updatedAt: null };
  await eachLine(file, line => {
    // Cheap checks first: some lines carry whole images.
    if (line.includes('"ai-title"') || line.includes('"custom-title"')) {
      try { const d = JSON.parse(line); s.title = d.customTitle || d.aiTitle || d.title || s.title; } catch {}
      return;
    }
    if (!s.cwd && line.includes('"cwd"')) {
      try { const d = JSON.parse(line); s.cwd = d.cwd || null; } catch {}
    }
    if (!s.firstPrompt && line.includes('"type":"user"') && line.length < 200000) {
      try {
        const d = JSON.parse(line);
        if (!d.isMeta && !d.isSidechain) {
          const t = userText(d.message?.content);
          if (!isNoise(t)) s.firstPrompt = t.trim().slice(0, 140);
        }
      } catch {}
    }
  });
  s.updatedAt = fs.statSync(file).mtimeMs;
  if (!s.title) s.title = s.firstPrompt ? s.firstPrompt.slice(0, 48) : 'untitled flyer';
  return s;
}

// Newest first. `limit` keeps startup fast for people with hundreds of sessions.
async function listSessions(limit = 60) {
  let dirs = [];
  try { dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return []; }
  const files = [];
  for (const d of dirs) {
    const dir = path.join(ROOT, d.name);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const full = path.join(dir, f);
      try { files.push({ full, mtime: fs.statSync(full).mtimeMs }); } catch {}
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const out = [];
  for (const f of files.slice(0, limit)) {
    try {
      const s = await readSummary(f.full);
      if (s.cwd && s.firstPrompt) out.push(s);
    } catch {}
  }
  return out;
}

// Group sessions into projects (one per folder).
function projectsFrom(sessions) {
  const map = new Map();
  for (const s of sessions) {
    const p = map.get(s.cwd) || { cwd: s.cwd, name: path.basename(s.cwd), count: 0, updatedAt: 0, lastSessionId: null };
    p.count++;
    if (s.updatedAt > p.updatedAt) { p.updatedAt = s.updatedAt; p.lastSessionId = s.id; }
    map.set(s.cwd, p);
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

// The conversation as the window shows it: your messages, Claude's words, and the tools it used.
async function loadTranscript(id) {
  const file = findFile(id);
  if (!file) return [];
  const msgs = [];
  await eachLine(file, line => {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) return;
    let d; try { d = JSON.parse(line); } catch { return; }
    if (d.isSidechain || d.isMeta) return;
    if (d.type === 'user') {
      const t = userText(d.message?.content);
      if (!isNoise(t)) msgs.push({ role: 'you', text: t });
    } else if (d.type === 'assistant') {
      for (const c of d.message?.content || []) {
        if (c.type === 'text' && c.text.trim()) msgs.push({ role: 'claude', text: c.text });
        if (c.type === 'tool_use') {
          const sum = String(c.input?.command || (c.input?.file_path && path.basename(c.input.file_path)) || '').replace(/\s+/g, ' ').trim();
          msgs.push({ role: 'tool', name: c.name, summary: sum.length > 160 ? sum.slice(0, 157) + '…' : sum });
        }
      }
    }
  });
  return msgs;
}

function findFile(id) {
  if (!/^[\w-]+$/.test(id)) return null;
  let dirs = [];
  try { dirs = fs.readdirSync(ROOT); } catch { return null; }
  for (const d of dirs) {
    const f = path.join(ROOT, d, id + '.jsonl');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

module.exports = { ROOT, listSessions, projectsFrom, loadTranscript, readSummary };
