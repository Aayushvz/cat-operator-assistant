/* Cat Operator Assistant: connection to the backend (backend/main.py).
 *
 * Optional layer on top of app.js. With the backend running:
 *   - job times come from the trained model, and learn from every job marked Done
 *   - habits are rated by the trained classifier
 *   - reports and added jobs are saved in the database; "No signal" really queues and sends
 *   - the machine remote (backend /remote) moves the machine, takes the belt off, walks a worker in
 *   - the fleet view's log shows the cab's reports and finished jobs
 * Without it, nothing here runs and the app works exactly as before.
 *
 * Backend address: port 8000 on the same computer when the app runs locally.
 * On any other host (e.g. GitHub Pages) it stays off unless the page is opened once with
 * ?api=https://your-backend (remembered). ?api=off turns it off.
 */
(() => {
  const A = window.APP;
  if (!A) return;
  const { S, D, $ } = A;

  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  let API = local ? `http://${location.hostname || 'localhost'}:8000` : null;
  const q = new URLSearchParams(location.search).get('api');
  try {
    if (q) localStorage.setItem('cat-api', q);
    API = localStorage.getItem('cat-api') || API;
  } catch (e) { if (q) API = q; }
  if (!API || API === 'off') return;
  API = API.replace(/\/$/, '');

  const L = (window.LIVE = { connected: false });
  const OP = D.operator.id, MACHINE = 'EXC001';
  const clock = () => ($('#clock') ? $('#clock').textContent : '');
  const here = () => (S.routeArg ? `${S.route}/${S.routeArg}` : S.route);
  const refresh = (...routes) => { if (routes.includes(S.route)) A.go(here()); };

  async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
    const r = await fetch(API + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }
  L.api = api;

  /* =========================================================
     JOB TIME: trained model, looked up from a grid so the screen stays instant
     ========================================================= */
  const formula = D.predict;
  let G = null, factor = 1;

  function ratio(which, planned, skill, weather, age) {
    if (!G) return null;
    const si = G.skills.indexOf(skill), wi = G.weathers.indexOf(weather);
    if (si < 0 || wi < 0) return null;
    const ai = Math.max(0, Math.min(G.ages.length - 1, Math.round(age)));
    const row = G[which][si][wi][ai], P = G.planned;
    if (planned <= P[0]) return row[0];
    if (planned >= P[P.length - 1]) return row[row.length - 1];
    const j = P.findIndex((p) => p >= planned);
    const f = (planned - P[j - 1]) / (P[j] - P[j - 1]);
    return row[j - 1] + f * (row[j] - row[j - 1]);
  }
  const predict = (planned, skill, weather, age, which = 'mean') => {
    const r = ratio(which, planned, skill, weather, age);
    return r == null ? formula(planned, skill, weather, age) : planned * r * factor;
  };

  function useModel(grid) {
    G = grid; factor = grid.operator_factor;
    D.predict = (planned, skill, weather, age) => predict(planned, skill, weather, age);
    const err = D.tasks.map((t) => Math.abs(D.predict(t.est, t.skill, t.weather, t.age) - t.actual) / t.actual);
    D.modelError = err.reduce((a, b) => a + b, 0) / err.length;
  }

  L.estOut = (plan) => {
    const out = $('#estOut');
    if (!G || !out) return false;
    const { type, weather, skill, age } = S.est;
    const pred = predict(plan, skill, weather, age);
    const lo = Math.min(pred, predict(plan, skill, weather, age, 'lo'));
    const hi = Math.max(pred, predict(plan, skill, weather, age, 'hi'));
    const max = Math.max(plan, hi) * 1.25;
    const pc = (v) => (v / max) * 100;
    // each chip = minutes this condition adds compared with a normal day
    const diff = (k, v) => pred - predict(plan, k === 'skill' ? G.ref.skill : skill, k === 'weather' ? G.ref.weather : weather, k === 'age' ? G.ref.machine_age : age);
    const chip = (d, l) => (Math.abs(d) < 0.5 ? '' : `<span class="factor" style="${d < 0 ? 'background:#E3F4EA;color:var(--ok-ink)' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)} min ${l}</span>`);
    const dA = diff('age');
    const chips = chip(diff('skill'), 'for experience') + chip(diff('weather'), `for ${weather.toLowerCase()} weather`) + chip(dA, dA > 0 ? 'for an older machine' : 'for a newer machine');
    const you = Math.abs(factor - 1) >= 0.02 ? ` Your finished jobs run ${Math.round(Math.abs(factor - 1) * 100)}% ${factor > 1 ? 'longer' : 'shorter'} than expected, so that is included.` : '';
    out.innerHTML = `
      <h3>Expected time</h3><div class="sub">${type} · ${weather} · ${skill} · ${age} yr machine</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:18px">
        <b class="num" style="font-size:88px;line-height:.9;font-weight:700">${Math.round(pred)}</b><span style="font:500 16px var(--f-ui);color:var(--t2)">minutes</span>
      </div>
      <div style="font-size:13px;color:var(--t2);margin-top:6px">Between <b style="color:var(--text)">${Math.round(lo)} and ${Math.round(hi)} min</b> · the plan says ${plan} min</div>
      <div class="range" style="margin-top:22px;height:30px">
        <div class="range-track" style="top:12px"></div>
        <div class="range-band" style="left:${pc(lo)}%;width:${pc(hi) - pc(lo)}%;top:6px;height:18px;border-radius:9px"></div>
        <span class="range-tick plan" style="left:${pc(plan)}%;top:2px;height:26px" data-tip="Planned ${plan} min"></span>
        <span class="range-tick pred" style="left:${pc(pred)}%;top:2px;height:26px" data-tip="Expected ${pred.toFixed(1)} min"></span>
      </div>
      <div class="range-scale"><span>0</span><span>${Math.round(max / 2)}</span><span>${Math.round(max)} min</span></div>
      <div class="factors" style="margin-top:16px">${chips || '<span class="factor" style="background:var(--chip);color:var(--t2)">No extra time</span>'}</div>
      <div class="note"><i data-lucide="sigma"></i><span><b>How we worked it out:</b> a model trained on past jobs, including every job you mark done. 8 in 10 jobs like this take ${Math.round(lo)} to ${Math.round(hi)} min.${you}</span></div>`;
    A.icons();
    return true;
  };

  /* ---------- the model learns from Done ---------- */
  const activeTask = () => {
    const slot = D.schedule.find((s) => s.active);
    return slot && (D.tasks.find((t) => t.id === slot.id) || D.extraTasks.find((t) => t.id === slot.id));
  };
  function learned(r) {
    factor = r.operator_factor;
    if (G) useModel({ ...G, operator_factor: factor });
    refresh('tasks');
    refreshFleet();
  }
  L.jobDone = (actual) => {
    const t = activeTask();
    if (!t || !L.connected) return;
    api(`/jobs/${t.id}/done`, {
      type: t.type, weather: t.weather, skill: t.skill, machine_age: t.age,
      planned_min: t.est, predicted_min: D.predict(t.est, t.skill, t.weather, t.age), actual_min: actual, time_label: `Today ${clock()}`,
    }).then(learned).catch(() => {});
  };
  L.jobUndo = () => {
    const t = activeTask();
    if (t && L.connected) api(`/jobs/${t.id}/done`, undefined, 'DELETE').then(learned).catch(() => {});
  };

  /* ---------- added jobs are saved in the database ---------- */
  const jobBody = (id) => {
    const slot = D.schedule.find((s) => s.id === id), t = D.extraTasks.find((x) => x.id === id);
    return slot && t && { id, type: t.type, zone: slot.zone, planned_min: t.est, weather: t.weather, skill: t.skill, machine_age: t.age };
  };
  L.jobAdded = (id) => { const b = jobBody(id); if (b && L.connected) api('/jobs', b).catch(() => {}); };
  L.jobRemoved = (id) => { if (L.connected) api(`/jobs/${id}`, undefined, 'DELETE').catch(() => {}); };

  /* =========================================================
     HABITS: trained classifier
     ========================================================= */
  const LEVEL = { Normal: ['good', 'Normal'], 'Worth a look': ['mid', 'Worth a look'], Concerning: ['bad', 'Concerning'] };
  let habits = {};
  L.habitLevel = (m) => (L.connected || Object.keys(habits).length ? LEVEL[habits[m.name]] || null : null);
  async function loadHabits() {
    const res = await api('/habits', D.sessions.metrics.map((m) => ({ name: m.name, values: m.values, higher_is_worse: m.worse !== 'lower' })));
    habits = Object.fromEntries(res.map((r) => [r.name, r.level]));
  }

  /* =========================================================
     REPORTS: saved in the database, queued for real when there is no signal
     ========================================================= */
  const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const body = (x) => ({
    id: x.rid, time_label: x.time, type: x.type, source: x.src, severity: x.sev, status: x.status || 'New',
    operator: x.who || '', machine_id: x.machine || MACHINE, snapshot: x.snap || {},
  });
  const waiting = () => S.incidents.filter((x) => x.snap && x.synced === false);

  function lostSignal() {
    if (!S.offline) { S.offline = true; L.lostSignal = true; }
    S.pending = waiting().length;
    A.updateSync();
  }

  L.report = (x) => {
    x.rid = x.rid || newId();
    if (!L.connected || S.offline) return;
    api('/reports', [body(x)])
      .then(() => { x.synced = true; A.saveIncidents(); refreshFleet(); })
      .catch(() => { x.synced = false; A.saveIncidents(); lostSignal(); });
  };

  async function sendWaiting(showToast) {
    const list = waiting();
    list.forEach((x) => { x.rid = x.rid || newId(); });
    if (!list.length) return 0;
    A.updateSync(list.length);
    await api('/reports', list.map(body));
    list.forEach((x) => { x.synced = true; });
    S.pending = 0;
    A.saveIncidents(); A.updateSync();
    if (showToast) A.toast(`${list.length} report${list.length === 1 ? '' : 's'} sent.`, 'cloud-check');
    refresh('safety');
    refreshFleet();
    return list.length;
  }

  L.setOffline = (off) => {
    if (!L.connected) return false;        // backend down: keep the app's own demo behaviour
    if (off) { L.lostSignal = false; return false; }
    S.offline = false; L.lostSignal = false;
    sendWaiting(true).then((n) => { if (!n) A.updateSync(); }).catch(() => { lostSignal(); A.toast('Still no signal. Reports stay on the tablet.', 'cloud-off'); });
    return true;
  };

  /* =========================================================
     FLEET VIEW: the cab's reports and finished jobs appear in the manager's log
     ========================================================= */
  async function refreshFleet() {
    if (!L.connected) return;
    try {
      const [reports, results] = await Promise.all([api('/reports'), api('/results')]);
      const at = (iso) => `Today ${iso.slice(11, 16)}`;
      const live = [
        ...reports.map((r) => ({ when: r.time_label, op: OP, mc: r.machine_id, what: r.type, src: r.source, live: true, k: r.at })),
        ...results.map((r) => ({ when: r.time_label || at(r.at), op: r.operator_id, mc: r.machine_id, what: `${r.type} done in ${Math.round(r.actual_min)} min (plan ${Math.round(r.planned_min)})`, src: 'Cab screen', live: true, k: r.at })),
      ].sort((a, b) => (a.k < b.k ? 1 : -1));
      D.fleet.logs = [...live, ...D.fleet.logs.filter((l) => !l.live)];
      refresh('fleet');
    } catch (e) { /* next refresh will catch up */ }
  }

  /* =========================================================
     MACHINE DATA: the backend remote drives the machine
     ========================================================= */
  let lastEvent = null;
  function flagFor(colour) {
    S.flag = colour; A.applyFlag();
    setTimeout(() => { if (S.flag === colour) { S.flag = 'green'; A.applyFlag(); } }, 2500);
  }
  function onEvent(e) {
    if (e.kind === 'moving') { if (e.value !== S.moving) A.setMoving(e.value); }
    if (e.kind === 'belt') { S.beltOn = e.value; if (S.moving) A.setMoving(true); refresh('safety'); }
    if (e.kind === 'belt_off_moving') {
      A.addIncident('Belt off while moving', 'Machine', 'crit');
      A.flashEdge();
      A.toast('Stop. Put your belt on.', 'armchair');
      refresh('safety');
    }
    if (e.kind === 'person') {
      const d = +e.value, stop = A.rule('stop'), slow = A.rule('slow');
      if (d < stop) {
        S.proxEvents.unshift({ t: clock(), zone: 'stop', what: `Worker at ${d} m, inside the ${stop} m stop zone`, did: 'Machine slowed, horn sounded, report logged' });
        A.addIncident(`Worker inside the stop zone (${d} m)`, 'Machine · radar', 'crit');
        flagFor('red');
        A.toast('Stop zone crossed. Logged as a report.', 'siren');
      } else if (d < slow) {
        S.proxEvents.unshift({ t: clock(), zone: 'slow', what: `Worker at ${d} m, in the slow zone`, did: 'Warning shown' });
        flagFor('yellow');
        A.toast('Someone is near. Slow down.', 'triangle-alert');
      }
      refresh('safety');
    }
  }

  async function poll() {
    try {
      const t = await api(`/telemetry?since=${lastEvent ?? 0}`);
      if (lastEvent == null) {
        lastEvent = t.events.length ? t.events[t.events.length - 1].id : 0;   // don't replay old events
        if (t.machine && typeof t.machine.belt === 'boolean') { S.beltOn = t.machine.belt; }   // start from the machine's real belt state
      } else {
        t.events.forEach((e) => { onEvent(e); lastEvent = e.id; });
      }
      if (!L.connected) await onConnect();
    } catch (e) {
      if (L.connected) { L.connected = false; lostSignal(); }
    }
    setTimeout(poll, 2000);
  }

  async function onConnect() {
    const grid = await api('/model/grid');
    useModel(grid);
    await loadHabits();
    L.connected = true;
    // added jobs on this tablet go to the database
    D.schedule.filter((s) => s.added).forEach((s) => L.jobAdded(s.id));
    // reports made while the backend was away are sent now
    if (L.lostSignal || !S.offline) {
      S.offline = false; L.lostSignal = false;
      await sendWaiting(true).catch(() => lostSignal());
      A.updateSync();
    }
    refreshFleet();
    refresh('tasks', 'training', 'safety');
  }

  poll();
})();
