const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the session reader at a fake home folder before loading it.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bimini-home-'));
process.env.HOME = fakeHome;
const claude = require('../lib/claude');
const sessions = require('../lib/sessions');

test('builds a resume run with house rules and approvals', () => {
  assert.deepStrictEqual(
    claude.buildArgs({ sessionId: 'abc', mode: 'acceptEdits', allowedTools: ['Bash(npm test)'] }),
    ['-p', '--output-format', 'stream-json', '--verbose', '--resume', 'abc', '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(npm test)'],
  );
  assert.deepStrictEqual(claude.buildArgs({}), ['-p', '--output-format', 'stream-json', '--verbose']);
});

test('turns stream lines into window events', () => {
  assert.deepStrictEqual(claude.toEvents({ type: 'system', subtype: 'init', session_id: 's1', model: 'm' }),
    [{ kind: 'init', sessionId: 's1', model: 'm' }]);
  assert.deepStrictEqual(claude.toEvents({ type: 'assistant', message: { content: [
    { type: 'text', text: 'hi' },
    { type: 'tool_use', name: 'Edit', input: { file_path: '/a/b/index.html' } },
  ] } }), [{ kind: 'text', text: 'hi' }, { kind: 'tool', name: 'Edit', summary: 'index.html' }]);
});

test('reads usage levels and skips them if the shape changes', () => {
  const [ev] = claude.toEvents({ type: 'rate_limit_event', rate_limit_info: { unifiedWindows: {
    five_hour: { utilization: 0.08, resetsAt: 100 }, seven_day: { utilization: 0.554, resetsAt: 200 } } } });
  assert.deepStrictEqual(ev, { kind: 'usage', fiveHour: { pct: 8, resetsAt: 100 }, week: { pct: 55, resetsAt: 200 } });
  assert.deepStrictEqual(claude.toEvents({ type: 'rate_limit_event', rate_limit_info: {} }), []);
});

test('reports blocked actions with a narrow allow rule', () => {
  const [ev] = claude.toEvents({ type: 'result', session_id: 's1', is_error: false, permission_denials: [
    { tool_name: 'Bash', tool_input: { command: 'rm a.txt' } },
    { tool_name: 'Write', tool_input: { file_path: '/x/y.txt' } },
  ] });
  assert.strictEqual(ev.kind, 'done');
  assert.deepStrictEqual(ev.blocked, [
    { tool: 'Bash', summary: 'rm a.txt', rule: 'Bash(rm a.txt)' },
    { tool: 'Write', summary: 'y.txt', rule: 'Write' },
  ]);
});

test('lists sessions, groups projects, loads a transcript', async () => {
  const dir = path.join(fakeHome, '.claude', 'projects', '-Users-bimini-code-site');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    { type: 'user', cwd: '/Users/bimini/code/site', isMeta: true, message: { role: 'user', content: '<command-name>/init</command-name>' } },
    { type: 'user', cwd: '/Users/bimini/code/site', message: { role: 'user', content: 'Add tour dates' } },
    { type: 'assistant', cwd: '/Users/bimini/code/site', message: { content: [
      { type: 'tool_use', name: 'Edit', input: { file_path: '/Users/bimini/code/site/index.html' } },
      { type: 'text', text: 'Done.' },
    ] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } },
    { type: 'ai-title', aiTitle: 'Tour dates page' },
    'not json at all',
  ];
  fs.writeFileSync(path.join(dir, 'sess-1.jsonl'), lines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n'));
  fs.writeFileSync(path.join(dir, 'empty.jsonl'), '');

  const list = await sessions.listSessions();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].title, 'Tour dates page');
  assert.strictEqual(list[0].cwd, '/Users/bimini/code/site');
  assert.strictEqual(list[0].firstPrompt, 'Add tour dates');

  const projects = sessions.projectsFrom(list);
  assert.deepStrictEqual(projects.map(p => [p.name, p.count, p.lastSessionId]), [['site', 1, 'sess-1']]);

  assert.deepStrictEqual(await sessions.loadTranscript('sess-1'), [
    { role: 'you', text: 'Add tour dates' },
    { role: 'tool', name: 'Edit', summary: 'index.html' },
    { role: 'claude', text: 'Done.' },
  ]);
  assert.deepStrictEqual(await sessions.loadTranscript('../../etc/passwd'), []);
});
