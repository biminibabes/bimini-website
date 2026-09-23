(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const base = p => String(p).split('/').filter(Boolean).pop() || p;
  const home = p => String(p).replace(/^\/Users\/[^/]+/, '~');

  const ago = ms => {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24);
    return d < 14 ? d + ' days ago' : new Date(ms).toLocaleDateString();
  };

  // ---------- API: real inside the app, example data anywhere else ----------
  const api = window.bimini || demoApi();
  const isDemo = !window.bimini;

  // ---------- state ----------
  let data = { sessions: [], projects: [] };
  const flyers = new Map(); // key -> flyer opened in this app run
  let current = null;       // key of flyer on screen
  let keySeq = 1;

  const STATUS = {
    idle:    ['idle', 'idle'],
    working: ['live', 'working'],
    blocked: ['needs', 'needs you'],
    done:    ['done', 'done'],
    error:   ['err', 'problem'],
  };

  // ---------- VU meters ----------
  function vu(id, pct) {
    const el = $(id); el.innerHTML = '';
    const lit = pct == null ? 0 : Math.round(pct / 100 * 16);
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('i');
      if (i < lit) b.className = 'on' + (i >= 13 ? ' red' : i >= 10 ? ' hot' : '');
      el.appendChild(b);
    }
  }
  function setUsage(u) {
    const fmt = t => new Date(t * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    for (const [key, vuId, pctId] of [['fiveHour', 'vu-5h', 'pct-5h'], ['week', 'vu-wk', 'pct-wk']]) {
      const w = u && u[key];
      vu(vuId, w ? w.pct : null);
      const p = $(pctId);
      p.textContent = w ? w.pct + '%' : '?';
      p.classList.toggle('unknown', !w);
      p.style.color = w && w.pct >= 80 ? 'var(--pink)' : '';
    }
    const note = $('meter-note');
    if (!u || (!u.fiveHour && !u.week)) { note.textContent = 'Claude didn\'t report levels this time.'; return; }
    const hot = [u.week, u.fiveHour].find(w => w && w.pct >= 80);
    note.innerHTML = hot
      ? `<b>${hot === u.week ? 'Weekly' : '5-hour'} limit almost used.</b> Resets ${esc(fmt(hot.resetsAt))}.`
      : `5-hour window resets ${esc(fmt((u.fiveHour || u.week).resetsAt))}.`;
  }
  vu('vu-5h', null); vu('vu-wk', null);

  // ---------- greeting + status ----------
  const h = new Date().getHours();
  $('greet').textContent = h < 5 ? 'up late, bimini —' : h < 12 ? 'good morning, bimini —' : h < 18 ? 'good afternoon, bimini —' : 'good evening, bimini —';

  async function loadStatus() {
    const s = await api.status();
    const el = $('status');
    if (s.found) {
      el.classList.remove('bad');
      el.innerHTML = `<span class="ok">✓ READY</span> ${esc(s.version || 'Claude Code')} at <span>${esc(home(s.path))}</span>`;
    } else {
      el.classList.add('bad');
      el.innerHTML = `<span class="ok">✗ NOT FOUND</span> Install Claude Code first. <a href="https://code.claude.com/docs" target="_blank" rel="noopener">Install guide</a> <button class="btn small ghost" type="button" id="recheck">CHECK AGAIN</button>`;
      $('recheck').onclick = loadStatus;
    }
    if (isDemo) $('demo-tag').hidden = false;
  }

  // ---------- home screen ----------
  async function refresh() {
    try { data = await api.listSessions(); } catch { data = { sessions: [], projects: [] }; }
    renderHome();
  }

  function renderHome() {
    // crate: recent projects
    const crate = $('crate');
    crate.innerHTML = data.projects.length ? '' : '<div class="track"><span class="no">--</span><div><div class="name">No projects yet</div><div class="path">Start a new flyer and it lands here.</div></div></div>';
    data.projects.slice(0, 6).forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'track';
      row.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span>
        <div><div class="name">${esc(p.name)}</div><div class="path">${esc(home(p.cwd))}</div></div>
        <div class="right"><span class="ago">${ago(p.updatedAt)}</span>
          <div class="links"><button type="button" data-a="new">new flyer</button><button type="button" data-a="continue">continue</button></div></div>`;
      row.querySelector('[data-a=new]').onclick = () => newFlyer(p.cwd);
      row.querySelector('[data-a=continue]').onclick = () => openSaved(data.sessions.find(s => s.id === p.lastSessionId));
      crate.appendChild(row);
    });

    // wall: recent sessions
    const wall = $('pinned');
    wall.innerHTML = data.sessions.length ? '' : '<p class="wall-empty">Nothing on the wall yet.</p>';
    data.sessions.slice(0, 6).forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `flyer mini c${i % 4}`;
      b.innerHTML = `<span class="tape"></span><h3>${esc(s.title)}</h3><p>${esc(base(s.cwd))} · ${ago(s.updatedAt)}</p>`;
      b.onclick = () => openSaved(s);
      wall.appendChild(b);
    });

    // sidebar projects
    const sp = $('side-projects');
    sp.innerHTML = data.projects.length ? '' : '<li><p class="side-empty">none yet</p></li>';
    data.projects.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" title="New flyer in ${esc(p.cwd)}"><span class="t">${esc(p.name)}</span><span class="when">${p.count} · ${ago(p.updatedAt).replace(' ago', '')}</span></button>`;
      li.firstChild.onclick = () => newFlyer(p.cwd);
      sp.appendChild(li);
    });

    // resume last
    const last = data.sessions[0];
    $('resume-last').disabled = !last;
    $('resume-sub').textContent = last ? `${base(last.cwd)} · ${ago(last.updatedAt)}` : 'nothing yet';

    renderSetlist();
  }

  function renderSetlist() {
    const ul = $('setlist');
    ul.innerHTML = flyers.size ? '' : '<li><p class="side-empty">No flyers open yet tonight.</p></li>';
    [...flyers.values()].reverse().forEach(f => {
      const [cls, label] = STATUS[f.status];
      const li = document.createElement('li');
      li.innerHTML = `<button type="button"><span class="t">${esc(f.title)}</span><span class="pill ${cls}">${label}</span><span class="m">${esc(base(f.cwd))}</span></button>`;
      li.firstChild.onclick = () => show(f.key);
      ul.appendChild(li);
    });
  }

  // ---------- flyers ----------
  function makeFlyer({ cwd, sessionId = null, title = 'New flyer', log = [] }) {
    const f = { key: keySeq++, cwd, sessionId, title, log, status: 'idle', mode: 'manual', allowed: [], blocked: [], runId: null };
    flyers.set(f.key, f);
    return f;
  }

  async function newFlyer(cwd) {
    if (!cwd) cwd = await api.pickFolder();
    if (!cwd) return;
    const f = makeFlyer({ cwd, title: 'New flyer' });
    show(f.key);
  }

  async function openSaved(s) {
    if (!s) return;
    const open = [...flyers.values()].find(f => f.sessionId === s.id);
    if (open) return show(open.key);
    const f = makeFlyer({ cwd: s.cwd, sessionId: s.id, title: s.title });
    f.log = [{ role: 'sys', text: 'Loading the conversation…' }];
    show(f.key);
    try { f.log = await api.loadTranscript(s.id); } catch { f.log = []; }
    f.log.push({ role: 'sys', text: 'Picked up where you left off. Keep going below.' });
    if (current === f.key) renderSession();
  }

  function show(key) {
    current = key;
    $('home').style.display = 'none';
    $('session').hidden = false;
    renderSession();
    renderSetlist();
    window.scrollTo(0, 0);
    $('msg').focus({ preventScroll: true });
  }

  function goHome() {
    current = null;
    $('session').hidden = true;
    $('home').style.display = 'grid';
    refresh();
  }

  function renderSession() {
    const f = flyers.get(current);
    if (!f) return;
    $('s-title').textContent = f.title;
    $('s-meta').innerHTML = f.status === 'working'
      ? '<span class="working">claude is working…</span>'
      : esc(STATUS[f.status][1]);
    $('s-folder').textContent = home(f.cwd);
    $('mode').value = f.mode;

    const log = $('log');
    log.innerHTML = '';
    if (!f.log.length) log.innerHTML = '<div class="msg claude"><div class="who">claude</div><div class="bubble">Blank flyer. What are we making?</div></div>';
    for (const m of f.log) {
      const d = document.createElement('div');
      if (m.role === 'tool') {
        d.className = 'msg tool';
        d.innerHTML = `<b>${esc(m.name)}</b><span>${esc(m.summary || '')}</span>`;
      } else {
        d.className = 'msg ' + m.role;
        const who = m.role === 'you' ? 'you' : m.role === 'sys' ? 'studio' : 'claude';
        d.innerHTML = `<div class="who">${who}</div><div class="bubble">${esc(m.text).replace(/`([^`\n]+)`/g, '<code>$1</code>')}</div>`;
      }
      log.appendChild(d);
    }
    log.scrollTop = log.scrollHeight;

    // blocked actions
    const bl = $('blocked');
    bl.hidden = !(f.status === 'blocked' && f.blocked.length);
    if (!bl.hidden) {
      bl.innerHTML = `<h3>CLAUDE NEEDS YOUR OK</h3>
        <p>It tried to do ${f.blocked.length === 1 ? 'this' : 'these'} and was stopped:</p>
        <ul>${f.blocked.map(b => `<li><b>${esc(b.tool)}</b> ${esc(b.summary)}</li>`).join('')}</ul>
        <div class="row"><button class="btn small" type="button" id="allow">ALLOW &amp; CONTINUE</button>
        <button class="btn small ghost" type="button" id="deny">NO, SKIP IT</button></div>`;
      $('allow').onclick = () => {
        f.allowed.push(...f.blocked.map(b => b.rule));
        f.blocked = [];
        send(f, 'I approved that. Go ahead and continue.');
      };
      $('deny').onclick = () => { f.blocked = []; f.status = 'done'; renderSession(); renderSetlist(); };
    }

    const busy = f.status === 'working';
    $('msg').disabled = busy;
    $('send').textContent = busy ? 'STOP' : 'SEND';
    $('send').type = busy ? 'button' : 'submit';
    $('send').onclick = busy ? () => api.stop(f.runId) : null;
    $('mode').disabled = busy;
  }

  async function send(f, text) {
    f.log.push({ role: 'you', text });
    if (f.title === 'New flyer') f.title = text.split('\n')[0].slice(0, 40);
    f.status = 'working';
    renderSession(); renderSetlist();
    f.runId = `r${f.key}-${Date.now()}`;
    try {
      await api.send({ runId: f.runId, cwd: f.cwd, text, sessionId: f.sessionId, mode: f.mode, allowedTools: f.allowed });
    } catch (err) {
      f.runId = null;
      f.status = 'error';
      f.log.push({ role: 'sys', text: String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
      renderSession(); renderSetlist();
    }
  }

  api.onEvent(ev => {
    if (ev.kind === 'usage') return setUsage(ev);
    const f = [...flyers.values()].find(x => x.runId === ev.runId);
    if (!f) return;
    if (ev.kind === 'init' && ev.sessionId) f.sessionId = ev.sessionId;
    if (ev.kind === 'text') f.log.push({ role: 'claude', text: ev.text });
    if (ev.kind === 'tool') f.log.push({ role: 'tool', name: ev.name, summary: ev.summary });
    if (ev.kind === 'done') {
      if (ev.sessionId) f.sessionId = ev.sessionId;
      f.runId = null;
      f.blocked = ev.blocked || [];
      if (ev.isError) { f.status = 'error'; f.log.push({ role: 'sys', text: ev.errorText || 'Something went wrong.' }); }
      else f.status = f.blocked.length ? 'blocked' : 'done';
    }
    if (f.key === current) renderSession();
    renderSetlist();
  });

  // ---------- controls ----------
  $('side-new').onclick = () => newFlyer();
  $('hero-new').onclick = () => newFlyer();
  $('resume-last').onclick = () => openSaved(data.sessions[0]);
  $('back').onclick = goHome;
  $('mode').onchange = e => { const f = flyers.get(current); if (f) f.mode = e.target.value; };

  $('composer').addEventListener('submit', e => {
    e.preventDefault();
    const f = flyers.get(current);
    const text = $('msg').value.trim();
    if (!f || !text || f.status === 'working') return;
    $('msg').value = '';
    f.blocked = [];
    send(f, text);
  });
  $('msg').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('composer').requestSubmit(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && current !== null) goHome();
    if (isDemo && (e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); newFlyer(); }
  });
  api.onMenu(action => {
    if (action === 'new' || action === 'open-folder') newFlyer();
    if (action === 'home') goHome();
  });

  loadStatus();
  refresh();

  // ---------- example data for the browser preview ----------
  function demoApi() {
    const now = Date.now(), min = 60000;
    const sessions = [
      { id: 'd1', title: 'Tour dates page', cwd: '/Users/bimini/code/bimini-website', updatedAt: now - 6 * min },
      { id: 'd2', title: 'Laylo signup fix', cwd: '/Users/bimini/code/bimini-website', updatedAt: now - 90 * min },
      { id: 'd3', title: 'One-sheet for the fall run', cwd: '/Users/bimini/Documents/press-kit', updatedAt: now - 2 * 1440 * min },
      { id: 'd4', title: 'Setlist BPM sorter', cwd: '/Users/bimini/code/setlist-tools', updatedAt: now - 7 * 1440 * min },
    ];
    const projects = [
      { cwd: '/Users/bimini/code/bimini-website', name: 'bimini-website', count: 2, updatedAt: now - 6 * min, lastSessionId: 'd1' },
      { cwd: '/Users/bimini/Documents/press-kit', name: 'press-kit', count: 1, updatedAt: now - 2 * 1440 * min, lastSessionId: 'd3' },
      { cwd: '/Users/bimini/code/setlist-tools', name: 'setlist-tools', count: 1, updatedAt: now - 7 * 1440 * min, lastSessionId: 'd4' },
    ];
    let handler = () => {};
    return {
      status: async () => ({ found: true, path: '/Users/bimini/.local/bin/claude', version: 'Claude Code (preview)' }),
      listSessions: async () => ({ sessions, projects }),
      loadTranscript: async () => [
        { role: 'you', text: 'Add the fall tour dates to the site with ticket links.' },
        { role: 'tool', name: 'Edit', summary: 'index.html' },
        { role: 'claude', text: 'Added a tour section to `index.html` with a ticket button on each date.' },
      ],
      pickFolder: async () => '/Users/bimini/code/bimini-website',
      send: async ({ runId: id }) => {
        setTimeout(() => handler({ runId: id, kind: 'tool', name: 'Read', summary: 'index.html' }), 500);
        setTimeout(() => handler({ runId: id, kind: 'usage', fiveHour: { pct: 42, resetsAt: now / 1000 + 7200 }, week: { pct: 91, resetsAt: now / 1000 + 3 * 86400 } }), 700);
        setTimeout(() => handler({ runId: id, kind: 'text', text: 'This is the preview, so nothing actually ran. In the app, Claude\'s real reply shows up here.' }), 1200);
        setTimeout(() => handler({ runId: id, kind: 'done', blocked: [{ tool: 'Bash', summary: 'npm run build', rule: 'Bash(npm run build)' }] }), 1400);
        return id;
      },
      stop: async () => {},
      onEvent: fn => { handler = fn; },
      onMenu: () => {},
    };
  }
})();
