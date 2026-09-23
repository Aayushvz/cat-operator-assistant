/* Cat Operator Assistant: app shell, home stage, and deliverable pages. */
(() => {
  const D = window.DATA;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const main = $('#main');
  const app = $('#app');

  const S = {
    route: 'home',
    mhPart: 0,   // Machine tab: which part's readings are open
    // first-visit default: bucket card open on the machine
    hotspot: 'bucket',
    overviewOpen: true,
    t: D.LIVE,
    speed: 1,
    paused: false,
    labels: false,
    flag: 'green',
    lang: 'en',
    lights: [false, false, false, false, false],
    est: { type: 'Trenching', weather: 'Rainy', skill: 'Intermediate', age: 4 },
    slot: 1,
    incidents: [
      { time: '02 May 09:00', type: 'Belt off while working', src: 'Machine', sev: 'crit', status: 'Open' },
      { time: '02 May 09:00', type: 'Idle 60 min, only 1 load', src: 'Machine', sev: 'caution', status: 'Open' },
      { time: '01 May 14:00', type: 'Engine ran 3.7 hours for 1 load', src: 'Machine', sev: 'warn', status: 'Checking' },
      { time: '01 May 10:00', type: 'Belt off during a 55 min wait', src: 'Machine', sev: 'crit', status: 'Talked through' },
      { time: '01 May 09:47', type: 'Near miss: worker walked into swing area', src: 'You, voice note', sev: 'crit', status: 'Closed' },
    ],
    settings: { haptics: true, voice: true, contrast: false, budget: 3, presets: true, share: false, offline: false },
    watched: new Set(),
    stepVal: 52, actualDone: null,
    addOpen: false, addType: 'Trenching', addZone: 'Zone B', addMin: 30,   // add a job                 // SRS 3.3 mark done
    beltOn: false, engine: 'off',                  // SRS 3.4 interlock demo
    proxEvents: [
      { t: '14:38', zone: 'slow', what: 'Worker at 11 m, in the slow zone', did: 'Warning shown' },
      { t: '13:12', zone: 'slow', what: 'Dump truck at 9.1 m, in the slow zone', did: 'Give way shown' },
      { t: '09:47', zone: 'stop', what: 'Worker at 5.2 m, in the stop zone', did: 'Machine slowed, report logged' },
    ],
    ctrl: 'rjoy',
    fleetOp: 'all', fleetMc: 'all', reviewed: {},
    moving: false, offline: false, pending: 0,
    psDismissed: new Set(),
    routeArg: null,
  };

  // Five tabs only, so the operator is never hunting through a long menu.
  // Pages that used to be tabs of their own now live as a second tab inside these.
  const NAV = [
    { id: 'home', icon: 'house', en: 'Home', hi: 'होम' },
    { id: 'tasks', icon: 'list-checks', en: 'My tasks', hi: 'मेरे कार्य' },
    { id: 'safety', icon: 'shield-check', en: 'Safety and reports', hi: 'सुरक्षा और रिपोर्ट' },
    { id: 'training', icon: 'graduation-cap', en: 'Learn', hi: 'सीखें' },
    { id: 'machine', icon: 'wrench', en: 'Machine', hi: 'मशीन' },
  ];
  // second-level tabs: [route, English, Hindi]
  const SUBTABS = {
    tasks: [['tasks', 'Today', 'आज'], ['tasks/time', 'Job time', 'काम का समय']],
    safety: [['safety', 'Safety', 'सुरक्षा'], ['safety/reports', 'Reports', 'रिपोर्ट']],
    training: [['training', 'Controls', 'कंट्रोल'], ['training/videos', 'Videos', 'वीडियो'], ['training/habits', 'Your habits', 'आपकी आदतें']],
  };
  // old addresses still work, they just open the merged page
  const OLD_ROUTES = { estimator: 'tasks/time', incidents: 'safety/reports', insights: 'training/habits' };
  const label = (id) => { const n = NAV.find((x) => x.id === id); return n[S.lang]; };

  /* ---------- helpers ---------- */
  const icons = () => window.lucide && lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
  const hhmm = (m) => { const h = Math.floor(8 + m / 60), mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
  const pct = (v, a, b) => ((v - a) / (b - a)) * 100;
  const fmt = (n, d = 0) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  function interp(pts, t) {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0); }
    }
    const [xa, ya] = pts[pts.length - 2], [xb, yb] = pts[pts.length - 1];
    return yb + ((t - xb) / (xb - xa)) * (yb - ya);
  }
  const engineAt = (t) => interp([[0, 1523.5], [120, 1524.8], [360, 1526.5], [411, 1527.0]], t);
  const fuelAt = (t) => interp([[0, 5.2], [120, 9.0], [360, 15.1], [411, 17.0]], t);
  const cyclesAt = (t) => Math.round(interp([[0, 0], [120, 14], [360, 24], [411, 31]], t));
  const idleAt = (t) => D.segments.filter((s) => s.kind === 'idle').reduce((a, s) => a + Math.max(0, Math.min(t, s.to) - s.from), 0);
  function stateAt(t) {
    const seg = D.segments.find((s) => t >= s.from && t < s.to) || D.segments[D.segments.length - 1];
    const beltOff = !!(seg.beltOff && t >= seg.beltOff[0] && t < seg.beltOff[1]);
    return { kind: seg.kind, task: seg.task, beltOff, seg };
  }
  function countUp(root) {
    $$('[data-count]', root).forEach((el) => {
      const to = +el.dataset.count, dec = +(el.dataset.dec || 0);
      if (reduce) { el.textContent = fmt(to, dec); return; }
      const t0 = performance.now(), dur = 650;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(to * e, dec);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  let toastTimer;
  function toast(msg, icon = 'check') {
    const el = $('#toast');
    el.innerHTML = `<i data-lucide="${icon}"></i><span>${msg}</span>`;
    icons(); el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }
  function applyFlag() {
    const g = $('#edgeGlow');
    g.className = S.flag === 'green' ? '' : `on ${S.flag}`;
  }
  function flashEdge() {
    if (S.flag !== 'green') return;
    const g = $('#edgeGlow');
    g.className = 'on red';
    setTimeout(applyFlag, 900);
  }

  /* ---------- tooltip (event delegation) ---------- */
  const tip = $('#tooltip');
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip], [data-tip-c]');
    const text = el && (el.dataset.tip || (app.classList.contains('left-collapsed') && el.dataset.tipC));
    if (!text) { tip.classList.remove('on'); return; }
    tip.innerHTML = text;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y < 8) y = e.clientY + 16;
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.classList.add('on');
  });

  /* ---------- nav ---------- */
  function renderNav() {
    const nav = $('#nav');
    nav.innerHTML = `<span class="nav-bar" id="navBar" aria-hidden="true"></span>` + NAV.map((n) => {
      return `<button class="nav-item${S.route === n.id ? ' active' : ''}" data-route="${n.id}" data-tip-c="${n[S.lang]}" type="button" ${S.route === n.id ? 'aria-current="page"' : ''}>
        <i data-lucide="${n.icon}"></i><span>${n[S.lang]}</span></button>`;
    }).join('');
    icons();
    positionNavBar();
  }
  function positionNavBar() {
    const a = $('.nav-item.active'), bar = $('#navBar');
    if (bar) bar.style.opacity = a ? 1 : 0;
    if (a && bar) bar.style.transform = `translateY(${a.offsetTop + (a.offsetHeight - 20) / 2}px)`;
  }
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-route]');
    if (b) go(b.dataset.route);
  });

  const EXTRA_ROUTES = ['profile', 'video', 'settings', 'fleet'];
  function go(target) {
    if (OLD_ROUTES[target]) target = OLD_ROUTES[target];
    let [route, arg] = String(target).split('/');
    if (!NAV.some((n) => n.id === route) && !EXTRA_ROUTES.includes(route)) route = 'home';
    S.route = route; S.routeArg = arg || null;
    const full = arg ? `${route}/${arg}` : route;
    if (location.hash !== '#' + full) history.replaceState(null, '', '#' + full);
    // video lives under Training; profile has no nav item of its own
    const navId = route === 'video' ? 'training' : route;
    $$('.nav-item').forEach((b) => {
      const on = b.dataset.route === navId;
      b.classList.toggle('active', on);
      on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
    app.classList.toggle('fleet-mode', route === 'fleet');
    positionNavBar();
    if (route !== 'home') Machine3D.stop();
    ({ home: renderHome,
      tasks: () => (arg === 'time' ? renderEstimator() : renderTasks()),
      safety: () => (arg === 'reports' ? renderIncidents() : renderSafety()),
      training: () => (arg === 'habits' ? renderInsights() : arg === 'videos' ? renderTraining() : renderControls()),
      fleet: renderFleet,
      machine: renderMachine,
      settings: () => renderProfile('settings'), profile: () => renderProfile('profile'), video: () => renderVideo(S.routeArg) })[route]();
    main.scrollTop = 0; const pg = main.querySelector('.page'); if (pg) pg.scrollTop = 0;
    icons();
    countUp(main);
  }

  /* =========================================================
     HOME
     ========================================================= */
  const HS = {
    cab: { name: 'Cab', icon: 'armchair' },
    engine: { name: 'Engine', icon: 'cog', side: 'up' },
    hydraulics: { name: 'Boom', icon: 'droplets' },
    bucket: { name: 'Bucket', icon: 'shovel' },
    undercarriage: { name: 'Undercarriage', icon: 'tractor' },
    proximity: { name: 'Sensors', icon: 'radar', side: 'down' },
  };

  function hsStatus(key) {
    const st = stateAt(S.t);
    if (key === 'cab') return beltOffAt(st) ? ['crit', 'Belt off'] : ['ok', 'Belt on'];
    if (key === 'undercarriage') return ['warn', 'Tracks worn'];
    if (key === 'hydraulics') return ['crit', 'Fault: oil leak'];
    if (key === 'proximity') return ['caution', '1 person near'];
    if (key === 'engine') return st.kind === 'idle' ? ['caution', 'Idling'] : ['ok', 'OK'];
    return ['ok', 'OK'];
  }
  const toneColor = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', caution: 'var(--mango)' };

  function overviewData(key) {
    const t = S.t, st = stateAt(t), eng = engineAt(t), fuel = fuelAt(t), cyc = cyclesAt(t);
    const rpm = st.kind === 'work' ? '1,650' : st.kind === 'idle' ? '900' : 'Off';
    const R = (icon, l, v, tone = '', bar) => ({ icon, l, v, tone, bar });
    switch (key) {
      case 'cab': return { title: 'Cab', rows: [
        R('user-round', 'Operator', 'OP1001 · Aayush Raj'),
        R('armchair', 'Seatbelt', beltOffAt(st) ? 'Unfastened' : 'Fastened', beltOffAt(st) ? 'crit' : 'ok'),
        R('vibrate', 'Seat buzz', 'On'),
        R('thermometer', 'Cab temperature', '24 °C'),
        R('activity', 'Machine', st.kind === 'work' ? 'Working' : st.kind === 'idle' ? 'Idle' : 'Break', st.kind === 'idle' ? 'mango' : ''),
      ] };
      case 'engine': return { title: 'Engine', rows: [
        R('clock', 'Engine hours', `${fmt(eng, 1)} hr`),
        R('fuel', 'Fuel used today', `${fmt(fuel, 1)} L`),
        R('repeat', 'Fuel per load', `${fmt(fuel / Math.max(cyc, 1), 2)} L`, fuel / Math.max(cyc, 1) > 0.6 ? 'mango' : ''),
        R('gauge', 'Engine speed', `${rpm} rpm`),
        R('thermometer', 'Coolant temp', '88 °C', 'ok'),
      ] };
      case 'hydraulics': return { title: 'Boom and hydraulics · fault', rows: [
        R('droplets', 'Boom cylinder', 'Leaking oil', 'crit'),
        R('gauge', 'Pump pressure', st.kind === 'work' ? '262 bar · low' : '40 bar', st.kind === 'work' ? 'crit' : ''),
        R('thermometer', 'Hydraulic oil', '78 °C · too hot', 'crit'),
        R('octagon-alert', 'Lifting', 'No heavy lifts', 'crit'),
        R('wrench', 'Fix', 'Call the mechanic today'),
      ] };
      case 'bucket': return { title: 'Bucket', rows: [
        R('repeat', 'Loads today', fmt(cyc)),
        R('timer', 'Time per load', '21 sec'),
        R('shovel', 'Teeth wear', '18%', '', 0.18),
        R('weight', 'Weight per bucket', 'About 1.1 t'),
      ] };
      case 'undercarriage': return { title: 'Tracks', rows: [
        R('tractor', 'Track wear', '64%', 'warn', 0.64),
        R('triangle-alert', 'Left track', 'A bit loose', 'warn'),
        R('calendar', 'Next check', 'In 12 hours'),
        R('cloud-rain', 'Ground', 'Wet clay'),
      ] };
      case 'proximity': return { title: 'Sensors and cameras', rows: [
        R('radar', 'Swing area', 'Clear', 'ok'),
        R('user-round', 'People near', '1, in slow zone', 'mango'),
        R('truck', 'Dump truck', 'Coming, give way'),
        R('camera', 'Rear camera', 'Online', 'ok'),
      ] };
      default: return { title: 'Machine', rows: [
        R('fuel', 'Fuel level', `${Math.round(73 - fuel * 0.3)}%`, '', (73 - fuel * 0.3) / 100),
        R('clock', 'Engine hours', `${fmt(eng, 1)} hr`),
        R('repeat', 'Loads today', fmt(cyc)),
        R('hourglass', 'Idle today', `${Math.round(idleAt(t))} min`, 'mango'),
        R('wrench', 'Next service', `In ${Math.round(1600.2 - eng)} hours`),
      ] };
    }
  }

  const BLUEPRINT = `
  <svg class="blueprint" viewBox="0 0 240 118" aria-hidden="true">
    ${Array.from({ length: 21 }, (_, i) => `<line class="bp-grid" x1="${i * 12}" y1="0" x2="${i * 12}" y2="118"/>`).join('')}
    ${Array.from({ length: 10 }, (_, i) => `<line class="bp-grid" x1="0" y1="${i * 12 + 2}" x2="240" y2="${i * 12 + 2}"/>`).join('')}
    <g class="bp-g" data-part="undercarriage">
      <rect class="bp" pathLength="1" x="38" y="92" width="124" height="22" rx="11"/>
      ${[56, 76, 96, 116, 136].map((x) => `<circle class="bp" pathLength="1" cx="${x + 4}" cy="103" r="4"/>`).join('')}
      <circle class="bp" pathLength="1" cx="49" cy="103" r="7"/><circle class="bp" pathLength="1" cx="151" cy="103" r="7"/>
    </g>
    <g class="bp-g" data-part="proximity">
      <rect class="bp" pathLength="1" x="28" y="60" width="22" height="30" rx="6"/>
      <path class="bp" pathLength="1" d="M20 64 A 18 18 0 0 0 20 88"/>
      <path class="bp" pathLength="1" d="M13 57 A 27 27 0 0 0 13 95"/>
    </g>
    <g class="bp-g" data-part="engine">
      <rect class="bp" pathLength="1" x="50" y="62" width="56" height="28" rx="2"/>
      <path class="bp" pathLength="1" d="M56 62 L58 54 L98 54 L100 62"/>
      <path class="bp" pathLength="1" d="M64 54 L64 44 M60 70 L96 70 M60 76 L96 76 M60 82 L96 82"/>
    </g>
    <g class="bp-g" data-part="cab">
      <path class="bp" pathLength="1" d="M106 90 L106 30 L130 30 L138 62 L138 90"/>
      <path class="bp" pathLength="1" d="M110 35 L127 35 L133 59 L110 59 Z"/>
    </g>
    <g class="bp-g fault" data-part="hydraulics">
      <path class="bp" pathLength="1" d="M138 80 L170 26 L204 31 L202 40 L173 36 L148 84 Z"/>
      <path class="bp" pathLength="1" d="M142 90 L160 54 M176 21 L198 25"/>
    </g>
    <g class="bp-g" data-part="bucket">
      <path class="bp" pathLength="1" d="M201 36 L214 84 L207 86 L194 40 Z"/>
      <path class="bp" pathLength="1" d="M207 84 C 199 99, 213 112, 229 106 L 224 86 Z"/>
      <path class="bp" pathLength="1" d="M211 107 L207 113 M217 109 L214 115 M223 108 L221 114"/>
    </g>
  </svg>`;

  const PART_OF = { machine: null, cab: 'cab', engine: 'engine', hydraulics: 'hydraulics', bucket: 'bucket', undercarriage: 'undercarriage', proximity: 'proximity' };

  function ovRowsHTML(key) {
    const d = overviewData(key);
    return d.rows.map((r) => `
      <div class="ov-row"><i data-lucide="${r.icon}"></i><span>${r.l}</span><b class="${r.tone}">${r.v}</b></div>
      ${r.bar != null ? `<div class="ov-bar"><i style="transform:scaleX(${r.bar.toFixed(3)})"></i></div>` : ''}`).join('');
  }

  /* Instrument icons drawn like real cab telltales (not generic UI icons). */
  const ICON_BELT = `<svg viewBox="0 0 48 48" class="ico-belt"><circle cx="22" cy="8" r="4.6" fill="currentColor"/><path fill="currentColor" d="M15.5 16.2c0-1.8 1.4-3.2 3.2-3.2h4.5c1.7 0 3.1 1.3 3.2 3l.7 11h7.4c1.6 0 3 1.2 3.2 2.8l1.4 10.4c.2 1.5-1 2.8-2.5 2.8-1.2 0-2.3-.9-2.5-2.1l-1.1-7.8H22.7c-4 0-7.2-3.2-7.2-7.2z"/><path d="M13.5 13.5 31 32.5" stroke="var(--lamp-bg)" stroke-width="7" stroke-linecap="round"/><path d="M13.5 13.5 31 32.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><rect x="28.2" y="30" width="7.6" height="5.4" rx="1.2" fill="currentColor" stroke="var(--lamp-bg)" stroke-width="1.6"/></svg>`;
  const ICON_WATCH = `<svg viewBox="0 0 24 24" class="ico-watch" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13.5" r="7.6"/><path d="M12 13.5V9.4M9.6 2.6h4.8M12 2.6v3.3M18.6 6.4l1.6-1.6"/></svg>`;

  const PHONE = matchMedia('(max-width: 760px)');
  PHONE.addEventListener('change', () => { if (S.route === 'home') renderHome(); });

  function renderHome() {
    const st = stateAt(S.t);
    const ticks = Array.from({ length: 61 }, (_, i) => `<i class="${i % 6 === 0 ? 'h' : ''}"></i>`).join('');

    main.innerHTML = `
    <div class="home">
      <section class="stage loading${S.labels ? ' show-labels' : ''}" id="stage" aria-label="Excavator EXC001, interactive 3D view">
        <div class="bay-wall"></div><div class="bay-floor"></div><div class="bay-stripe"></div>
        <canvas id="three" aria-hidden="true"></canvas>
        <div class="stage-vignette"></div>
        <svg class="connector" aria-hidden="true"><line id="conLine" x1="0" y1="0" x2="0" y2="0"/><circle id="conDot" r="3" cx="-10" cy="-10"/></svg>
        <div class="hotspots" id="hotspots">
          ${Object.entries(HS).map(([k, v]) => `
            <button class="hs" data-hs="${k}" data-side="${v.side || 'right'}" type="button" aria-label="${v.name}">
              <span class="hs-pulse"></span><span class="hs-ring"><span class="hs-core"></span></span>
              <span class="hs-label"><i></i><em>${v.name}</em></span>
            </button>`).join('')}
        </div>

        <div class="segmented" role="tablist">
          <button class="seg-icon" type="button" id="resetView" data-tip="Machine details" aria-label="Show machine details"><i data-lucide="layout-grid"></i></button>
          <div class="seg-tabs">
            <span class="seg-pill" id="segPill" style="transform:translateX(${S.labels ? 132 : 0}px)"></span>
            <button class="seg-tab${S.labels ? '' : ' active'}" role="tab" data-seg="ops" type="button">Machine</button>
            <button class="seg-tab${S.labels ? ' active' : ''}" role="tab" data-seg="status" type="button">Show parts</button>
          </div>
        </div>

        <div class="hud pace rise" id="ghost" style="--i:1" aria-live="polite">
          <div class="hud-head">${ICON_WATCH}<span>Your pace</span><em id="ghTask"></em></div>
          <div class="hud-read"><b class="num" id="ghDelta">0:00</b><span id="ghWord"></span></div>
          <div class="hud-sub" id="ghSub"></div>
          <div class="lap"><span>You</span><div class="lap-bar"><i id="ghFill"></i></div><b id="ghYouPct">0%</b></div>
          <div class="lap best"><span>Best</span><div class="lap-bar"><i id="ghBestFill"></i></div><b id="ghBestPct">0%</b></div>
        </div>

        <div class="hud belt rise" id="beltCard" style="--i:2" aria-live="polite">
          <div class="hud-head"><span>Seatbelt</span><em class="hud-live">Live</em></div>
          <div class="belt-main">
            <span class="telltale" aria-hidden="true">${ICON_BELT}</span>
            <div class="belt-txt"><b class="belt-state" id="beltState">Belt on</b><small id="beltSub"></small></div>
          </div>
          <div class="belt-strip" id="beltStrip" aria-hidden="true"></div>
          <div class="hud-foot"><span>Belt on today</span><b id="beltPct">100%</b></div>
        </div>

        <div class="pitstop" id="pitstop" role="dialog" aria-label="Short video while you wait">
          <div class="ps-head">
            <span class="ps-badge"><i data-lucide="hourglass"></i>While you wait</span>
            <span class="ps-time" id="psTime"></span>
            <button class="icon-btn ps-x" type="button" data-ps="later" aria-label="Not now"><i data-lucide="x"></i></button>
          </div>
          <div class="ps-belt" id="psBelt"><i data-lucide="armchair"></i>Your belt is off. Put it on before you start again.</div>
          <button class="ps-body" type="button" data-ps="watch">
            <span class="ps-thumb"><img id="psImg" alt="" /><span class="playb"><i data-lucide="play"></i></span></span>
            <span class="ps-txt"><small>Short video for you</small><b id="psTitle"></b><em id="psWhy"></em></span>
          </button>
          <div class="ps-actions">
            <button class="btn dark" type="button" data-ps="watch"><i data-lucide="play"></i>Watch now</button>
            <button class="btn outline" type="button" data-ps="later">Later</button>
          </div>
          <div class="ps-note"><i data-lucide="lock"></i>The arm stays locked. The video stops when you move the joystick.</div>
        </div>

        <div class="overview${S.overviewOpen ? '' : ' closed'}" id="overview">
          <div class="ov-head"><span class="eyebrow" id="ovTitle"></span>
            <button class="ov-close" type="button" data-close>Close <i data-lucide="x"></i></button></div>
          <div class="ov-id"><span>Machine ID: EXC001</span><span class="online">Online</span></div>
          ${BLUEPRINT}
          <div class="ov-body" id="ovBody"></div>
          <button class="ov-cta" type="button" data-go="machine"><span>See all machine details</span><i data-lucide="chevron-right"></i></button>
        </div>
        <button class="xbtn${S.overviewOpen ? '' : ' closed'}" id="xbtn" type="button" aria-label="Close overview"><i data-lucide="x"></i></button>

        <div class="card replay rise" style="--i:3">
          <div class="rp-top">
            <div class="rp-title"><b>Today's shift</b><span id="rpSummary"></span></div>
            <div class="rp-ctrl">
              <button class="ctl-play" id="playBtn" type="button" aria-label="Pause replay"><i data-lucide="${S.paused ? 'play' : 'pause'}"></i></button>
              <div class="ctl-speed" role="group" aria-label="Replay speed">${[1, 2, 4].map((v) => `<button class="${S.speed === v ? 'active' : ''}" data-speed="${v}" type="button" aria-pressed="${S.speed === v}">${v}×</button>`).join('')}</div>
              <button class="ctl-now" id="liveBtn" type="button">Now</button>
            </div>
          </div>
          <div class="track" id="track" aria-label="Today's shift from 08:00 to 18:00. Drag to replay.">
            <div class="lane">${segmentsHTML()}</div>
            ${D.alertsOnTrack.map((x) => `<span class="alert-pin" style="left:${pct(x.t, 0, 600)}%" data-tip="<b>${hhmm(x.t)}</b> ${x.text}" aria-label="${hhmm(x.t)} ${x.text}">!</span>`).join('')}
            <div class="hours">${Array.from({ length: 11 }, (_, i) => i * 60).map((m) => `<span class="${m % 120 === 0 ? 'major' : ''}" style="left:${pct(m, 0, 600)}%">${m % 120 === 0 ? hhmm(m) : ''}</span>`).join('')}</div>
            <div class="playhead" id="playhead"><span class="playhead-time" id="phTime"></span></div>
          </div>
          <div class="rp-foot">
            <p class="rp-status" id="rpStatus"></p>
            <div class="rp-legend" aria-hidden="true"><span><i class="k-work"></i>Working</span><span><i class="k-wait"></i>Waiting</span><span><i class="k-lunch"></i>Lunch</span><span><i class="k-alert">!</i>Alert</span></div>
          </div>
        </div>
      </section>

    </div>`;

    // Phone: the cards would cover the machine, so they stack below it instead
    if (PHONE.matches) {
      const below = document.createElement('div');
      below.className = 'home-below';
      ['#overview', '#beltCard', '#ghost', '.replay'].forEach((sel) => below.appendChild($(sel)));
      $('.home').appendChild(below);
    }

    icons();
    setOverview(S.hotspot, false);
    updateReplay(true);
    bindHome();

    const stage = $('#stage');
    const ok = Machine3D.mount(stage, $('#three'));
    if (ok) {
      Machine3D.onFrame(frame);
      Machine3D.setSelected(S.overviewOpen && S.hotspot !== 'machine' ? S.hotspot : null);
      Machine3D.start();
      setTimeout(() => stage.classList.remove('loading'), 60);
    } else {
      stage.classList.remove('loading');
    }
  }

  function segmentsHTML() {
    const out = [];
    D.segments.forEach((x) => {
      const a = x.from, b = Math.min(x.to, D.LIVE);
      if (b <= a) return;
      const w = pct(b, 0, 600) - pct(a, 0, 600);
      const name = x.kind === 'break' ? 'Lunch' : x.kind === 'idle' ? 'Waiting' : (x.task || 'Working').split(',')[0];
      out.push(`<span class="seg ${x.kind}" style="left:${pct(a, 0, 600)}%;width:${w}%" data-tip="<b>${hhmm(a)} to ${hhmm(b)}</b> ${name}${x.beltOff ? ' · belt off' : ''}">${w > 4.5 ? `<em>${name}</em>` : ''}</span>`);
    });
    const f = pct(D.LIVE, 0, 600);
    out.push(`<span class="seg future" style="left:${f}%;width:${100 - f}%">${100 - f > 12 ? '<em>Rest of shift</em>' : ''}</span>`);
    return out.join('');
  }

  // "Worked 5 h 5 m · waited 1 h 22 m" up to the replay time
  const hm = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${m} m` : `${m} min`; };
  function shiftSummary(t) {
    const sum = (k) => D.segments.filter((x) => x.kind === k).reduce((acc, x) => acc + Math.max(0, Math.min(t, x.to) - x.from), 0);
    return `Worked ${hm(sum('work'))} · waited ${hm(sum('idle'))}`;
  }

  function setOverview(key, animate) {
    S.hotspot = key;
    const body = $('#ovBody'), title = $('#ovTitle');
    if (!body) return;
    const apply = () => {
      title.textContent = overviewData(key).title;
      body.innerHTML = ovRowsHTML(key);
      icons();
      $$('.bp-g').forEach((g) => g.classList.toggle('on', !PART_OF[key] || g.dataset.part === PART_OF[key]));
      const bpEl = $('.blueprint'); if (bpEl) bpEl.classList.toggle('single', !!PART_OF[key]);
      $$('.hs').forEach((h) => h.classList.toggle('active', h.dataset.hs === key));
    };
    if (animate && !reduce) {
      body.classList.add('swap');
      void body.offsetWidth;
      apply();
      requestAnimationFrame(() => body.classList.remove('swap'));
    } else apply();
    Machine3D.setSelected && Machine3D.setSelected(key === 'machine' ? null : key);
    conProgress = key === 'machine' ? 0 : 0.001;
    conStart = performance.now();
  }

  function openOverview(open) {
    S.overviewOpen = open;
    $('#overview').classList.toggle('closed', !open);
    $('#xbtn').classList.toggle('closed', !open);
    if (!open) { $$('.hs').forEach((h) => h.classList.remove('active')); Machine3D.setSelected && Machine3D.setSelected(null); }
  }

  function bindHome() {
    const stage = $('#stage');
    stage.addEventListener('click', (e) => {
      const hs = e.target.closest('[data-hs]');
      if (hs) { openOverview(true); setOverview(hs.dataset.hs, true); return; }
      const ps = e.target.closest('[data-ps]');
      if (ps) {
        const seg = stateAt(S.t).seg;
        if (ps.dataset.ps === 'watch') { go(`video/${$('#pitstop').dataset.video}`); return; }
        S.psDismissed.add(seg.from); updatePitstop(stateAt(S.t)); return;
      }
      if (e.target.closest('[data-close]') || e.target.closest('#xbtn')) { openOverview(false); return; }
      if (e.target.closest('#resetView')) { openOverview(true); setOverview('machine', true); return; }
      const seg = e.target.closest('[data-seg]');
      if (seg) {
        S.labels = seg.dataset.seg === 'status';
        $('#segPill').style.transform = `translateX(${S.labels ? 132 : 0}px)`;
        $$('.seg-tab').forEach((t) => t.classList.toggle('active', t === seg));
        stage.classList.toggle('show-labels', S.labels);
        return;
      }
      const sp = e.target.closest('[data-speed]');
      if (sp) { S.speed = +sp.dataset.speed; $$('[data-speed]').forEach((p) => { p.classList.toggle('active', p === sp); p.setAttribute('aria-pressed', String(p === sp)); }); return; }
      if (e.target.closest('#liveBtn')) { S.t = D.LIVE; updateReplay(true); return; }
      if (e.target.closest('#playBtn')) {
        S.paused = !S.paused;
        const b = $('#playBtn');
        b.innerHTML = `<i data-lucide="${S.paused ? 'play' : 'pause'}"></i>`;
        b.setAttribute('aria-label', S.paused ? 'Play replay' : 'Pause replay');
        icons();
      }
    });

    // scrub
    const track = $('#track');
    let scrubbing = false;
    const setFromX = (x) => {
      const r = track.getBoundingClientRect();
      S.t = Math.max(0, Math.min(D.LIVE, ((x - r.left) / r.width) * 600));
      updateReplay(true);
    };
    track.addEventListener('pointerdown', (e) => { scrubbing = true; track.setPointerCapture(e.pointerId); setFromX(e.clientX); });
    track.addEventListener('pointermove', (e) => { if (scrubbing) setFromX(e.clientX); });
    const end = () => { scrubbing = false; };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    home.scrubbing = () => scrubbing;
  }
  const home = { scrubbing: () => false };

  /* ---------- ghost delta: you vs your personal best on the same kind of task ---------- */
  const mmss = (min) => { const a = Math.abs(min), m = Math.floor(a), sec = Math.round((a - m) * 60); return `${m}:${String(sec === 60 ? 0 : sec).padStart(2, '0')}`; };
  function ghostAt(t) {
    const g = D.ghosts.find((x) => t >= x.start && t < x.start + x.total) ||
      [...D.ghosts].reverse().find((x) => t >= x.start);   // after a task ends, keep showing its final result
    if (!g) return null;
    const el = Math.min(t - g.start, g.total);
    const you = el / g.total;                         // share of the task you have done
    const best = Math.min(1, el / g.pb);              // share your best run had done at the same time
    const delta = el - you * g.pb;                    // + behind, - ahead (minutes)
    return { g, el, you, best, delta, done: t - g.start >= g.total };
  }
  function updateGhost() {
    const box = $('#ghost');
    if (!box) return;
    const r = ghostAt(S.t);
    box.classList.toggle('idle', !r);
    if (!r) { $('#ghTask').textContent = ''; $('#ghDelta').textContent = '--:--'; $('#ghWord').textContent = ''; $('#ghSub').textContent = 'Starts with your first job.'; return; }
    const behind = r.delta > 0.05, ahead = r.delta < -0.05;
    box.classList.toggle('behind', behind);
    box.classList.toggle('ahead', ahead);
    $('#ghTask').textContent = r.g.name;
    $('#ghDelta').textContent = mmss(r.delta);
    $('#ghWord').textContent = behind ? 'slower' : ahead ? 'faster' : 'level';
    $('#ghSub').textContent = r.done
      ? `Finished in ${r.g.total} min. Your best is ${r.g.pb} min.`
      : `than your best time of ${r.g.pb} min (${r.g.pbWhen}).`;
    $('#ghFill').style.transform = `scaleX(${r.you})`;
    $('#ghBestFill').style.transform = `scaleX(${r.best})`;
    $('#ghYouPct').textContent = `${Math.round(r.you * 100)}%`;
    $('#ghBestPct').textContent = `${Math.round(r.best * 100)}%`;
  }

  /* ---------- seatbelt: live status, time in state, and compliance so far today ---------- */
  function beltWindows() { return D.segments.filter((x) => x.beltOff).map((x) => x.beltOff); }
  // at the live moment the belt switch (S.beltOn, set by the Safety demo or the machine) wins over the day's history
  const beltOffAt = (st) => st.beltOff || (S.t >= D.LIVE - 0.5 && !S.beltOn);
  function updateBelt(st) {
    const card = $('#beltCard');
    if (!card) return;
    const t = S.t, wins = beltWindows();
    const onMin = D.segments.filter((x) => x.kind !== 'break').reduce((a, x) => a + Math.max(0, Math.min(t, x.to) - x.from), 0);
    const offMin = wins.reduce((a, [f, e]) => a + Math.max(0, Math.min(t, e) - f), 0);
    const pct = onMin > 0 ? Math.round((1 - offMin / onMin) * 100) : 100;
    const state = st.kind === 'break' ? 'na' : beltOffAt(st) ? 'off' : 'on';
    const prev = card.dataset.state;
    card.classList.remove('on', 'off', 'na');
    card.classList.add(state);
    card.classList.toggle('danger', state === 'off' && st.kind === 'work');
    if (prev && prev !== state && !reduce) { card.classList.remove('clicked'); void card.offsetWidth; card.classList.add('clicked'); }
    card.dataset.state = state;
    // time since the last change of belt state
    const offNow = wins.find(([f, e]) => t >= f && t < e);
    const lastOn = wins.filter(([, e]) => e <= t).map(([, e]) => e).pop() ?? 0;
    $('#beltState').textContent = state === 'na' ? 'Engine off' : state === 'off' ? 'Belt off' : 'Belt on';
    $('#beltSub').textContent = state === 'na' ? 'Lunch break'
      : state === 'off' ? (st.kind === 'work' || !offNow ? 'Stop. Put your belt on.' : `Off for ${Math.floor(t - offNow[0])} min while waiting`)
      : `Since ${hhmm(lastOn)}`;
    $('#beltPct').textContent = `${pct}%`;
    // strip: belt history from 08:00 to now
    const parts = [];
    D.segments.forEach((x) => {
      const a = x.from, b = Math.min(x.to, t);
      if (b <= a) return;
      const cls = x.kind === 'break' ? 'br' : 'ok';
      parts.push(`<i class="${cls}" style="left:${pct100(a)}%;width:${pct100(b) - pct100(a)}%"></i>`);
    });
    wins.forEach(([f, e]) => { const b = Math.min(e, t); if (b > f) parts.push(`<i class="bad" style="left:${pct100(f)}%;width:${pct100(b) - pct100(f)}%"></i>`); });
    parts.push(`<span class="now" style="left:${pct100(t)}%"></span>`);
    $('#beltStrip').innerHTML = parts.join('');
  }
  const pct100 = (m) => (m / 600) * 100;

  /* ---------- pit stop: after 3 min of idle, offer a lesson picked from the data ---------- */
  function updatePitstop(st) {
    const p = $('#pitstop');
    if (!p) return;
    const idleFor = st.kind === 'idle' ? S.t - st.seg.from : 0;
    const show = st.kind === 'idle' && idleFor >= 3 && !S.psDismissed.has(st.seg.from);
    if (show) {
      // belt off: safety first; otherwise the idle itself is the lesson
      const v = D.videos.find((x) => x.id === (st.beltOff ? 'CJM_qHYXJDA' : 's22FKB2Zrnk'));
      if (p.dataset.video !== v.id) {
        p.dataset.video = v.id;
        $('#psImg').src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
        $('#psTitle').textContent = v.title;
        $('#psWhy').textContent = st.beltOff ? 'Your belt came off during this wait.' : 'Waiting with the engine on burns fuel. See how to cut it.';
      }
      $('#psTime').textContent = `Waiting ${Math.floor(idleFor)} min`;
      p.classList.toggle('belt', st.beltOff);
    }
    p.classList.toggle('on', show);
  }

  let lastMinute = -1;
  function updateReplay(force) {
    const m = Math.floor(S.t);
    if (!force && m === lastMinute) return;
    const prev = lastMinute;
    lastMinute = m;
    const ph = $('#playhead');
    if (!ph) return;
    ph.style.left = pct(S.t, 0, 600) + '%';
    $('#phTime').textContent = hhmm(S.t);
    $('#liveBtn').classList.toggle('on', S.t >= D.LIVE - 0.01);
    $('#liveBtn').setAttribute('aria-pressed', String(S.t >= D.LIVE - 0.01));
    const st = stateAt(S.t);
    Machine3D.setState && Machine3D.setState(st.kind);
    updateGlances(st);
    updateGhost();
    updateBelt(st);
    updatePitstop(st);
    const live = S.t >= D.LIVE - 0.01;
    const lead = live ? 'Right now you are' : `At ${hhmm(S.t)} you were`;
    const doing = st.kind === 'work' ? `<b>working</b> on <b>${(st.task || 'a job').split(',')[0]}</b>`
      : st.kind === 'idle' ? '<b class="wait">waiting</b> for a truck' : 'on <b>lunch break</b>';
    const belt = st.kind === 'break' ? '' : beltOffAt(st) ? ' · belt <b class="off">off</b>' : ' · belt on';
    $('#rpStatus').innerHTML = `${lead} ${doing}${belt} · rain, 24°C`;
    $('#rpSummary').textContent = shiftSummary(S.t);
    $$('.hs').forEach((h) => {
      const [tone, text] = hsStatus(h.dataset.hs);
      h.classList.toggle('alert', tone === 'crit');
      h.classList.toggle('caution', tone === 'caution');
      const lab = h.querySelector('.hs-label');
      lab.querySelector('i').style.background = toneColor[tone];
      lab.querySelector('em').textContent = `${HS[h.dataset.hs].name} · ${text}`;
    });
    if (S.overviewOpen && $('#ovBody')) {
      $('#ovBody').innerHTML = ovRowsHTML(S.hotspot);
      icons();
    }
    // crossing an alert while replaying
    if (prev >= 0 && !force) {
      D.alertsOnTrack.forEach((a) => {
        if (prev < a.t && m >= a.t) { toast(`${hhmm(a.t)} · ${a.text}`, 'siren'); flashEdge(); }
      });
    }
  }

  let conProgress = 0, conStart = 0, lastNow = 0;
  function frame(now) {
    const dt = lastNow ? Math.min(64, now - lastNow) : 16;
    lastNow = now;
    const stage = $('#stage');
    if (!stage) return;
    // hotspots follow the model
    $$('.hs', stage).forEach((el) => {
      const p = Machine3D.project(el.dataset.hs);
      if (p) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
    // connector from the X button to the active hotspot
    const line = $('#conLine'), dot = $('#conDot');
    if (S.overviewOpen && S.hotspot !== 'machine' && !PHONE.matches) {
      const sr = stage.getBoundingClientRect(), xr = $('#xbtn').getBoundingClientRect();
      const a = { x: xr.right - sr.left, y: xr.top - sr.top + xr.height / 2 };
      const b = Machine3D.project(S.hotspot);
      const p = reduce ? 1 : Math.min(1, (now - conStart) / 400);
      const e = Number.isFinite(p) ? 1 - Math.pow(1 - p, 3) : 1;
      const bx = a.x + (b.x - a.x) * e, by = a.y + (b.y - a.y) * e;
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', bx); line.setAttribute('y2', by);
      dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
      line.style.opacity = 1; dot.style.opacity = 1;
    } else { line.style.opacity = 0; dot.style.opacity = 0; }
    // replay advances toward live
    if (!S.paused && !home.scrubbing() && S.t < D.LIVE) {
      S.t = Math.min(D.LIVE, S.t + (dt / 100) * S.speed);
      updateReplay(false);
    }
  }

  /* =========================================================
     PAGES
     ========================================================= */
  const SUB_OF = { estimator: 'tasks/time', incidents: 'safety/reports', insights: 'training/habits', videos: 'training/videos' };
  function head(id, sub, right = '') {
    const here = SUB_OF[id] || id, parent = here.split('/')[0];
    const tabs = SUBTABS[parent] ? `<div class="subtabs" role="tablist">${SUBTABS[parent].map(([r, en, hi]) =>
      `<button class="subtab${r === here ? ' active' : ''}" role="tab" aria-selected="${r === here}" type="button" data-go="${r}">${S.lang === 'hi' ? hi : en}</button>`).join('')}</div>` : '';
    return `<div class="page-head"><div><h1>${label(parent)}</h1><p>${sub}</p></div>${right}</div>${tabs}`;
  }
  const WICON = { Sunny: 'sun', Rainy: 'cloud-rain', Cloudy: 'cloud', Windy: 'wind' };

  /* ---------- TASKS (SRS 3.3: task list, dynamic rescheduling, mark done) ---------- */
  const SHIFT_END = 600;   // 18:00, minutes after 08:00
  const GAP = 10;          // minutes between jobs: travel and setup
  const taskById = (id) => D.tasks.find((t) => t.id === id) || D.extraTasks.find((t) => t.id === id);
  const expect = (t) => D.predict(t.est, t.skill, t.weather, t.age);

  // Today's site forecast (sample), minutes after 08:00. Rain until 16:00, then wind from 17:00.
  const FORECAST = [
    { from: 0, to: 360, w: 'Cloudy' },
    { from: 360, to: 480, w: 'Rainy' },
    { from: 480, to: 540, w: 'Cloudy' },
    { from: 540, to: 720, w: 'Windy' },
  ];
  const WNAME = { Sunny: 'sun', Rainy: 'rain', Cloudy: 'cloud', Windy: 'wind' };
  const weatherAt = (m) => (FORECAST.find((f) => m >= f.from && m < f.to) || FORECAST[FORECAST.length - 1]).w;
  // jobs that go badly in some weather: soft ground in rain, high reach and dust in wind
  const AVOID = { 'Earth Excavation': ['Rainy'], Trenching: ['Rainy'], Grading: ['Rainy'], 'Backfill trench': ['Rainy'], Demolition: ['Rainy', 'Windy'] };
  const badWeather = (t, a, b) => { const av = AVOID[t.type] || []; return (FORECAST.find((f) => av.includes(f.w) && f.from < b && f.to > a) || {}).w; };
  // jobs not started yet: the weather in their slot and the signed-in operator's level
  const expectIn = (t, w) => D.predict(t.est, S.op?.level || t.skill, w, t.age);

  // Rescheduling: done jobs keep their real times. The job in progress ends at its estimate,
  // or at the minutes the operator entered. Remaining jobs start one after another; a job that
  // would finish after 18:00 is held back so shorter jobs behind it can move ahead, then it goes to tomorrow.
  const JOB_TYPES = ['Earth Excavation', 'Trenching', 'Material Loading', 'Grading', 'Demolition', 'Backfill trench'];
  const ZONES = ['Zone A', 'Zone B', 'Stockpile C', 'Block D'];
  let addedLoaded = false;
  function loadAddedJobs() {
    if (addedLoaded) return; addedLoaded = true;
    let list = [];
    try { list = JSON.parse(localStorage.getItem('cat-added-jobs')) || []; } catch (e) { /* storage blocked */ }
    list.forEach((j) => { D.extraTasks.push(j.task); D.schedule.push(j.slot); });
  }
  function saveAddedJobs() {
    const list = D.schedule.filter((x) => x.added).map((slot) => ({ slot, task: taskById(slot.id) }));
    try { localStorage.setItem('cat-added-jobs', JSON.stringify(list)); } catch (e) { /* storage blocked */ }
  }
  function addJob() {
    const id = `N${Date.now().toString().slice(-5)}`;
    // today's conditions and the operator's level fill in the rest, so the estimate works like any other job
    D.extraTasks.push({ id, type: S.addType, weather: 'Rainy', skill: D.tasks[1].skill, age: 4, est: S.addMin });
    D.schedule.push({ id, zone: S.addZone, start: SHIFT_END, added: true });
    saveAddedJobs();
    window.LIVE?.jobAdded?.(id); // LIVE: save to the backend
  }
  function removeJob(id) {
    window.LIVE?.jobRemoved?.(id); // LIVE
    D.schedule.splice(D.schedule.findIndex((x) => x.id === id), 1);
    D.extraTasks.splice(D.extraTasks.findIndex((x) => x.id === id), 1);
    saveAddedJobs();
  }

  function planDay() {
    loadAddedJobs();
    const rows = [];
    D.schedule.filter((s) => s.done).forEach((s) => { const t = taskById(s.id); rows.push({ ...s, t, start: s.start, end: s.start + t.actual, len: t.actual, state: 'done' }); });
    const act = D.schedule.find((s) => s.active);
    const at = taskById(act.id);
    const actLen = S.actualDone ?? expect(at) + (S.late || 0);
    rows.push({ ...act, t: at, start: act.start, end: act.start + actLen, len: actLen, state: S.actualDone != null ? 'done' : 'active', justDone: S.actualDone != null });
    let cursor = act.start + actLen + GAP;
    const later = [];
    // Weather-aware order: at each free slot take the first planned job the forecast suits.
    // A job that the weather would spoil waits for a better slot; if nothing suits, the first one goes, with a warning.
    const pending = D.schedule.filter((s) => !s.done && !s.active).map((s, i) => ({ s, t: taskById(s.id), i }));
    const held = {};
    while (pending.length) {
      const w = weatherAt(cursor);
      const opts = pending.map((p) => { const len = expectIn(p.t, w); return { ...p, len, bad: badWeather(p.t, cursor, cursor + len) }; })
        .sort((x, y) => (!!x.bad - !!y.bad) || x.i - y.i);
      const pick = opts.find((o) => cursor + o.len <= SHIFT_END);
      if (!pick) { opts.sort((x, y) => x.i - y.i).forEach((o) => later.push({ ...o.s, t: o.t, len: o.len, state: 'tomorrow' })); break; }
      opts.forEach((o) => { if (o.bad && o.i < pick.i) held[o.s.id] = o.bad; });
      pending.splice(pending.findIndex((p) => p.s === pick.s), 1);
      rows.push({ ...pick.s, t: pick.t, start: cursor, end: cursor + pick.len, len: pick.len, state: 'next', wx: w, bad: pick.bad, held: held[pick.s.id], moved: Math.round(cursor - pick.s.start) });
      cursor += pick.len + GAP;
    }
    const order = D.schedule.filter((s) => !s.done && !s.active).map((s) => s.id);
    rows.filter((r) => r.state === 'next').forEach((r, i) => { r.jumped = order.indexOf(r.id) > i; });
    return { rows, later };
  }

  function renderTasks() {
    const { rows, later } = planDay();
    const left = rows.filter((r) => r.state === 'next').length + (rows.some((r) => r.state === 'active') ? 1 : 0);
    const w = (m) => pct(m, 0, 630);
    const bar = rows.map((r) => `<div class="stint ${r.state === 'done' ? 'done' : r.state === 'active' ? 'active' : ''}" style="left:${w(r.start)}%;width:${w(r.len)}%" data-tip="<b>${r.t.type}</b><br>${hhmm(r.start)} to ${hhmm(r.end)}"><b>${r.t.type}</b><small>${hhmm(r.start)}</small></div>`).join('');
    // one short word or number per job, so a glance is enough
    const tag = (r) => r.state === 'active' ? '<span class="tag active">Now</span>'
      : r.added && r.state !== 'tomorrow' ? '<span class="tag new">New</span>'
      : r.state === 'tomorrow' ? '<span class="tag late">Tomorrow</span>'
      : r.bad ? `<span class="tag late">Go slow: ${WNAME[r.bad]}</span>`
      : r.held ? `<span class="tag moved">After the ${WNAME[r.held]}</span>`
      : r.jumped ? '<span class="tag moved">Moved up</span>'
      : r.moved > 1 ? `<span class="tag moved">+${r.moved} min</span>` : r.moved < -1 ? `<span class="tag done">−${-r.moved} min</span>` : '';
    const row = (r, i) => `<div class="job ${r.state}${r.jumped ? ' jumped' : ''} rise" style="--i:${i}">
        <div class="job-time"><b>${r.state === 'tomorrow' ? '—' : hhmm(r.start)}</b></div>
        <div class="job-main">
          <div class="job-title"><b${r.t.sample ? ' data-tip="Sample job, added for the demo"' : ''}>${r.t.type}</b><i data-lucide="${WICON[r.wx || r.t.weather]}" class="job-wx" data-tip="${r.wx ? `Forecast: ${WNAME[r.wx]}` : r.t.weather}"></i></div>
          <div class="job-line">${r.zone} · about ${Math.round(r.len)} min${r.added ? ` · <button class="linkbtn" type="button" data-remove="${r.id}">Remove</button>` : ''}</div>
          ${r.state === 'active' ? `<div class="done-box" id="doneBox">
            <span>Finished?</span>
            <div class="stepper"><button type="button" data-step="-5" aria-label="5 minutes less">−</button><b id="stepVal">${S.stepVal}</b><em>min</em><button type="button" data-step="5" aria-label="5 minutes more">+</button></div>
            <button class="btn dark" type="button" id="markDone2"><i data-lucide="check"></i>Done</button>
            <button class="btn outline" type="button" id="runLate"><i data-lucide="clock-alert"></i>Running late +15${S.late ? ` <em class="late-n">(+${S.late})</em>` : ''}</button>
          </div>` : ''}
        </div>
        <div class="job-tag">${tag(r)}</div>
      </div>`;
    const doneRows = rows.filter((r) => r.state === 'done');
    const cur = rows.find((r) => r.state === 'active'), nxt = rows.find((r) => r.state === 'next');
    const open = [...rows.filter((r) => r.state !== 'done'), ...later];
    main.innerHTML = `<div class="page">
      ${head('tasks', 'Your jobs today. If one runs long, the rest move.')}
      <div class="grid">
        <div class="plan-tiles rise">
          <div class="ptile now">
            <span class="pt-hatch" aria-hidden="true"></span>
            <img class="pt-mark" src="assets/cat-logo-white.png" alt="" aria-hidden="true" />
            <span class="pt-k"><i data-lucide="play"></i>Now</span>
            <b>${cur ? cur.t.type : 'Nothing running'}</b>
            <span class="pt-v">${cur ? `About ${Math.max(1, Math.round(cur.end - D.LIVE))} min left` : nxt ? `Next job at ${hhmm(nxt.start)}` : 'All done for today'}</span>
            ${cur ? `<span class="pt-job" aria-hidden="true"><i style="width:${Math.min(100, Math.max(0, pct(D.LIVE, cur.start, cur.end)))}%"></i></span>` : ''}
          </div>
          <div class="ptile next">
            ${nxt ? `<i data-lucide="${WICON[nxt.wx || nxt.t.weather]}" class="pt-wx" aria-hidden="true"></i>` : ''}
            <span class="pt-k"><i data-lucide="arrow-right"></i>Next</span>
            <b>${nxt ? nxt.t.type : 'No more jobs'}</b>
            <span class="pt-v">${nxt ? `Starts ${hhmm(nxt.start)}` : ''}</span>
            ${nxt ? `<span class="pt-chip"><i data-lucide="map-pin"></i>${nxt.zone}</span>` : ''}
          </div>
          <div class="ptile left">
            <span class="pt-dial" aria-hidden="true"></span>
            <span class="pt-k"><i data-lucide="clock"></i>Shift left</span>
            <b>${Math.floor((SHIFT_END - D.LIVE) / 60)} h ${Math.round((SHIFT_END - D.LIVE) % 60)} min</b>
            <div class="pt-bar" aria-hidden="true"><i style="width:${pct(D.LIVE, 0, SHIFT_END)}%"></i>${[120, 240, 360, 480].map((m) => `<em style="left:${pct(m, 0, SHIFT_END)}%"></em>`).join('')}<span class="pt-now" style="left:${pct(D.LIVE, 0, SHIFT_END)}%"></span></div>
            <span class="pt-scale">${[0, 120, 240, 360, 480, 600].map((m) => `<span>${hhmm(m)}</span>`).join('')}</span>
          </div>
        </div>
        ${later.length ? `<div class="plan-alert rise"><i data-lucide="calendar-x"></i><span><b>${later.map((r) => r.t.type).join(', ')}</b> won't fit today${later.some((r) => (AVOID[r.t.type] || []).includes('Windy')) && FORECAST.some((f) => f.w === 'Windy' && f.from < SHIFT_END) ? ` and the wind picks up at ${hhmm(FORECAST.find((f) => f.w === 'Windy').from)}` : ''}. It moves to tomorrow.</span></div>` : ''}
        <div class="card pcard c12 rise" style="--i:1">
          <div class="plan-head"><h3>Jobs</h3>
            <div class="fc" aria-label="Forecast for the rest of the shift">${FORECAST.filter((f) => f.to > D.LIVE && f.from < SHIFT_END).map((f) => `<span class="fc-i${D.LIVE >= f.from && D.LIVE < f.to ? ' now' : ''}"><i data-lucide="${WICON[f.w]}"></i>${D.LIVE >= f.from && D.LIVE < f.to ? 'Now' : hhmm(f.from)}</span>`).join('')}</div>
            <button class="btn ${S.addOpen ? 'outline' : ''}" type="button" id="addJob"><i data-lucide="${S.addOpen ? 'x' : 'plus'}"></i>${S.addOpen ? 'Close' : 'Add job'}</button></div>
          ${S.addOpen ? `<div class="add-job">
            <label><span>Job</span><select id="addType">${JOB_TYPES.map((t) => `<option ${t === S.addType ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label><span>Place</span><select id="addZone">${ZONES.map((z) => `<option ${z === S.addZone ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
            <div class="aj-time"><span>Planned time</span><div class="stepper"><button type="button" data-astep="-5" aria-label="5 minutes less">−</button><b id="addMin">${S.addMin}</b><em>min</em><button type="button" data-astep="5" aria-label="5 minutes more">+</button></div></div>
            <button class="btn dark" type="button" id="addSave"><i data-lucide="plus"></i>Add</button>
          </div>` : ''}
          <div class="done-line"><i data-lucide="circle-check"></i>Done: ${doneRows.map((r) => `${r.t.type} ${Math.round(r.len)} min`).join(' · ')}${S.actualDone != null ? ' <button class="linkbtn" type="button" id="undoDone">Undo</button>' : ''}</div>
          <div class="jobs">${open.map(row).join('')}</div>

        </div>
      </div></div>`;
    const page = main.querySelector('.page');
    page.addEventListener('change', (e) => { if (e.target.id === 'addType') S.addType = e.target.value; if (e.target.id === 'addZone') S.addZone = e.target.value; });
    page.addEventListener('click', (e) => {
      const st = e.target.closest('[data-step]');
      if (st) { S.stepVal = Math.max(5, Math.min(120, S.stepVal + +st.dataset.step)); $('#stepVal').textContent = S.stepVal; return; }
      if (e.target.closest('#markDone2')) {
        S.actualDone = S.stepVal;
        window.LIVE?.jobDone?.(S.stepVal); // LIVE: the model learns from the real time
        const before = planDay();
        toast(`Saved: ${S.stepVal} min. The rest of today was updated.`, 'check');
        renderTasks(); icons();
        return before;
      }
      if (e.target.closest('#runLate')) {
        // one tap: this job takes 15 min longer, the rest of the day moves
        S.late = (S.late || 0) + 15;
        const moved = planDay().later.length;
        toast(moved ? `Added 15 min. A job no longer fits and moves to tomorrow.` : 'Added 15 min. Your later jobs moved.', 'clock-alert');
        renderTasks(); icons(); return;
      }
      if (e.target.closest('#undoDone')) { S.actualDone = null; window.LIVE?.jobUndo?.(); renderTasks(); icons(); return; } // LIVE
      if (e.target.closest('#addJob')) { S.addOpen = !S.addOpen; renderTasks(); icons(); return; }
      const as = e.target.closest('[data-astep]');
      if (as) { S.addMin = Math.max(5, Math.min(240, S.addMin + +as.dataset.astep)); $('#addMin').textContent = S.addMin; return; }
      if (e.target.closest('#addSave')) {
        S.addType = $('#addType').value; S.addZone = $('#addZone').value;
        addJob(); S.addOpen = false;
        const fits = planDay().rows.some((r) => r.added && r.t.type === S.addType);
        toast(fits ? `${S.addType} added. The plan was updated.` : `${S.addType} added. It won't fit today, so it moves to tomorrow.`, 'plus');
        renderTasks(); icons(); return;
      }
      const rm = e.target.closest('[data-remove]');
      if (rm) { removeJob(rm.dataset.remove); toast('Job removed.', 'trash-2'); renderTasks(); icons(); }
    });
  }

  /* ---------- SAFETY (SRS 3.4: seatbelt interlock, proximity events, conditions tighten the rules) ---------- */
  const FLAGS = {
    green: { icon: 'flag', t: 'All clear', s: 'Work as normal.' },
    yellow: { icon: 'triangle-alert', t: 'Slow down', s: 'Someone is near the machine. Watch your swing.' },
    red: { icon: 'octagon-x', t: 'Stop now', s: 'A person is inside your stop zone.' },
    blue: { icon: 'truck', t: 'Give way', s: 'A dump truck is coming from the left.' },
  };
  const CHECKS = [{ icon: 'footprints', l: 'Walk around' }, { icon: 'scan-eye', l: 'Mirrors' }, { icon: 'droplet', l: 'Oil and fluids' }, { icon: 'camera', l: 'Cameras' }];
  // Working conditions tighten the safety rules (a simple multiplier, as in the SRS).
  const RULES = { stop: 6, slow: 10, idle: 5 };
  const rainFactor = 1.25;
  const rule = (k) => (k === 'idle' ? Math.round(RULES.idle / rainFactor) : +(RULES[k] * rainFactor).toFixed(1));

  function snapshot() {
    const st = stateAt(S.t);
    return { engine: `${fmt(engineAt(S.t), 1)} hr`, belt: beltOffAt(st) ? 'Off' : 'On', fuel: `${fmt(fuelAt(S.t), 1)} L today`, state: st.kind === 'work' ? 'Working' : st.kind === 'idle' ? 'Waiting' : 'Engine off', place: 'Zone B, trench line' };
  }

  function renderSafety() {
    const f = FLAGS[S.flag];
    const ang = (deg, r) => [140 + r * Math.cos((deg * Math.PI) / 180), 140 + r * Math.sin((deg * Math.PI) / 180)];
    const [px, py] = ang(205, 100), [tx, ty] = ang(-35, 124);
    const radar = `<div class="radar-wrap"><div class="sweep"></div>
      <svg viewBox="0 0 280 280" role="img" aria-label="Radar: one person in the slow zone, one truck coming closer">
        <circle cx="140" cy="140" r="132" fill="none" stroke="#E6E6E3"/>
        <circle cx="140" cy="140" r="110" fill="rgba(255,170,2,.08)" stroke="#FFAA02" stroke-dasharray="4 4"/>
        <circle cx="140" cy="140" r="68" fill="rgba(214,29,29,.07)" stroke="#D61D1D"/>
        <line x1="140" y1="8" x2="140" y2="272" stroke="#EFEFEC"/><line x1="8" y1="140" x2="272" y2="140" stroke="#EFEFEC"/>
        <g class="radar-exc" transform="translate(140 140) rotate(-20) scale(.9)">
          <!-- excavator from above: tracks, turning upper body, cab, boom, stick and bucket -->
          <g class="rx-tracks">
            <rect x="-26" y="-27" width="13" height="54" rx="4" fill="#2A2A28"/><rect x="13" y="-27" width="13" height="54" rx="4" fill="#2A2A28"/>
            ${Array.from({ length: 12 }, (_, i) => `<line x1="-24" x2="-15" y1="${-24 + i * 4.4}" y2="${-24 + i * 4.4}" stroke="#4A4A46" stroke-width="1.4"/><line x1="15" x2="24" y1="${-24 + i * 4.4}" y2="${-24 + i * 4.4}" stroke="#4A4A46" stroke-width="1.4"/>`).join('')}
          </g>
          <path d="M-19 -12 Q-19 -17 -14 -17 H14 Q19 -17 19 -12 V9 Q19 21 0 23 Q-19 21 -19 9 Z" fill="#FFCD11" stroke="#1A1A19" stroke-width="1.2"/>
          <path d="M-17 11 Q-15 19 0 21 Q15 19 17 11 Z" fill="#E0A800"/>
          <rect x="-17" y="-15" width="13" height="15" rx="2" fill="#1B1F23" stroke="#0B0B0B" stroke-width=".8"/>
          <rect x="-15" y="-13" width="9" height="6" rx="1" fill="#6F8795" opacity=".75"/>
          <path d="M5 -3 H15 M5 0 H15 M5 3 H15" stroke="#9A7800" stroke-width="1.2"/>
          <rect x="2" y="-14" width="5" height="3" rx="1" fill="#2A2A28"/>
          <image href="assets/cat-logo.png" x="-8" y="6" width="16" height="9.7" preserveAspectRatio="xMidYMid meet"/>
          <path d="M1 -16 L10 -16 L8.5 -47 L3.5 -47 Z" fill="#FFCD11" stroke="#1A1A19" stroke-width="1"/>
          <line x1="5.2" y1="-18" x2="5.6" y2="-40" stroke="#3A3A37" stroke-width="1.6" stroke-linecap="round"/>
          <rect x="3.6" y="-60" width="4.8" height="15" rx="1.2" fill="#F2BE00" stroke="#1A1A19" stroke-width=".9"/>
          <path d="M-1.5 -60 H13.5 L12 -67 H0 Z" fill="#3A3A37" stroke="#1A1A19" stroke-width=".9"/>
          <path d="M1 -67 v-2.4 M4.6 -67 v-2.4 M8.2 -67 v-2.4 M11.4 -67 v-2.4" stroke="#1A1A19" stroke-width="1.3" stroke-linecap="round"/>
        </g>
        <circle class="blip" cx="${px}" cy="${py}" r="7" fill="#FFAA02"/>
        <circle cx="${px}" cy="${py}" r="6" fill="#FFAA02" stroke="#fff" stroke-width="2" data-tip="<b>Worker</b> · 11 m away · slow zone"/>
        <rect x="${tx - 7}" y="${ty - 7}" width="14" height="14" rx="3" fill="#3A8DFF" stroke="#fff" stroke-width="2" data-tip="<b>Dump truck</b> · 13 m away · coming closer"/>
        <text x="140" y="${140 - 74}" text-anchor="middle" style="font:500 10px Roboto Condensed;fill:var(--crit-ink)">${rule('stop')} m stop</text>
        <text x="140" y="${140 - 116}" text-anchor="middle" style="font:500 10px Roboto Condensed;fill:var(--mango-ink)">${rule('slow')} m slow</text>
      </svg></div>`;
    main.innerHTML = `<div class="page">
      ${head('safety', 'Warnings show as a colour around the screen.')}
      <div class="grid">
        <div class="card pcard c5 rise flag-tile">
          <div><h3>Site warning</h3><div class="sub">Tap one to see how it looks in the cab.</div></div>
          <div class="flag-big ${S.flag}" id="flagBig"><i data-lucide="${f.icon}"></i><div><b>${f.t}</b><small>${f.s}</small></div></div>
          <div class="opt-row">${Object.keys(FLAGS).map((k) => `<button class="opt${S.flag === k ? ' active' : ''}" data-flag="${k}" type="button" style="height:48px;padding:0 16px">${FLAGS[k].t}</button>`).join('')}</div>
        </div>
        <div class="card pcard c7 rise" style="--i:1">
          <div class="plan-head"><div><h3>Who is near you</h3><div class="sub">When someone crosses a zone, it is logged. In a real machine this comes from the Cat radar and cameras; here it is simulated.</div></div>
            <button class="btn outline" type="button" id="simPerson"><i data-lucide="user-round"></i>Someone walks close (demo)</button></div>
          <div class="prox">
            ${radar}
            <div class="prox-log"><div class="eyebrow">Logged today</div>
              ${S.proxEvents.map((p) => `<div class="pe ${p.zone}"><span class="pe-t">${p.t}</span><div><b>${p.what}</b><small>${p.did}</small></div></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="card pcard c5 rise" style="--i:3">
          <h3>Site conditions</h3><div class="sub">Rain and wet ground make the safety rules stricter today.</div>
          <div class="cond">
            <div><span><i data-lucide="cloud-rain"></i>Weather</span><b>Rain</b></div>
            <div><span><i data-lucide="layers"></i>Ground</span><b>Wet clay</b></div>
            <div><span><i data-lucide="eye"></i>Visibility</span><b>1.2 km</b></div>
            <div><span><i data-lucide="thermometer"></i>Temperature</span><b>24 °C</b></div>
          </div>
          <table class="tbl rules"><thead><tr><th>Rule</th><th>Normally</th><th>Today</th></tr></thead><tbody>
            <tr><td>Stop zone</td><td>${RULES.stop} m</td><td><b>${rule('stop')} m</b></td></tr>
            <tr><td>Slow zone</td><td>${RULES.slow} m</td><td><b>${rule('slow')} m</b></td></tr>
            <tr><td>Engine off after waiting</td><td>${RULES.idle} min</td><td><b>${rule('idle')} min</b></td></tr>
          </tbody></table>
        </div>
        <div class="card pcard c7 rise sos-card-inline" style="--i:3">
          <div class="sos-head">
            <div><h3>Emergency SOS</h3><div class="sub">Hold 1.5 seconds. Works while moving and without signal.</div></div>
            <button class="btn outline" type="button" data-go="safety/reports"><i data-lucide="clipboard-list"></i>See all reports</button>
          </div>
          <div class="sos-body">
            <div class="sos-stage">
              <button class="sos-big" id="sosBig" type="button" aria-label="Press and hold to send SOS">
                <svg class="ring" viewBox="0 0 132 132" aria-hidden="true"><circle class="bg" cx="66" cy="66" r="62" fill="none" stroke-width="5"/><circle class="fg" cx="66" cy="66" r="62" fill="none" stroke-width="5" stroke-linecap="round"/></svg>
                <span class="sos-face"><i data-lucide="siren"></i><b>SOS</b><small>1.5 sec</small></span>
              </button>
              <span class="hold-hint">Or hold SOS at the top of the screen</span>
            </div>
            <div class="sos-acts"><span class="ra-k">It does all of this at once</span>
              ${[['octagon-pause', 'Stops the machine', 'Arm locked, tracks stop'], ['radio', 'Calls your supervisor', 'Radio and phone'], ['ambulance', 'Sends the site medic', 'About 4 minutes away'], ['hard-drive', 'Saves the machine data', 'The last 60 seconds']].map(([ic, t, d]) => `<div><span class="sa-ico"><i data-lucide="${ic}"></i></span><b>${t}</b><small>${d}</small></div>`).join('')}
            </div>
          </div>
        </div>
      </div></div>`;
    bindSafety();
    holdable($('#sosBig'), 1500, openSOS);
  }
  const SEV = { crit: ['crit', 'siren'], caution: ['caution', 'hourglass'], warn: ['warn', 'gauge'], info: ['info', 'mic'] };

  function bindHold(onDone) {
    const btn = $('#holdBtn');
    if (!btn) return;
    let timer;
    const start = (e) => { e.preventDefault(); btn.classList.add('holding'); timer = setTimeout(() => { btn.classList.remove('holding'); onDone(); }, 1200); };
    const cancel = () => { clearTimeout(timer); btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', cancel);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    btn.addEventListener('keyup', cancel);
  }
  // SRS 3.4 + 5: every report carries a telemetry snapshot and is saved on the tablet first
  function addIncident(type, src, sev) {
    S.incidents.forEach((x) => (x.fresh = false));
    S.incidents.unshift({ time: `Today ${$('#clock').textContent}`, type, src, sev, status: 'New', fresh: true, who: `${D.operator.name} · ${D.operator.id}`, machine: 'EXC001', snap: snapshot(), synced: !S.offline });
    if (S.offline) S.pending++;
    saveIncidents(); updateSync();
    window.LIVE?.report?.(S.incidents[0]); // LIVE: send to the backend
  }
  function logIncident() {
    addIncident('Your report, with voice note', 'You', 'info');
    toast(S.offline ? 'Report saved on the tablet. It will send when there is signal.' : 'Report saved. Your supervisor can see it.', 'mic');
  }

  function bindSafety() {
    main.querySelector('.page').addEventListener('click', (e) => {
      const fl = e.target.closest('[data-flag]');
      if (fl) {
        S.flag = fl.dataset.flag; applyFlag();
        const f = FLAGS[S.flag], big = $('#flagBig');
        big.className = `flag-big ${S.flag}`;
        big.innerHTML = `<i data-lucide="${f.icon}"></i><div><b>${f.t}</b><small>${f.s}</small></div>`;
        $$('[data-flag]').forEach((b) => b.classList.toggle('active', b === fl));
        icons(); return;
      }
      if (e.target.closest('#simPerson')) {
        const t = $('#clock').textContent;
        S.proxEvents.unshift({ t, zone: 'stop', what: `Worker at 5.8 m, inside the ${rule('stop')} m stop zone`, did: 'Machine slowed, horn sounded, report logged' });
        addIncident('Worker inside the stop zone (5.8 m)', 'Machine · radar', 'crit');
        S.flag = 'red'; applyFlag();
        setTimeout(() => { if (S.flag === 'red') { S.flag = 'green'; applyFlag(); } }, 2500);
        toast('Stop zone crossed. Logged as a report.', 'siren');
        renderSafety(); icons();
      }
    });
  }

  /* ---------- TRAINING ---------- */
  function renderTraining() {
    const slots = [['Thu', '09:30'], ['Thu', '13:00'], ['Fri', '08:00'], ['Fri', '12:30'], ['Sat', '10:00'], ['Sat', '14:00']];
    main.innerHTML = `<div class="page">
      ${head('videos', 'Picked from how you worked this week.')}
      <div class="grid">
        <div class="licence c4 rise">
          <img class="lic-logo" src="assets/cat-logo-white.png" alt="Cat" />
          <img class="lic-mark" src="assets/cat-logo-white.png" alt="" aria-hidden="true" />
          <div class="eyebrow" style="color:rgba(255,255,255,.6)">Your level</div>
          <div style="display:flex;align-items:flex-end;gap:14px;margin-top:10px"><span class="lic-class">F2</span><span style="font-size:13px;color:rgba(255,255,255,.75);padding-bottom:6px">Intermediate<br>Aayush Raj · OP1001</span></div>
          <div style="margin-top:22px;font-size:12px;color:rgba(255,255,255,.7);display:flex;justify-content:space-between"><span>To reach F1</span><span>${Math.min(100, 62 + S.watched.size * 4)}%</span></div>
          <div class="prog"><i style="width:${Math.min(100, 62 + S.watched.size * 4)}%"></i></div>
          <div style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.7);display:flex;justify-content:space-between"><span>Warning points</span><span>2 of 12 · cleared in 30 days</span></div>
          <div class="points">${Array.from({ length: 12 }, (_, i) => `<i class="${i < 2 ? 'on' : ''}"></i>`).join('')}</div>
          <div style="margin-top:18px;font-size:12px;color:rgba(255,255,255,.6)">At F1 you can do demolition jobs.</div>
        </div>
        <div class="card pcard c8 rise" style="--i:1">
          <h3>Watch these first</h3><div class="sub">Based on your last shifts.</div>
          <div style="margin-top:8px">
            <div class="rec"><span class="rec-ico hot"><i data-lucide="container"></i></span><div style="flex:1"><b>Loading trucks</b><small>Your last loading job took 42 min. The plan was 30.</small></div><button class="btn dark" type="button" data-go="video/tgqk0jftKXc"><i data-lucide="play"></i>Watch</button></div>
            <div class="rec"><span class="rec-ico"><i data-lucide="armchair"></i></span><div style="flex:1"><b>Belt on before you start again</b><small>Your belt was off after 2 long waits.</small></div><button class="btn outline" type="button" data-go="video/CJM_qHYXJDA"><i data-lucide="play"></i>Watch</button></div>
            <div class="rec"><span class="rec-ico"><i data-lucide="fuel"></i></span><div style="flex:1"><b>Less waiting, less fuel</b><small>Long waits used 4 times more fuel per load.</small></div><button class="btn outline" type="button" data-go="video/s22FKB2Zrnk"><i data-lucide="play"></i>Watch</button></div>
          </div>
        </div>
        <div class="card pcard c8 rise" style="--i:2">
          <h3>Cat videos</h3><div class="sub">From the official Cat® Products channel.</div>
          <div class="lessons">${D.videos.slice(0, 6).map((v) => `<button class="lesson" type="button" data-go="video/${v.id}"><div class="thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy" /><span class="playb"><i data-lucide="play"></i></span>${S.watched.has(v.id) ? '<span class="dur">Watched</span>' : ''}</div><div class="t"><b>${v.title}</b><small>${v.topic}</small></div></button>`).join('')}</div>
        </div>
        <div class="card pcard c4 rise" style="--i:3">
          <h3>Learn from a senior operator</h3><div class="sub">Sit in with S. Mehta on site.</div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:14px"><span class="avatar" style="width:40px;height:40px">SM</span><div><b style="font-size:13px">S. Mehta · F1</b><div style="font-size:12px;color:var(--t2)">Loading expert · 14 years</div></div></div>
          <div class="slots">${slots.map(([d, t], i) => `<button class="slot${S.slot === i ? ' active' : ''}" data-slot="${i}" type="button">${d}<b>${t}</b></button>`).join('')}</div>
          <button class="btn" type="button" style="width:100%;justify-content:center;margin-top:12px" data-book>Book ${slots[S.slot][0]} ${slots[S.slot][1]}</button>
        </div>
        <div class="card pcard c12 rise" style="--i:4">
          <h3>Practice on this screen</h3><div class="sub">When the machine is parked, the joysticks control a practice game here. The arm stays locked.</div>
          <div class="sim">
            <img class="sim-mark" src="assets/cat-logo-white.png" alt="" aria-hidden="true" />
            <span class="sim-hatch" aria-hidden="true"></span>
            <svg class="grid-bg" aria-hidden="true"><defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(255,255,255,.07)"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>
            <div class="content" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
              <div style="flex:1;min-width:240px"><div class="eyebrow" style="color:var(--y)">Practice</div><div style="font:700 28px/1.1 var(--f-display);text-transform:uppercase;margin-top:6px">Load a truck in 4 passes</div><div style="font-size:12.5px;color:rgba(255,255,255,.7);margin-top:6px">Goal 3:20 · your best 3:52 · expert 3:05</div></div>
              <div style="display:flex;gap:10px;align-items:center"><span class="chip" style="background:rgba(255,255,255,.08);color:#fff"><i data-lucide="lock"></i>Arm locked</span><button class="btn" type="button" data-toast="Park the machine to start practice">Start practice</button></div>
            </div>
          </div>
        </div>
      </div></div>`;
    main.querySelector('.page').addEventListener('click', (e) => {
      const s = e.target.closest('[data-slot]');
      if (s) {
        S.slot = +s.dataset.slot;
        $$('[data-slot]').forEach((b) => b.classList.toggle('active', b === s));
        $('[data-book]').textContent = `Book ${slots[S.slot][0]} ${slots[S.slot][1]}`;
      }
      if (e.target.closest('[data-book]')) toast(`Booked with S. Mehta, ${slots[S.slot][0]} ${slots[S.slot][1]}`, 'calendar-check');
    });
  }

  /* ---------- INSIGHTS ---------- */
  function renderInsights() {
    const tel = D.telemetry;
    const fpc = tel.map((r) => r.fuel / r.cycles);
    // lollipop
    const W = 560, H = 230, pl = 40, pb = 34, pt = 20;
    const x = (i) => pl + 50 + i * ((W - pl - 100) / 3);
    const y = (v) => pt + (1 - v / 2.2) * (H - pt - pb);
    const lolli = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fuel per load cycle by snapshot">
      ${[0, 0.5, 1, 1.5, 2].map((v) => `<line class="grid-l" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`).join('')}
      <line x1="${pl}" x2="${W}" y1="${y(0.5)}" y2="${y(0.5)}" stroke="#080808" stroke-dasharray="4 4"/>
      <text x="${W - 4}" y="${y(0.5) - 6}" text-anchor="end" class="lbl">Target 0.5 L</text>
      ${fpc.map((v, i) => {
        const bad = v > 1;
        return `<g data-tip="<b>${tel[i].label}</b><br>${tel[i].fuel} L ÷ ${tel[i].cycles} cycles = ${v.toFixed(2)} L per cycle">
          <line class="grow" style="--i:${i}" x1="${x(i)}" x2="${x(i)}" y1="${y(0)}" y2="${y(v)}" stroke="${bad ? '#D61D1D' : '#080808'}" stroke-width="2"/>
          <circle class="pop" style="--i:${i}" cx="${x(i)}" cy="${y(v)}" r="7" fill="${bad ? '#D61D1D' : '#080808'}" stroke="#fff" stroke-width="2"/>
          <rect x="${x(i) - 30}" y="${pt}" width="60" height="${H - pt - pb}" fill="transparent"/>
          <text class="lbl" x="${x(i)}" y="${y(v) - 14}" text-anchor="middle">${v.toFixed(2)} L${bad ? ' ⚠' : ''}</text>
          <text x="${x(i)}" y="${H - 12}" text-anchor="middle">${tel[i].label}</text></g>`;
      }).join('')}
    </svg>`;

    // idle share donuts (engine time between snapshots)
    const intervals = [1, 2, 3].map((i) => {
      const eng = (tel[i].engine - tel[i - 1].engine) * 60;
      return { label: `${tel[i - 1].label.slice(-5)} to ${tel[i].label.replace('01 May ', '')}`, eng, idle: tel[i].idle, share: tel[i].idle / eng };
    });
    const donut = (d, i) => {
      const r = 34, c = 2 * Math.PI * r, idleLen = c * d.share;
      return `<div style="text-align:center" data-tip="<b>${d.label}</b><br>${Math.round(d.eng)} engine min, ${d.idle} idle">
        <svg viewBox="0 0 96 96" width="112" height="112" role="img" aria-label="${Math.round(d.share * 100)} percent idle">
          <circle cx="48" cy="48" r="${r}" fill="none" stroke="#080808" stroke-width="10"/>
          <g transform="rotate(-90 48 48)"><circle class="arc" style="--i:${i};--len:${c}" cx="48" cy="48" r="${r}" fill="none" stroke="#FFAA02" stroke-width="10" stroke-dasharray="${Math.max(0, idleLen - 2)} ${c}"/></g>
          <text x="48" y="54" text-anchor="middle" style="font:600 20px Barlow Condensed;fill:#0B0B0B">${Math.round(d.share * 100)}%</text>
        </svg><div style="font-size:11.5px;color:var(--t2)">${d.label}</div></div>`;
    };

    // sector heatmap (sample cycles)
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const SECT = [{ n: 'Dig', base: 6.2, pb: 5.5 }, { n: 'Swing', base: 5.2, pb: 4.8 }, { n: 'Dump', base: 3.0, pb: 2.7 }, { n: 'Return', base: 4.8, pb: 4.4 }];
    const rows = SECT.map((s, si) => {
      const times = Array.from({ length: 12 }, () => +(s.base * (si === 1 ? 1.08 : 0.97) + (rnd() - 0.5) * s.base * 0.28).toFixed(1));
      const min = Math.min(...times);
      return { s, cells: times.map((t) => ({ t, k: t === min ? (t < s.pb ? 'pb' : 'best') : t > s.base * 1.1 ? 'slow' : 'n' })) };
    });
    const CK = { pb: ['var(--s-pb)', 'P', 'Personal best'], best: ['var(--s-best)', 'B', 'Best this shift'], slow: ['var(--s-slow)', 'S', 'Slower than usual'], n: ['', '', 'On pace'] };
    const heat = `<div class="heat" style="grid-template-columns:56px repeat(12,1fr)">
      <span></span>${Array.from({ length: 12 }, (_, i) => `<span style="font-size:10px;color:var(--t3);text-align:center">${i + 1}</span>`).join('')}
      ${rows.map((r) => `<span class="rl">${r.s.n}</span>${r.cells.map((c, i) => `<span class="cell ${c.k === 'n' ? 'n' : ''} pop" style="--i:${i % 6};${c.k !== 'n' ? `background:${CK[c.k][0]}` : ''}" data-tip="<b>${r.s.n}, cycle ${i + 1}</b><br>${c.t} s · ${CK[c.k][2]}">${CK[c.k][1] || c.t}</span>`).join('')}`).join('')}
    </div>`;

    // engine hours per load cycle
    const hpc = intervals.map((d, i) => ({ label: d.label, v: (tel[i + 1].engine - tel[i].engine) / tel[i + 1].cycles }));
    const bw = 380;
    const hbars = `<svg class="chart" viewBox="0 0 520 170" role="img" aria-label="Engine hours per load cycle by interval">
      ${hpc.map((d, i) => {
        const bad = d.v > 1;
        const w = (d.v / 4) * bw;
        return `<g data-tip="<b>${d.label}</b><br>${d.v.toFixed(2)} engine hr per load cycle">
          <text x="0" y="${30 + i * 50}" style="fill:#0B0B0B">${d.label}</text>
          <rect class="growx" style="--i:${i}" x="0" y="${38 + i * 50}" width="${w}" height="12" rx="4" fill="${bad ? '#F6790C' : '#080808'}"/>
          <text class="lbl" x="${w + 8}" y="${48 + i * 50}">${d.v.toFixed(2)} hr</text></g>`;
      }).join('')}
    </svg>`;

    main.innerHTML = `<div class="page">
      ${head('insights', 'Where your fuel and time went.')}
      <div class="grid">
        ${habitsPatterns()}
        <div class="card pcard c3 rise kpi"><span class="eyebrow">Most time waiting</span><b><span data-count="${Math.round(intervals[0].share * 100)}">0</span>%</b><span class="delta"><span class="st crit">High</span>08:00 to 10:00 on 01 May</span></div>
        <div class="card pcard c3 rise kpi" style="--i:1"><span class="eyebrow">Most fuel per load</span><b><span data-count="2" data-dec="1">0</span> L</b><span class="delta"><span class="st crit">4 times normal</span>02 May 09:00</span></div>
        <div class="card pcard c3 rise kpi" style="--i:2"><span class="eyebrow">Belt off</span><b><span data-count="2">0</span> of 4</b><span class="delta"><span class="st crit">Both during long waits</span></span></div>
        <div class="card pcard c3 rise kpi" style="--i:3"><span class="eyebrow">Engine hours per load</span><b><span data-count="3.7" data-dec="1">0</span> hr</b><span class="delta"><span class="st warn">Check this</span>01 May 14:00 to 02 May 09:00</span></div>

        <div class="card pcard c7 rise" style="--i:4"><h3>Fuel per load</h3><div class="sub">Fuel used, divided by loads moved. Red is more than double the normal amount.</div>${lolli}</div>
        <div class="card pcard c5 rise" style="--i:5"><h3>Time spent waiting</h3><div class="sub">Share of engine time when the machine was not working.</div>
          <div style="display:flex;justify-content:space-around;margin-top:18px;flex-wrap:wrap;gap:8px">${intervals.map(donut).join('')}</div>
          <div class="legend" style="justify-content:center;margin-top:14px"><span><i class="sw" style="background:#FFAA02"></i>Idle</span><span><i class="sw" style="background:#080808"></i>Working or travelling</span></div></div>

        <div class="card pcard c7 rise" style="--i:6"><h3>Each load, step by step</h3><div class="sub">Dig, swing, dump and return times for 12 loads this morning.</div>
          <div class="legend" style="margin-top:12px"><span><i class="sw" style="background:var(--s-pb)"></i>P · Personal best</span><span><i class="sw" style="background:var(--s-best)"></i>B · Best this shift</span><span><i class="sw" style="background:var(--s-slow)"></i>S · Slower than usual</span><span><i class="sw" style="background:var(--muted-2)"></i>On pace (seconds)</span></div>
          ${heat}
          <div class="note"><i data-lucide="lightbulb"></i><span><b>Swing is your slowest step.</b> A swing video is lined up for your next break.</span></div></div>
        <div class="card pcard c5 rise" style="--i:7"><h3>Engine hours per load</h3><div class="sub">High means the engine ran but no work got done.</div>${hbars}
          <div class="note"><i data-lucide="search"></i><span><b>3.7 engine hours for just 1 load.</b> Was the machine moving between sites, or is a sensor faulty? Ask your supervisor.</span></div></div>

        ${[
          ['hourglass', 'caution', 'Long waits', 'Waited 55 and 60 min, with only 2 and 1 loads.', 'Uses 4 times more fuel. People take their belt off while waiting.', 'The engine turns off after 5 min of waiting, and a short video plays.'],
          ['armchair', 'crit', 'Starting without a belt', 'The belt was off both times after a long wait.', 'Moving the arm again is when accidents happen.', 'The screen checks your belt as soon as the joystick moves.'],
          ['gauge', 'warn', 'Engine on, no work', '3.7 engine hours for only 1 load.', 'Could be moving between sites, use nobody wrote down, or a bad sensor.', 'Send it to your supervisor with the GPS track.'],
        ].map(([ic, tone, t, what, why, act], i) => `
          <div class="card pcard c4 rise" style="--i:${8 + i}">
            <div style="display:flex;gap:10px;align-items:center"><span class="a-ico ${tone}"><i data-lucide="${ic}"></i></span><h3>${t}</h3></div>
            <div style="margin-top:14px;display:grid;gap:10px;font-size:12.5px">
              <div><span class="eyebrow">What we saw</span><div style="margin-top:4px">${what}</div></div>
              <div><span class="eyebrow">Why it matters</span><div style="margin-top:4px">${why}</div></div>
              <div><span class="eyebrow">What to do</span><div style="margin-top:4px;font-weight:600">${act}</div></div>
            </div>
          </div>`).join('')}
      </div></div>`;
  }

  /* ---------- ESTIMATOR ---------- */
  const PLANNED = { 'Earth Excavation': 60, Trenching: 45, 'Material Loading': 30, Grading: 35, Demolition: 90 };
  function renderEstimator() {
    const tasks = D.tasks;
    // How far each guess was from the real time: the centre line is what really happened,
    // bars go left when the guess was too short and right when it was too long.
    const MAXD = 16;
    const side = (d) => `${Math.abs(d) < 0.5 ? 'spot on' : `${Math.abs(d).toFixed(Math.abs(d) < 10 && d % 1 ? 1 : 0)} min ${d < 0 ? 'short' : 'long'}`}`;
    const bar = (d, cls) => {
      const w = Math.min(50, (Math.abs(d) / MAXD) * 50);
      return `<span class="hc-bar ${cls} ${d < 0 ? 'neg' : 'pos'}${w > 26 ? ' in' : ''}" style="--w:${w}%"><i></i><em>${side(d)}</em></span>`;
    };
    const howClose = `<div class="hc">
      <div class="hc-axis" aria-hidden="true"><span>Guess too short</span><b>Real time</b><span>Guess too long</span></div>
      ${tasks.map((t, i) => {
        const m = D.predict(t.est, t.skill, t.weather, t.age);
        const dp = t.est - t.actual, dm = m - t.actual;
        return `<div class="hc-row rise" style="--i:${i}" data-tip="<b>${t.id} ${t.type}</b><br>Planned ${t.est} · real ${t.actual} · this tool ${m.toFixed(1)} min">
          <div class="hc-job"><b>${t.type}</b><small><i data-lucide="${WICON[t.weather]}"></i>${t.skill} · ${t.age} yr machine</small></div>
          <div class="hc-real"><b>${t.actual}</b><small>min real</small></div>
          <div class="hc-track">${bar(dp, 'plan')}${bar(dm, 'tool')}</div>
        </div>`;
      }).join('')}
      <div class="hc-scale" aria-hidden="true"><span>${MAXD} min</span><span>8</span><span>0</span><span>8</span><span>${MAXD} min</span></div>
    </div>`;

    main.innerHTML = `<div class="page">
      ${head('estimator', 'Pick a job and today\'s conditions.')}
      <div class="grid">
        <div class="card pcard c5 rise">
          <h3>The job</h3><div class="sub">Change anything and the time updates.</div>
          <div class="field"><span>Job</span><div class="opt-row">${Object.keys(PLANNED).map((k) => `<button class="opt${S.est.type === k ? ' active' : ''}" data-e="type" data-v="${k}" type="button">${k}</button>`).join('')}</div></div>
          <div class="field"><span>Weather</span><div class="opt-row">${['Sunny', 'Cloudy', 'Windy', 'Rainy'].map((k) => `<button class="opt${S.est.weather === k ? ' active' : ''}" data-e="weather" data-v="${k}" type="button"><i data-lucide="${WICON[k]}"></i>${k}</button>`).join('')}</div></div>
          <div class="field"><span>Operator level</span><div class="opt-row">${['Beginner', 'Intermediate', 'Expert'].map((k) => `<button class="opt${S.est.skill === k ? ' active' : ''}" data-e="skill" data-v="${k}" type="button">${k}</button>`).join('')}</div></div>
          <div class="field"><span>Machine age · <b id="ageV" style="color:var(--text)">${S.est.age} yr</b></span><input type="range" min="1" max="10" value="${S.est.age}" id="ageIn" aria-label="Machine age in years"/></div>
        </div>
        <div class="card pcard c7 rise" style="--i:1" id="estOut"></div>
        <div class="card pcard c12 rise" style="--i:2">
          <div class="hc-head">
            <div><h3>How close were the guesses?</h3><div class="sub">Your 5 finished jobs. The middle line is the real time.</div></div>
            <div class="hc-score">
              <div class="hc-s plan"><span><i class="hc-key plan"></i>The plan</span><b><span data-count="${(D.plannerError * 100).toFixed(1)}" data-dec="1">0</span>%</b><small>off on average</small></div>
              <div class="hc-s tool"><span><i class="hc-key tool"></i>This tool</span><b><span data-count="${(D.modelError * 100).toFixed(1)}" data-dec="1">0</span>%</b><small>off on average</small></div>
            </div>
          </div>
          ${howClose}
          <div class="note"><i data-lucide="info"></i><span>The tool learns from every job you finish, so it gets closer over time. It was fitted on these same 5 jobs, so treat 2.4% as a best case.</span></div>
        </div>
      </div></div>`;
    renderEstOut();
    const page = main.querySelector('.page');
    page.addEventListener('click', (e) => {
      const b = e.target.closest('[data-e]');
      if (!b) return;
      S.est[b.dataset.e] = b.dataset.v;
      $$(`[data-e="${b.dataset.e}"]`).forEach((o) => o.classList.toggle('active', o === b));
      renderEstOut();
    });
    $('#ageIn').addEventListener('input', (e) => { S.est.age = +e.target.value; $('#ageV').textContent = `${S.est.age} yr`; renderEstOut(); });
  }
  function renderEstOut() {
    if (window.LIVE?.estOut?.(PLANNED[S.est.type])) return; // LIVE: trained model instead of the formula
    const { type, weather, skill, age } = S.est;
    const plan = PLANNED[type];
    const fs = D.factors.skill[skill], fw = D.factors.weather[weather], fa = D.factors.age(age);
    const pred = plan * fs * fw * fa;
    const lo = pred * 0.92, hi = pred * 1.08, max = Math.max(plan, hi) * 1.25;
    const chip = (v, l) => { const d = v; return Math.abs(d) < 0.05 ? '' : `<span class="factor" style="${d < 0 ? 'background:#E3F4EA;color:var(--ok-ink)' : ''}">${d > 0 ? '+' : ''}${d.toFixed(1)} min ${l}</span>`; };
    const out = $('#estOut');
    out.innerHTML = `
      <h3>Expected time</h3><div class="sub">${type} · ${weather} · ${skill} · ${age} yr machine</div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:18px">
        <b class="num" style="font-size:88px;line-height:.9;font-weight:700" data-count="${pred.toFixed(0)}">0</b><span style="font:500 16px var(--f-ui);color:var(--t2)">minutes</span>
      </div>
      <div style="font-size:13px;color:var(--t2);margin-top:6px">Between <b style="color:var(--text)">${Math.round(lo)} and ${Math.round(hi)} min</b> · the plan says ${plan} min</div>
      <div class="range" style="margin-top:22px;height:30px">
        <div class="range-track" style="top:12px"></div>
        <div class="range-band" style="left:${pct(lo, 0, max)}%;width:${pct(hi, 0, max) - pct(lo, 0, max)}%;top:6px;height:18px;border-radius:9px"></div>
        <span class="range-tick plan" style="left:${pct(plan, 0, max)}%;top:2px;height:26px" data-tip="Planned ${plan} min"></span>
        <span class="range-tick pred" style="left:${pct(pred, 0, max)}%;top:2px;height:26px" data-tip="Predicted ${pred.toFixed(1)} min"></span>
      </div>
      <div class="range-scale"><span>0</span><span>${Math.round(max / 2)}</span><span>${Math.round(max)} min</span></div>
      <div class="factors" style="margin-top:16px">
        ${chip(plan * (fs - 1), 'for experience')}${chip(plan * fs * (fw - 1), `for ${weather.toLowerCase()} weather`)}${chip(plan * fs * fw * (fa - 1), 'for an older machine')}
        ${fs === 1 && fw === 1 && fa === 1 ? '<span class="factor" style="background:var(--chip);color:var(--t2)">No extra time</span>' : ''}
      </div>
      <div class="note"><i data-lucide="sigma"></i><span><b>How we worked it out:</b> plan ${plan} min × level ${fs} × weather ${fw} × machine age ${fa} = ${pred.toFixed(1)} min</span></div>`;
    icons(); countUp(out);
  }

  /* ---------- REPORTS (SRS 3.4 incident recording, 5 offline first) ---------- */
  // two taps after the hold: what happened, then how bad
  const REP_TYPES = [['Near miss', 'triangle-alert'], ['Hit something', 'construction'], ['Machine fault', 'wrench'], ['Someone hurt', 'heart-pulse'], ['Other', 'message-square']];
  const REP_SEV = [['Minor', 'minor', 'warn'], ['Serious', 'serious', 'crit'], ['Critical', 'critical', 'crit']];
  function renderIncidents() {
    const stTone = { Open: 'crit', Checking: 'warn', 'Talked through': 'ok', Closed: 'ok', New: 'warn' };
    const snapRow = (x) => x.snap ? `
      <div class="snap">
        <div><span>Who</span><b>${x.who || D.operator.name}</b></div>
        <div><span>Machine</span><b>${x.machine || 'EXC001'}</b></div>
        <div><span>Engine hours</span><b>${x.snap.engine}</b></div>
        <div><span>Belt</span><b class="${x.snap.belt === 'Off' ? 'bad' : ''}">${x.snap.belt}</b></div>
        <div><span>Machine was</span><b>${x.snap.state}</b></div>
        <div><span>Fuel</span><b>${x.snap.fuel}</b></div>
        <div><span>Where</span><b>${x.snap.place}</b></div>
        <div><span>Sent</span><b class="${x.synced === false ? 'wait' : ''}">${x.synced === false ? 'On tablet, waiting for signal' : 'Yes'}</b></div>
      </div>` : '<div class="snap-none">Recorded before machine snapshots were added.</div>';
    main.innerHTML = `<div class="page">
      ${head('incidents', 'Saved on the tablet first, sent when there is signal.')}
      <div class="grid">
        <div class="card pcard c8 rise">
          <div class="plan-head"><div><h3>All reports</h3><div class="sub">${S.incidents.length} reports · ${S.pending ? `<b class="late-txt">${S.pending} waiting to send</b>` : 'all sent'}</div></div></div>
          <div class="reports">${S.incidents.map((x, i) => `
            <details class="rep${x.fresh && i === 0 ? ' new' : ''}" ${x.fresh && i === 0 ? 'open' : ''}>
              <summary>
                <span class="a-ico ${SEV[x.sev][0]}"><i data-lucide="${SEV[x.sev][1]}"></i></span>
                <span class="rep-main"><b>${x.type}</b><small>${x.time} · ${x.src}</small></span>
                ${x.synced === false ? '<span class="tag late"><i data-lucide="cloud-off" style="width:12px;height:12px"></i>Not sent</span>' : ''}
                <span class="st ${stTone[x.status] || 'warn'}">${x.status}</span>
                <i data-lucide="chevron-down" class="rep-chev"></i>
              </summary>
              ${snapRow(x)}
            </details>`).join('')}</div>
        </div>
        <div class="card pcard c4 rise" style="--i:1">
          <h3>Report something</h3>
          ${!S.rep ? `<div class="sub">Hold, then two taps. The machine's readings go with it.</div>
          <div class="hold-stage">
            <button class="hold" id="holdBtn" type="button" aria-label="Hold to report">
              <svg viewBox="0 0 108 108" aria-hidden="true"><circle class="bg" cx="54" cy="54" r="52" fill="none" stroke-width="5"/><circle class="fg" cx="54" cy="54" r="52" fill="none" stroke-width="5" stroke-linecap="round"/></svg>
              <span class="hold-face"><i data-lucide="mic"></i><b>HOLD</b><small>1 sec</small></span>
            </button>
            <span class="hold-hint">Or double-tap the joystick thumb button</span>
          </div>
          <div class="rep-attach"><span class="ra-k">Sent with your report</span>
            ${(() => { const sn = snapshot(); return [['user-round', 'Who', D.operator.name], ['truck', 'Machine', 'EXC001'], ['armchair', 'Belt', sn.belt], ['gauge', 'Engine', sn.engine], ['map-pin', 'Where', sn.place.split(',')[0]], ['activity', 'Doing', sn.state]].map(([ic, k, v]) => `<div><i data-lucide="${ic}"></i><span>${k}</span><b>${v}</b></div>`).join(''); })()}
          </div>` : `<div class="rep-pick">
            <div class="rp-step"><span class="${S.rep === 'what' ? 'on' : 'done'}">1</span>What happened?${S.rep !== 'what' ? ` <b>${S.rep}</b>` : ''}</div>
            ${S.rep === 'what' ? `<div class="rp-grid">${REP_TYPES.map(([t, ic]) => `<button type="button" data-rtype="${t}"><i data-lucide="${ic}"></i>${t}</button>`).join('')}</div>`
              : `<div class="rp-step"><span class="on">2</span>How bad?</div>
              <div class="rp-grid sev">${REP_SEV.map(([t, c]) => `<button type="button" class="${c}" data-rsev="${t}">${t}</button>`).join('')}</div>`}
            <button class="linkbtn" type="button" id="repCancel">Cancel</button>
          </div>`}
          <div class="sync-box ${S.offline ? 'off' : ''}"><span class="sb-ico"><i data-lucide="${S.offline ? 'wifi-off' : 'wifi'}"></i></span><div><b>${S.offline ? 'No signal' : 'Connected'}</b><small>${S.offline ? `${S.pending} report${S.pending === 1 ? '' : 's'} saved on the tablet. They send when signal is back.` : 'Reports send straight away.'}</small></div></div>
        </div>
      </div></div>`;
    bindHold(() => { S.rep = 'what'; renderIncidents(); icons(); });
    main.querySelector('.page').addEventListener('click', (e) => {
      const t = e.target.closest('[data-rtype]');
      if (t) { S.rep = t.dataset.rtype; renderIncidents(); icons(); return; }
      const v = e.target.closest('[data-rsev]');
      if (v) {
        const sev = REP_SEV.find(([n]) => n === v.dataset.rsev);
        addIncident(`${S.rep} · ${sev[0]}`, 'You', sev[2]);
        S.rep = null;
        toast(S.offline ? 'Report saved on the tablet. It will send when there is signal.' : 'Report saved. Your supervisor can see it.', 'check');
        renderIncidents(); icons(); return;
      }
      if (e.target.closest('#repCancel')) { S.rep = null; renderIncidents(); icons(); }
    });
  }

  /* ---------- MACHINE (SRS 3.2: part health by severity, same colours as the 3D model) ---------- */
  const PARTS = [
    { ic: 'droplets', n: 'Boom and hydraulics', st: 'crit', l: 'Fault', wear: 31, what: 'Boom cylinder is leaking oil. Pressure is low and the oil is running hot.', todo: 'No heavy lifts. Call the mechanic today.' },
    { ic: 'tractor', n: 'Tracks', st: 'warn', l: 'Check soon', wear: 64, what: 'Tracks are 64% worn. The left track is a bit loose.', todo: 'Tighten the left track at the next stop.' },
    { ic: 'shovel', n: 'Bucket and teeth', st: 'ok', l: 'OK', wear: 18, what: 'Teeth 18% worn.', todo: 'Turn the teeth round in about 40 hours.' },
    { ic: 'cog', n: 'Engine', st: 'ok', l: 'OK', wear: 22, what: 'Running normally.', todo: 'Oil change at 1,600 hours.' },
    { ic: 'thermometer', n: 'Cooling', st: 'ok', l: 'OK', wear: 12, what: 'Running normally.', todo: 'Clean the radiator in rainy season.' },
    { ic: 'armchair', n: 'Cab and seatbelt', st: 'ok', l: 'OK', wear: 8, what: 'Belt switch working.', todo: 'Nothing needed.' },
  ];
  // Part by part: health score and two readings per part over the last 10 shifts (sample values).
  // lo..hi is the normal range, lim the limit; bad says which way is bad ('up' or 'down').
  const PART_HEALTH = [
    { k: 'hydraulics', hp: 38, reads: [
      { n: 'Boom pressure', u: 'bar', v: [338, 336, 335, 331, 324, 316, 301, 289, 274, 262], lo: 310, hi: 350, lim: 280, bad: 'down' },
      { n: 'Oil temperature', u: '°C', v: [61, 62, 60, 63, 64, 66, 69, 72, 75, 78], lo: 50, hi: 70, lim: 85, bad: 'up' } ] },
    { k: 'undercarriage', hp: 52, reads: [
      { n: 'Track wear', u: '%', v: [55, 56, 57, 58, 59, 60, 61, 62, 63, 64], lo: 0, hi: 60, lim: 80, bad: 'up' },
      { n: 'Left track sag', u: 'mm', v: [34, 35, 36, 38, 39, 42, 44, 47, 50, 52], lo: 20, hi: 40, lim: 60, bad: 'up' } ] },
    { k: 'bucket', hp: 82, reads: [
      { n: 'Teeth wear', u: '%', v: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18], lo: 0, hi: 40, lim: 60, bad: 'up' },
      { n: 'Time per load', u: 'sec', v: [22, 21, 23, 21, 20, 22, 21, 22, 21, 21], lo: 18, hi: 25, lim: 30, bad: 'up' } ] },
    { k: 'engine', hp: 91, reads: [
      { n: 'Oil pressure', u: 'bar', v: [4.1, 4.2, 4.1, 4.0, 4.2, 4.1, 4.1, 4.0, 4.1, 4.1], lo: 3.5, hi: 4.8, lim: 2.5, bad: 'down' },
      { n: 'Engine load', u: '%', v: [62, 58, 66, 60, 55, 63, 61, 57, 64, 59], lo: 40, hi: 80, lim: 95, bad: 'up' } ] },
    { k: 'engine', hp: 88, reads: [
      { n: 'Coolant temperature', u: '°C', v: [86, 87, 88, 86, 89, 90, 88, 89, 91, 90], lo: 80, hi: 95, lim: 105, bad: 'up' },
      { n: 'Fan speed', u: '%', v: [48, 50, 52, 49, 55, 57, 54, 56, 60, 58], lo: 30, hi: 70, lim: 90, bad: 'up' } ] },
    { k: 'cab', hp: 96, reads: [
      { n: 'Belt on while working', u: '%', v: [100, 100, 96, 100, 100, 92, 100, 100, 88, 100], lo: 95, hi: 100, lim: 80, bad: 'down' },
      { n: 'Cab temperature', u: '°C', v: [26, 27, 25, 28, 27, 26, 29, 28, 27, 26], lo: 20, hi: 30, lim: 35, bad: 'up' } ] },
  ];
  const stOf = (r) => { const x = r.v[r.v.length - 1]; if (r.bad === 'up' ? x >= r.lim : x <= r.lim) return 'crit'; return x < r.lo || x > r.hi ? 'warn' : 'ok'; };
  const STW = { ok: 'Normal', warn: 'Outside normal', crit: 'Past the limit' };

  // a semicircle gauge, like the needle dials in the cab
  function healthGauge(hp, st) {
    const R = 70, C = Math.PI * R, off = C * (1 - hp / 100);
    const ticks = [0, 25, 50, 75, 100].map((t) => {
      const a = Math.PI * (1 - t / 100);
      return `<line class="hg-tick" x1="${(90 + 58 * Math.cos(a)).toFixed(1)}" y1="${(94 - 58 * Math.sin(a)).toFixed(1)}" x2="${(90 + 52 * Math.cos(a)).toFixed(1)}" y2="${(94 - 52 * Math.sin(a)).toFixed(1)}"/>`;
    }).join('');
    return `<svg class="hg ${st}" viewBox="0 0 180 104" role="img" aria-label="Health ${hp} out of 100">
      <path class="hg-track" d="M20 94 A70 70 0 0 1 160 94"/>
      <path class="hg-val" d="M20 94 A70 70 0 0 1 160 94" stroke-dasharray="${C.toFixed(1)}" style="--c:${C.toFixed(1)};--off:${off.toFixed(1)}"/>
      ${ticks}
      <text class="hg-num" x="90" y="84" text-anchor="middle">${hp}</text>
      <text class="hg-of" x="90" y="101" text-anchor="middle">health</text></svg>`;
  }

  // reading over the last 10 shifts, with the normal range shaded and the limit dashed
  function readingChart(r) {
    const W = 320, H = 132, pl = 34, pr = 12, pt = 14, pb = 22;
    const all = r.v.concat([r.lo, r.hi, r.lim]);
    let a = Math.min(...all), b = Math.max(...all);
    const pad = (b - a) * 0.1 || 1; a -= pad; b += pad;
    const X = (i) => pl + (i / (r.v.length - 1)) * (W - pl - pr), Y = (v) => pt + (1 - (v - a) / (b - a)) * (H - pt - pb);
    const st = stOf(r), last = r.v[r.v.length - 1], dp = last % 1 ? 1 : 0;
    const pts = r.v.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return `<figure class="rc ${st}">
      <figcaption><span>${r.n}</span><b class="num">${last.toFixed(dp)}<small>${r.u}</small></b><em>${STW[st]}</em></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${r.n}, last 10 shifts, now ${last} ${r.u}">
        <rect class="rc-band" x="${pl}" y="${Y(r.hi).toFixed(1)}" width="${W - pl - pr}" height="${Math.max(1, Y(r.lo) - Y(r.hi)).toFixed(1)}"/>
        <text class="rc-ax" x="${pl - 6}" y="${(Y(r.hi) + 4).toFixed(1)}" text-anchor="end">${r.hi}</text>
        <text class="rc-ax" x="${pl - 6}" y="${(Y(r.lo) + 4).toFixed(1)}" text-anchor="end">${r.lo}</text>
        <line class="rc-lim" x1="${pl}" x2="${W - pr}" y1="${Y(r.lim).toFixed(1)}" y2="${Y(r.lim).toFixed(1)}"/>
        <text class="rc-limt" x="${pl + 4}" y="${(Y(r.lim) + (r.bad === 'up' ? -5 : 12)).toFixed(1)}">Limit ${r.lim}</text>
        <polyline class="rc-line" points="${pts}" pathLength="1"/>
        ${r.v.map((v, i) => `<circle class="${i === r.v.length - 1 ? 'rc-now' : 'rc-pt'}" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${i === r.v.length - 1 ? 5 : 2.5}"/>`).join('')}
        <text class="rc-ax" x="${pl}" y="${H - 4}">10 shifts ago</text><text class="rc-ax" x="${W - pr}" y="${H - 4}" text-anchor="end">Today</text>
      </svg></figure>`;
  }

  function partDetail(i) {
    const p = PARTS[i], h = PART_HEALTH[i];
    return `<div class="pd-top">
        ${healthGauge(h.hp, p.st)}
        <div class="pd-txt"><span class="pd-st ${p.st}">${p.l}</span><h4>${p.n}</h4><p>${p.what}</p><p class="mh-do">${p.todo}</p></div>
      </div>
      <div class="pd-charts">${h.reads.map(readingChart).join('')}</div>
      <div class="pd-key"><span><i class="kb"></i>Normal range</span><span><i class="kl"></i>Limit</span><span class="pd-sample">Sample readings</span></div>`;
  }
  function renderMachine() {
    const eng = 1530.2, next = 1600.2, since = 1350.2;
    const fix = PARTS.filter((p) => p.st === 'crit'), check = PARTS.filter((p) => p.st === 'warn'), fine = PARTS.filter((p) => p.st === 'ok');
    const item = (p) => `<div class="mh-item"><b>${p.n}</b><p>${p.what}</p><p class="mh-do">${p.todo}</p></div>`;
    main.innerHTML = `<div class="page">
      ${head('machine', 'EXC001, 20-tonne excavator.')}
      <div class="grid">
        <div class="card pcard c7 rise mh-map-card">
          <h3>Machine health</h3>
          <div class="mh-3d" id="mh3d"><canvas id="mhCanvas" aria-label="3D excavator coloured by part condition"></canvas><span class="mh-hint"><i data-lucide="move-horizontal"></i>Drag to turn</span></div>
          <div class="mh-key"><span class="k crit">Fix now</span><span class="k warn">Check soon</span><span class="k ok">Fine</span></div>
        </div>
        <div class="card pcard c5 rise mh-list" style="--i:1">
          <section class="mh-sec crit">
            <h4><i data-lucide="octagon-alert"></i>Fix now</h4>
            ${fix.map(item).join('')}
            <button class="btn dark mh-call" type="button" data-toast="Calling the site mechanic…"><i data-lucide="phone"></i>Call the mechanic</button>
          </section>
          <section class="mh-sec warn">
            <h4><i data-lucide="triangle-alert"></i>Check soon</h4>
            ${check.map(item).join('')}
          </section>
          <section class="mh-sec ok">
            <h4><i data-lucide="circle-check"></i>Fine</h4>
            <p class="mh-fine">${fine.map((p) => p.n).join(' · ')}</p>
          </section>
        </div>
        <div class="card pcard c12 rise mh-parts" style="--i:2">
          <h3>Part by part</h3>
          <div class="pp">
            <div class="pp-list" role="tablist" aria-label="Parts">
              ${PARTS.map((p, i) => `<button class="pp-row ${p.st}${i === S.mhPart ? ' on' : ''}" role="tab" aria-selected="${i === S.mhPart}" data-part="${i}" type="button">
                <span class="pp-n">${p.n}</span><span class="pp-hp num">${PART_HEALTH[i].hp}</span>
                <span class="pp-bar" aria-hidden="true">${Array.from({ length: 10 }, (_, j) => `<i class="${j < Math.round(PART_HEALTH[i].hp / 10) ? 'f' : ''}"></i>`).join('')}</span>
              </button>`).join('')}
            </div>
            <div class="pp-detail" id="ppDetail" role="tabpanel">${partDetail(S.mhPart)}</div>
          </div>
        </div>
        <div class="card pcard c12 rise mh-service" style="--i:3">
          <div class="mh-svc-num"><span class="eyebrow">Next service</span><b>In <span data-count="${Math.round(next - eng)}">0</span> hours</b><small>At ${fmt(next, 0)} engine hours · now ${fmt(eng, 1)}</small></div>
          <div class="mh-svc-bar"><div><i class="growx" style="width:${pct(eng, since, next)}%"></i></div><span><span>Last service</span><span>Next service</span></span></div>
          <button class="btn outline" type="button" data-go="home"><i data-lucide="house"></i>Back to Home</button>
        </div>
      </div></div>`;
    // the same 3D excavator as Home, framed to fit this card, faults in red and checks in amber
    if (Machine3D.mount($('#mh3d'), $('#mhCanvas'), { fit: true })) {
      Machine3D.onFrame(() => {});
      Machine3D.setSelected(PART_HEALTH[S.mhPart].k);
      Machine3D.start();
    }
    // pick a part: its readings show, and it glows green on the model
    $('.pp-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-part]');
      if (!b) return;
      S.mhPart = +b.dataset.part;
      $$('.pp-row').forEach((r) => { const on = r === b; r.classList.toggle('on', on); r.setAttribute('aria-selected', on); });
      $('#ppDetail').innerHTML = partDetail(S.mhPart);
      Machine3D.setSelected(PART_HEALTH[S.mhPart].k);
    });
  }

  /* ---------- LEARN: CONTROLS (SRS 3.5: tappable cab layout, each control linked to a video) ---------- */
  const CONTROLS = [
    { id: 'ljoy', n: 'Left joystick', x: 25, y: 56, vid: 'hRLb8oAKX30', does: 'Swings the upper body left and right, and moves the stick in and out.', care: 'Check your swing area first. Keep your moves smooth, no jerks.' },
    { id: 'rjoy', n: 'Right joystick', x: 75, y: 56, vid: 'n24LwkpgBSM', does: 'Raises and lowers the boom, and curls the bucket in and out.', care: 'Never swing a loaded bucket over people or over a truck cab.' },
    { id: 'travel', n: 'Travel levers and pedals', x: 50, y: 22, vid: 'hRLb8oAKX30', does: 'Drive the tracks forward and back, and steer.', care: 'Check which way the tracks face. If they point backwards, the levers work the other way round.' },
    { id: 'lock', n: 'Hydraulic lock lever', x: 13, y: 42, vid: 'CJM_qHYXJDA', does: 'Locks every control so nothing moves by accident.', care: 'Pull it up every time you stop, get in or get out.' },
    { id: 'belt', n: 'Seatbelt', x: 50, y: 71, vid: 'CJM_qHYXJDA', does: 'Keeps you in the seat if the machine tips.', care: 'Buckle up before you start, and keep it on while you wait too.' },
    { id: 'start', n: 'Start button and Operator ID', x: 81, y: 71.4, vid: 'KwvguKaFliU', does: 'Starts the engine after you sign in with your ID.', care: 'The engine will not start until your seatbelt is on.' },
    { id: 'throttle', n: 'Engine speed dial', x: 74.3, y: 83.8, vid: 's22FKB2Zrnk', does: 'Sets how fast the engine runs.', care: 'Turn it down while you wait. Waiting at full speed wastes fuel.' },
    { id: 'monitor', n: 'Monitor', x: 80, y: 21, vid: 'uPlt7seVi9o', does: 'Shows machine health, cameras and grade guidance.', care: 'Look at it only when the machine is still.' },
    { id: 'estop', n: 'Emergency stop', x: 80.7, y: 44.3, vid: 'CJM_qHYXJDA', does: 'Shuts the engine down straight away.', care: 'For emergencies only. Know where it is before you start work.' },
    { id: 'horn', n: 'Horn', x: 31, y: 44.8, vid: 'CJM_qHYXJDA', does: 'Warns people and trucks nearby.', care: 'Sound it before you travel or swing, every time.' },
  ];
  function renderControls() {
    const c = CONTROLS.find((x) => x.id === S.ctrl) || CONTROLS[1];
    const v = D.videos.find((x) => x.id === c.vid);
    const vids = [v, ...D.videos.filter((x) => x.id !== v.id)];
    main.innerHTML = `<div class="page fit">
      ${head('training', 'Tap a control. Each one has a short Cat video.')}
      <div class="grid">
        <div class="card pcard c7 rise">
          <h3>Your cab, from above</h3>
          <div class="cab-stage" id="cabStage"><div class="cab-map" id="cabMap">
            <svg viewBox="0 0 600 420" aria-hidden="true" class="cab-svg">
              <defs>
                <linearGradient id="cgFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E2E2C"/><stop offset="1" stop-color="#171716"/></linearGradient>
                <linearGradient id="cgGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D6E6EF"/><stop offset=".5" stop-color="#A9C1CF"/><stop offset="1" stop-color="#C9DCE6"/></linearGradient>
                <linearGradient id="cgMat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3C3C3A"/><stop offset="1" stop-color="#2A2A28"/></linearGradient>
                <pattern id="cgRibs" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="none"/><path d="M0 7 H14" stroke="#1E1E1D" stroke-width="3"/></pattern>
                <radialGradient id="cgSeat" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#55544F"/><stop offset="1" stop-color="#2B2B29"/></radialGradient>
                <linearGradient id="cgConsole" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4A4A47"/><stop offset=".5" stop-color="#5C5C58"/><stop offset="1" stop-color="#42423F"/></linearGradient>
                <radialGradient id="cgGrip" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#4E4E4B"/><stop offset="1" stop-color="#121211"/></radialGradient>
                <linearGradient id="cgYellow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFD43B"/><stop offset="1" stop-color="#E0A800"/></linearGradient>
                <filter id="cgShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".4"/></filter>
              </defs>
              <!-- cab shell, windows and floor mat -->
              <rect x="30" y="10" width="540" height="400" rx="46" fill="url(#cgFrame)"/>
              <rect x="44" y="24" width="512" height="372" rx="36" fill="url(#cgGlass)"/>
              <path d="M60 60 L540 60" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
              <rect x="44" y="92" width="10" height="120" fill="#1B1B1A"/><rect x="546" y="92" width="10" height="120" fill="#1B1B1A"/>
              <rect x="62" y="48" width="476" height="332" rx="24" fill="url(#cgMat)"/>
              <rect x="62" y="48" width="476" height="332" rx="24" fill="url(#cgRibs)" opacity=".55"/>
              <!-- Cat logo moulded into the floor mat -->
              <rect x="104" y="66" width="92" height="66" rx="10" fill="#2F2F2D" stroke="#1E1E1C" stroke-width="2"/>
              <image href="assets/cat-logo-white.png" x="118" y="77" width="64" height="39" opacity=".32" preserveAspectRatio="xMidYMid meet"/>
              <!-- travel pedals and levers -->
              <g filter="url(#cgShadow)">
                <rect x="222" y="106" width="58" height="40" rx="7" fill="#5A5A56"/><rect x="320" y="106" width="58" height="40" rx="7" fill="#5A5A56"/>
                <path d="M228 116 H274 M228 126 H274 M228 136 H274 M326 116 H372 M326 126 H372 M326 136 H372" stroke="#3A3A37" stroke-width="3"/>
                <rect x="252" y="58" width="18" height="58" rx="9" fill="#222220"/><rect x="330" y="58" width="18" height="58" rx="9" fill="#222220"/>
                <circle cx="261" cy="60" r="12" fill="url(#cgGrip)"/><circle cx="339" cy="60" r="12" fill="url(#cgGrip)"/>
              </g>
              <!-- monitor with the assistant on screen -->
              <g filter="url(#cgShadow)">
                <rect x="416" y="50" width="120" height="74" rx="9" fill="#0F0F0E"/>
                <rect x="424" y="57" width="104" height="60" rx="4" fill="#12181C"/>
                <image href="assets/cat-logo-white.png" x="429" y="61" width="22" height="13.3" preserveAspectRatio="xMidYMid meet"/><rect x="456" y="65" width="26" height="5" rx="2" fill="#FFCD11"/><rect x="430" y="76" width="92" height="4" rx="2" fill="#3A4A52"/><rect x="430" y="85" width="70" height="4" rx="2" fill="#3A4A52"/>
                <rect x="430" y="96" width="30" height="14" rx="3" fill="#2FB36A"/><rect x="466" y="96" width="30" height="14" rx="3" fill="#3A4A52"/>
              </g>
              <!-- hydraulic lock lever (yellow) by the door -->
              <g filter="url(#cgShadow)">
                <rect x="70" y="130" width="16" height="96" rx="8" fill="url(#cgYellow)"/>
                <rect x="66" y="126" width="24" height="26" rx="8" fill="#1A1A19"/>
              </g>
              <!-- consoles and joysticks -->
              <g filter="url(#cgShadow)">
                <rect x="96" y="166" width="112" height="206" rx="22" fill="url(#cgConsole)"/>
                <rect x="392" y="166" width="112" height="206" rx="22" fill="url(#cgConsole)"/>
                <rect x="106" y="286" width="92" height="74" rx="14" fill="#34342F" opacity=".7"/>
                <rect x="402" y="310" width="92" height="50" rx="12" fill="#34342F" opacity=".7"/>
              </g>
              <circle cx="150" cy="240" r="34" fill="#1B1B1A"/><circle cx="150" cy="240" r="26" fill="#262624"/>
              <circle cx="450" cy="240" r="34" fill="#1B1B1A"/><circle cx="450" cy="240" r="26" fill="#262624"/>
              <g filter="url(#cgShadow)">
                <ellipse cx="150" cy="236" rx="17" ry="23" fill="url(#cgGrip)"/><ellipse cx="450" cy="236" rx="17" ry="23" fill="url(#cgGrip)"/>
                <circle cx="143" cy="223" r="3.6" fill="#FFCD11"/><circle cx="156" cy="224" r="3.6" fill="#D61D1D"/>
                <circle cx="444" cy="224" r="3.6" fill="#D61D1D"/><circle cx="457" cy="223" r="3.6" fill="#FFCD11"/>
              </g>
              <!-- emergency stop: red mushroom button on a yellow plate, right console -->
              <g filter="url(#cgShadow)">
                <rect x="469" y="171" width="30" height="30" rx="6" fill="url(#cgYellow)"/>
                <circle cx="484" cy="186" r="11" fill="#9E1010"/><circle cx="484" cy="186" r="9" fill="#D61D1D"/>
                <ellipse cx="481" cy="182.5" rx="4" ry="2.4" fill="#fff" opacity=".35"/>
              </g>
              <!-- horn button, left console -->
              <g filter="url(#cgShadow)">
                <circle cx="186" cy="188" r="12" fill="#1A1A19"/><circle cx="186" cy="188" r="9" fill="#3A3A37"/>
                <path d="M182 185.5 h2.5 l4-3 v11 l-4-3 H182 Z" fill="#E8E8E4"/>
              </g>
              <!-- keypad, start button and engine speed dial on the right console -->
              ${[0, 1, 2].map((c) => [0, 1].map((r) => `<rect x="${408 + c * 20}" y="${316 + r * 18}" width="15" height="12" rx="3" fill="#1E1E1C"/>`).join('')).join('')}
              <circle cx="486" cy="300" r="15" fill="#1A1A19"/><circle cx="486" cy="300" r="11" fill="#D61D1D"/><path d="M486 294 V300 M481 296.5 A7 7 0 1 0 491 296.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
              <circle cx="446" cy="352" r="18" fill="#1A1A19"/><circle cx="446" cy="352" r="13" fill="#3A3A37"/>
              ${Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; return `<line x1="${446 + 13 * Math.cos(a)}" y1="${352 + 13 * Math.sin(a)}" x2="${446 + 17 * Math.cos(a)}" y2="${352 + 17 * Math.sin(a)}" stroke="#555551" stroke-width="2"/>`; }).join('')}
              <line x1="446" y1="352" x2="446" y2="341" stroke="#FFCD11" stroke-width="3" stroke-linecap="round"/>
              <!-- seat with headrest, stitching and lap belt -->
              <g filter="url(#cgShadow)">
                <rect x="264" y="370" width="72" height="22" rx="10" fill="#2B2B29"/>
                <rect x="232" y="306" width="136" height="70" rx="20" fill="url(#cgSeat)"/>
                <rect x="236" y="196" width="128" height="118" rx="24" fill="url(#cgSeat)"/>
              </g>
              <path d="M258 214 V296 M342 214 V296 M254 320 H346" stroke="#1E1E1C" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>
              <image href="assets/cat-logo-white.png" x="276" y="222" width="48" height="29" opacity=".22" preserveAspectRatio="xMidYMid meet"/>
              <path d="M238 292 Q300 306 362 292" stroke="#E07B00" stroke-width="10" fill="none" stroke-linecap="round"/>
              <rect x="288" y="288" width="24" height="18" rx="4" fill="#C9CCCF" stroke="#8C9094" stroke-width="1.5"/>
            </svg>
            ${CONTROLS.map((x, i) => `<button class="cm-pin${x.id === c.id ? ' on' : ''}" type="button" data-ctrl="${x.id}" style="left:${x.x}%;top:${x.y}%" aria-label="${x.n}"><span>${i + 1}</span></button>`).join('')}
          </div></div>
        </div>
        <div class="card pcard c5 rise ctrl-card" style="--i:1">
          <span class="eyebrow">Control ${CONTROLS.indexOf(c) + 1} of ${CONTROLS.length}</span>
          <h2 class="ctrl-name">${c.n}</h2>
          <div class="ctrl-row"><span class="ctrl-k"><i data-lucide="hand"></i>What it does</span><p>${c.does}</p></div>
          <div class="ctrl-row care"><span class="ctrl-k"><i data-lucide="triangle-alert"></i>Be careful</span><p>${c.care}</p></div>
          <div class="cv-head"><h3>Cat videos</h3><span>${S.watched.size} of ${D.videos.length} watched</span></div>
          <div class="cv-list" id="cvList">${vids.map((x) => {
            const nums = CONTROLS.map((k, i) => (k.vid === x.id ? i + 1 : 0)).filter(Boolean);
            const mine = x.id === v.id, seen = S.watched.has(x.id);
            return `<div class="cv${mine ? ' mine' : ''}" data-nums="${nums.join(',')}">
              <button class="cv-main" type="button" data-go="video/${x.id}">
                <span class="cv-thumb"><img src="https://i.ytimg.com/vi/${x.id}/mqdefault.jpg" alt="" loading="lazy" /><span class="playb"><i data-lucide="play"></i></span>${seen ? '<span class="cv-seen"><i data-lucide="check"></i></span>' : ''}</span>
                <span class="cv-txt"><small>${mine ? 'For this control' : x.topic}</small><b>${x.title.replace(/^Cat® /, '')}</b></span>
              </button>
              <span class="cv-nums">${nums.length ? nums.map((n) => `<button class="cv-n${n === CONTROLS.indexOf(c) + 1 ? ' on' : ''}" type="button" data-ctrl="${CONTROLS[n - 1].id}" aria-label="Show ${CONTROLS[n - 1].n}">${n}</button>`).join('') : '<em>Whole machine</em>'}</span>
            </div>`;
          }).join('')}</div>
        </div>
      </div></div>`;
    fitCab();
    const keepScroll = $('#cvList');
    if (keepScroll && S.cvScroll) keepScroll.scrollTop = S.cvScroll;
    main.querySelector('.page').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ctrl]');
      if (b) { S.cvScroll = b.closest('#cvList') ? $('#cvList').scrollTop : 0; S.ctrl = b.dataset.ctrl; renderControls(); icons(); }
    });
    // point at a video: the controls it covers light up on the cab
    const pins = $$('.cm-pin');
    $$('.cv').forEach((row) => {
      const nums = row.dataset.nums ? row.dataset.nums.split(',').map(Number) : [];
      row.addEventListener('pointerenter', () => pins.forEach((p, i) => p.classList.toggle('hint', nums.includes(i + 1))));
      row.addEventListener('pointerleave', () => pins.forEach((p) => p.classList.remove('hint')));
    });
  }

  // the cab drawing takes whatever space is left, keeping its shape, so the page never needs to scroll
  function fitCab() {
    const st = $('#cabStage'), m = $('#cabMap');
    if (!st || !m) return;
    const w = Math.min(st.clientWidth, st.clientHeight * (600 / 420));
    m.style.width = `${Math.max(240, w)}px`;
  }
  addEventListener('resize', fitCab);

  /* ---------- LEARN: HABITS (SRS 3.6: patterns against the operator's own baseline, not instant alerts) ---------- */
  function habitsPatterns() {
    const levelOf = (base, now, higherIsWorse = true) => {
      const ch = (now - base) / Math.max(base, 0.01) * (higherIsWorse ? 1 : -1);
      return ch > 0.4 ? ['bad', 'Concerning'] : ch > 0.15 ? ['mid', 'Worth a look'] : ['good', 'Normal'];
    };
    const spark = (arr) => {
      const w = 150, h = 36, mx = Math.max(...arr) * 1.15, mn = Math.min(...arr) * 0.85;
      const pts = arr.map((v, i) => [4 + (i * (w - 8)) / (arr.length - 1), h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8)]);
      return `<svg viewBox="0 0 ${w} ${h}" class="spark" aria-hidden="true"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 4 : 2.4}" fill="${i === pts.length - 1 ? 'currentColor' : 'var(--surface)'}" stroke="currentColor" stroke-width="1.5"/>`).join('')}</svg>`;
    };
    let worst = 0;
    const rank = { good: 0, mid: 1, bad: 2 };
    const rows = D.sessions.metrics.map((m) => {
      const base = m.values.slice(0, 3).reduce((a, b) => a + b, 0) / 3, now = m.values[m.values.length - 1];
      const [cls, lvl] = window.LIVE?.habitLevel?.(m) || levelOf(base, now, m.worse !== 'lower'); // LIVE: classifier
      worst = Math.max(worst, rank[cls]);
      return `<div class="hab ${cls}"><div class="hab-name"><b>${m.name}</b><small>Your usual: ${m.fmt(base)}</small></div>${spark(m.values)}<div class="hab-now"><b>${m.fmt(now)}</b><small>last shift</small></div><span class="hab-lvl ${cls}">${lvl}</span></div>`;
    }).join('');
    return `<div class="card pcard c12 rise habits-card">
      <div class="plan-head"><div><h3>How your habits are changing</h3><div class="sub">Your last 5 shifts compared with your own usual, not with other people. Checked in the background after each shift, so it never slows the screen.</div></div>
        <span class="hab-lvl ${['good', 'mid', 'bad'][worst]} big">Overall: ${['normal', 'worth a look', 'concerning'][worst]}</span></div>
      <div class="habs">${rows}</div>
      <div class="hab-foot"><span>${D.sessions.dates.join(' · ')}</span><span>Safety alerts are different: they fire straight away on the Safety page. This page is about slow changes over days.</span></div>
    </div>`;
  }

  /* ---------- VIDEO PLAYER ---------- */
  const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  function renderVideo(id) {
    const v = D.videos.find((x) => x.id === id) || D.videos[0];
    const watched = S.watched.has(v.id);
    const next = D.videos.filter((x) => x.id !== v.id);
    main.innerHTML = `<div class="page video-page">
      <div class="vp-top">
        <button class="back" type="button" data-go="training/videos"><i data-lucide="arrow-left"></i>Videos</button>
        <span class="parked"><i data-lucide="lock"></i>Machine parked, arm locked</span>
      </div>
      <div class="grid">
        <div class="c8 rise" style="min-width:0">
          <div class="player">
            <iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
              title="${v.title}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>
          <div class="vp-meta">
            <span class="eyebrow">${v.topic}</span>
            <h1 class="vp-title">${v.title}</h1>
            <div class="vp-row">
              <span class="channel"><img src="assets/cat-logo.png" alt="" width="34" height="21" /><span><b>Cat® Products</b><small>Official Caterpillar channel</small></span></span>
              <div class="vp-actions">
                <button class="btn ${watched ? 'outline' : 'dark'}" type="button" id="markDone"><i data-lucide="${watched ? 'circle-check' : 'check'}"></i>${watched ? 'Watched' : 'I watched this'}</button>
                <a class="btn outline" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>YouTube</a>
              </div>
            </div>
            ${v.why ? `<div class="note"><i data-lucide="info"></i><span><b>Why this video:</b> ${v.why}</span></div>` : ''}
          </div>
        </div>
        <aside class="card pcard c4 rise" style="--i:1;align-self:start">
          <h3>More videos</h3><div class="sub">${next.length} more from Cat</div>
          <div class="upnext">${next.map((x, i) => `
            <button class="un-item rise" style="--i:${i + 2}" type="button" data-go="video/${x.id}">
              <span class="un-thumb"><img src="${ytThumb(x.id)}" alt="" loading="lazy" />${S.watched.has(x.id) ? '<i class="done-dot" aria-label="Watched"></i>' : ''}</span>
              <span class="un-txt"><b>${x.title}</b><small>${x.topic}</small></span>
            </button>`).join('')}</div>
        </aside>
      </div></div>`;
    $('#markDone').addEventListener('click', () => {
      S.watched.has(v.id) ? S.watched.delete(v.id) : S.watched.add(v.id);
      if (S.watched.has(v.id)) toast('Marked as watched. Your level went up.', 'graduation-cap');
      renderVideo(v.id); icons();
    });
  }

  /* ---------- PROFILE + SETTINGS ---------- */
  function renderProfile(tab) {
    const sw = (k) => `<button class="switch" role="switch" aria-checked="${S.settings[k]}" data-sw="${k}" type="button"></button>`;
    const P = D.operator;
    const belt = D.telemetry.filter((r) => r.belt === 'Fastened').length;
    const progress = Math.min(100, 62 + S.watched.size * 4);
    const profileBody = `
      <div class="card pcard c3 rise kpi" style="--i:1"><span class="eyebrow">Jobs today</span><b>2 <small class="of">of 5</small></b><span class="delta">2 done, both faster than planned</span></div>
      <div class="card pcard c3 rise kpi" style="--i:2"><span class="eyebrow">Belt on</span><b>${belt} <small class="of">of ${D.telemetry.length}</small></b><span class="delta"><span class="st crit">Needs work</span>machine readings</span></div>
      <div class="card pcard c3 rise kpi" style="--i:3"><span class="eyebrow">To reach F1</span><b><span data-count="${progress}">0</span>%</b><span class="delta">+4% for each video you finish</span></div>
      <div class="card pcard c3 rise kpi" style="--i:4"><span class="eyebrow">Warning points</span><b>2 <small class="of">of 12</small></b><span class="delta">Cleared in 30 days</span></div>

      <div class="card pcard c6 rise" style="--i:5">
        <h3>Licences and training</h3><div class="sub">Sample records for the demo.</div>
        <div class="cert-list">
          ${[['badge-check', 'F2 · Hydraulic excavator, 20 t class', 'Valid until Mar 2027', 'ok'],
             ['hard-hat', 'Site safety induction', 'Valid until Dec 2026', 'ok'],
             ['heart-pulse', 'First aid at work', 'Renew by Oct 2026', 'warn'],
             ['lock', 'F1 · Demolition and heavy lift', 'Locked · 38% to go', 'lock']].map(([ic, t, s2, st]) => `
            <div class="cert"><span class="cert-ico ${st}"><i data-lucide="${ic}"></i></span><div><b>${t}</b><small>${s2}</small></div></div>`).join('')}
        </div>
      </div>
      <div class="card pcard c6 rise" style="--i:6">
        <h3>Cat videos</h3><div class="sub">${S.watched.size} of ${D.videos.length} watched</div>
        <div class="prog light"><i style="width:${(S.watched.size / D.videos.length) * 100}%"></i></div>
        <div class="mini-vids">${D.videos.slice(0, 4).map((x) => `
          <button class="mv" type="button" data-go="video/${x.id}"><img src="${ytThumb(x.id)}" alt="" loading="lazy" /><span><b>${x.title}</b><small>${S.watched.has(x.id) ? 'Watched' : x.topic}</small></span>${S.watched.has(x.id) ? '<i data-lucide="circle-check" class="mv-done"></i>' : ''}</button>`).join('')}</div>
      </div>
      <div class="card pcard c12 rise" style="--i:7">
        <h3>Today</h3>
        <div class="activity">
          ${[['check', '09:43', 'Finished grading in 33 min. Plan was 35.'], ['hourglass', '10:00', 'Waited 55 min for a truck. Belt was off.'], ['check', '08:58', 'Finished digging in 58 min. Plan was 60.'], ['log-in', '07:52', 'Signed in to EXC001']].map(([ic, t, s2]) => `
            <div class="act"><span class="act-ico"><i data-lucide="${ic}"></i></span><span class="act-t">${t}</span><span>${s2}</span></div>`).join('')}
        </div>
      </div>`;
    const settingsBody = `
      <div class="card pcard c6 rise">
        <h3>Language</h3><div class="sub">For the screen and spoken warnings.</div>
        <div class="opt-row" style="margin-top:14px"><button class="opt${S.lang === 'en' ? ' active' : ''}" data-lang="en" type="button">English</button><button class="opt${S.lang === 'hi' ? ' active' : ''}" data-lang="hi" type="button" lang="hi">हिंदी</button></div>
        <div class="set-row" style="margin-top:14px"><div class="txt"><b>Spoken warnings</b><small>Short words like "Belt on".</small></div>${sw('voice')}</div>
      </div>
      <div class="card pcard c6 rise">
        <h3>Screen</h3><div class="sub">Night mode is easier on the eyes in the dark cab.</div>
        <div class="opt-row" style="margin-top:14px">${[['light', 'sun', 'Day'], ['dark', 'moon', 'Night'], ['auto', 'sun-moon', 'Auto']].map(([k, ic, l]) => `<button class="opt${themePref() === k ? ' active' : ''}" data-theme-pick="${k}" type="button"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
        <div class="sub" style="margin-top:10px">Auto follows your phone or computer setting.</div>
      </div>
      <div class="card pcard c6 rise" style="--i:1">
        <h3>Warnings</h3><div class="sub">Fewer warnings, so you notice the ones that matter.</div>
        <div class="set-row"><div class="txt"><b>Seat buzz</b><small>The seat buzzes on the side where the danger is.</small></div>${sw('haptics')}</div>
        <div class="set-row"><div class="txt"><b>Bright sun mode</b><small>Easier to read in strong sun.</small></div>${sw('contrast')}</div>
        <div class="set-row"><div class="txt"><b>Up to <span id="budgetV">${S.settings.budget}</span> small warnings an hour</b><small>Extra ones wait until you stop. Safety warnings always show.</small></div>
          <input type="range" min="1" max="6" value="${S.settings.budget}" id="budgetIn" style="width:140px" aria-label="Alert budget per hour"/></div>
      </div>
      <div class="card pcard c6 rise" style="--i:2">
        <h3>Signing in</h3><div class="sub">How the machine knows it is you.</div>
        <div class="set-row"><div class="txt"><b>Operator ID</b><small>${P.id} · used to start the machine</small></div><span class="tag">${P.id}</span></div>
        <div class="set-row"><div class="txt"><b>Set up my seat and joysticks</b><small>On any machine you sign in to.</small></div>${sw('presets')}</div>
      </div>
      <div class="card pcard c6 rise" style="--i:3">
        <h3>Signal</h3><div class="sub">Reports are saved on the tablet first, so nothing is lost without signal.</div>
        <div class="set-row"><div class="txt"><b>No signal (demo)</b><small>Try it: make a report, then turn this off to send it.</small></div>${sw('offline')}</div>
      </div>
      <div class="card pcard c6 rise" style="--i:4">
        <h3>Who sees my data</h3><div class="sub">Your work data is yours.</div>
        <div class="set-row"><div class="txt"><b>Share my work data with my supervisor</b><small>When off, only safety events are shared.</small></div>${sw('share')}</div>
      </div>`;

    main.innerHTML = `<div class="page">
      <div class="card profile-hero rise">
        <div class="ph-cover" aria-hidden="true"></div>
        <div class="ph-body">
          <img class="ph-avatar" src="assets/operator.jpg" alt="${P.name}" width="104" height="104" />
          <div class="ph-id">
            <h1>${P.name}</h1>
            <div class="ph-role">${P.role} · ${P.id}</div>
            <div class="ph-chips">
              <span class="chip"><i data-lucide="badge-check"></i>F2 Licence</span>
              <span class="chip"><i data-lucide="map-pin"></i>${P.site}</span>
              <span class="chip"><i data-lucide="clock"></i>${P.shift}</span>
              <span class="chip"><i data-lucide="languages"></i>${P.languages}</span>
            </div>
          </div>
          <div class="ph-tabs" role="tablist">
            <span class="ph-pill" style="transform:translateX(${tab === 'settings' ? 120 : 0}px)"></span>
            <button class="ph-tab${tab === 'profile' ? ' active' : ''}" role="tab" aria-selected="${tab === 'profile'}" type="button" data-go="profile">Profile</button>
            <button class="ph-tab${tab === 'settings' ? ' active' : ''}" role="tab" aria-selected="${tab === 'settings'}" type="button" data-go="settings">Settings</button>
          </div>
          <button class="btn outline" type="button" id="signOut"><i data-lucide="log-out"></i>Sign out</button>
        </div>
      </div>
      <div class="grid" style="margin-top:16px">${tab === 'settings' ? settingsBody : profileBody}</div>
    </div>`;

    const page = main.querySelector('.page');
    page.addEventListener('click', (e) => {
      const l = e.target.closest('[data-lang]');
      if (l) { S.lang = l.dataset.lang; document.documentElement.lang = S.lang; renderNav(); renderProfile('settings'); icons(); return; }
      const th = e.target.closest('[data-theme-pick]');
      if (th) { applyTheme(th.dataset.themePick, true); renderProfile('settings'); icons(); return; }
      const s = e.target.closest('[data-sw]');
      if (s) {
        const k = s.dataset.sw; S.settings[k] = !S.settings[k]; s.setAttribute('aria-checked', S.settings[k]);
        if (k === 'contrast') document.body.classList.toggle('hi-contrast', S.settings[k]);
        if (k === 'offline') setOffline(S.settings[k]);
      }
      if (e.target.closest('#signOut')) signOut();
    });
    const b = $('#budgetIn');
    if (b) b.addEventListener('input', (e) => { S.settings.budget = +e.target.value; $('#budgetV').textContent = S.settings.budget; });
  }

  /* =========================================================
     FLEET VIEW (SRS 3.8: fleet manager, all operators and machines)
     ========================================================= */
  function renderFleet() {
    const F = D.fleet;
    const op = S.fleetOp, mc = S.fleetMc;
    const logs = F.logs.filter((l) => (op === 'all' || l.op === op) && (mc === 'all' || l.mc === mc));
    const opName = (id) => F.operators.find((o) => o.id === id).name;
    const COLS = ['var(--ink)', '#0E9F8A', '#E07B00'];
    // idle trend, one line per operator
    const W = 520, H = 190, pl = 34, pb = 26, pt = 14;
    const X = (i) => pl + i * ((W - pl - 70) / 4), Y = (v) => pt + (1 - v / 45) * (H - pt - pb);
    const lines = F.operators.map((o, k) => `<g data-tip="<b>${o.name}</b><br>Waiting: ${o.idle.join('%, ')}%">
      <polyline points="${o.idle.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="${COLS[k]}" stroke-width="2.4" stroke-linejoin="round" style="${k === 0 ? 'stroke:var(--ink)' : ''}"/>
      ${o.idle.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${COLS[k]}" style="${k === 0 ? 'fill:var(--ink)' : ''}"/>`).join('')}
      <text x="${X(4) + 8}" y="${Y(o.idle[4]) + 4}" class="lbl">${o.name.split(' ')[0]} ${o.idle[4]}%</text></g>`).join('');
    const idleChart = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Waiting time per operator over 5 days">
      ${[0, 15, 30, 45].map((v) => `<line class="grid-l" x1="${pl}" x2="${W - 60}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
      ${F.days.map((d, i) => `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('')}${lines}</svg>`;
    const incMax = Math.max(...F.incidents);
    const incChart = `<div class="bars">${F.incidents.map((v, i) => `<div class="bar-col" data-tip="<b>${F.days[i]}</b> ${v} reports"><b>${v}</b><i class="growy" style="height:${(v / incMax) * 100}%"></i><span>${F.days[i]}</span></div>`).join('')}</div>`;
    const fuelMax = Math.max(...F.operators.map((o) => o.fuel));
    const fuel = F.operators.map((o) => `<div class="hbar" data-tip="<b>${o.machine}</b> ${o.fuel} L per load"><span>${o.machine}<small>${o.type}</small></span><div><i class="growx" style="width:${(o.fuel / fuelMax) * 100}%;${o.fuel > 0.65 ? 'background:var(--warn)' : ''}"></i></div><b>${o.fuel} L</b></div>`).join('');
    const queue = F.queue.filter((q) => !S.reviewed[q.id]);
    main.innerHTML = `<div class="page fleet">
      <div class="page-head"><div><span class="fleet-badge"><i data-lucide="building-2"></i>Fleet view · for managers</span><h1>Fleet</h1><p>All operators and machines on this site. The same data the cabs send, read-only here.</p></div>
        <button class="btn outline" type="button" id="toCockpit"><i data-lucide="arrow-left"></i>Back to the cab screen</button></div>
      <div class="filters">
        <label>Operator <select id="fOp"><option value="all">Everyone</option>${F.operators.map((o) => `<option value="${o.id}" ${op === o.id ? 'selected' : ''}>${o.name}</option>`).join('')}</select></label>
        <label>Machine <select id="fMc"><option value="all">All machines</option>${F.operators.map((o) => `<option value="${o.machine}" ${mc === o.machine ? 'selected' : ''}>${o.machine} · ${o.type}</option>`).join('')}</select></label>
        <label>Dates <select id="fDate"><option>Last 5 shifts</option><option>Today</option></select></label>
        <span class="sample">Other operators and machines are sample data</span>
      </div>
      <div class="grid">
        <div class="card pcard c3 rise kpi"><span class="eyebrow">Machines working</span><b>3</b><span class="delta">1 with a fault (EXC001)</span></div>
        <div class="card pcard c3 rise kpi" style="--i:1"><span class="eyebrow">Open reports</span><b>${S.incidents.filter((x) => x.status === 'Open' || x.status === 'New').length}</b><span class="delta">From the cab screens</span></div>
        <div class="card pcard c3 rise kpi" style="--i:2"><span class="eyebrow">To review</span><b>${queue.length}</b><span class="delta">Habit flags from the pattern check</span></div>
        <div class="card pcard c3 rise kpi" style="--i:3"><span class="eyebrow">Job time accuracy</span><b>${(D.modelError * 100).toFixed(1)}%</b><span class="delta">Off on average · the plan was ${(D.plannerError * 100).toFixed(1)}%</span></div>

        <div class="card pcard c7 rise" style="--i:4"><h3>Review list</h3><div class="sub">Habits that changed against each operator's own usual. Talk it through, or dismiss it.</div>
          <div class="queue">${queue.length ? queue.map((q) => `<div class="q-item"><span class="hab-lvl ${q.cls}">${q.level}</span><div><b>${opName(q.op)} · ${F.operators.find((o) => o.id === q.op).machine}</b><p>${q.what}</p></div>
            <div class="q-act"><button class="btn dark" type="button" data-review="${q.id}" data-how="talk">Talk to operator</button><button class="btn outline" type="button" data-review="${q.id}" data-how="dismiss">Dismiss</button></div></div>`).join('') : '<div class="empty">Nothing to review. New flags appear here after each shift.</div>'}</div></div>
        <div class="card pcard c5 rise" style="--i:5"><h3>Waiting time</h3><div class="sub">Share of engine time spent waiting, per operator.</div>${idleChart}</div>
        <div class="card pcard c4 rise" style="--i:6"><h3>Reports per day</h3><div class="sub">All machines.</div>${incChart}</div>
        <div class="card pcard c4 rise" style="--i:7"><h3>Fuel per load</h3><div class="sub">Last 5 shifts.</div><div class="hbars">${fuel}</div></div>
        <div class="card pcard c4 rise" style="--i:8"><h3>Job time: plan vs real</h3><div class="sub">Average difference from the real time.</div>
          <div class="acc"><div><span>Plan</span><div class="acc-bar"><i class="growx" style="width:${D.plannerError * 100 * 5}%"></i></div><b>${(D.plannerError * 100).toFixed(1)}%</b></div>
          <div><span>Estimate tool</span><div class="acc-bar"><i class="growx good" style="width:${D.modelError * 100 * 5}%"></i></div><b>${(D.modelError * 100).toFixed(1)}%</b></div></div></div>
        <div class="card pcard c12 rise" style="--i:9"><h3>Log</h3><div class="sub">${logs.length} entries</div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Operator</th><th>Machine</th><th>What happened</th><th>From</th></tr></thead>
          <tbody>${logs.map((l) => `<tr><td>${l.when}</td><td>${opName(l.op)}</td><td>${l.mc}</td><td>${l.what}</td><td style="color:var(--t2)">${l.src}</td></tr>`).join('') || '<tr><td colspan="5">No entries for this filter.</td></tr>'}</tbody></table></div></div>
      </div></div>`;
    const page = main.querySelector('.page');
    page.addEventListener('change', (e) => {
      if (e.target.id === 'fOp') { S.fleetOp = e.target.value; renderFleet(); icons(); }
      if (e.target.id === 'fMc') { S.fleetMc = e.target.value; renderFleet(); icons(); }
    });
    page.addEventListener('click', (e) => {
      if (e.target.closest('#toCockpit')) { go('home'); return; }
      const r = e.target.closest('[data-review]');
      if (r) { S.reviewed[r.dataset.review] = r.dataset.how; toast(r.dataset.how === 'talk' ? 'Added to your talk list for tomorrow.' : 'Dismissed.', 'check'); renderFleet(); icons(); }
    });
  }

  /* =========================================================
     LOGIN (SRS 3.1): PIN pad or badge, sized for gloves
     ========================================================= */
  // Who can drive EXC001. Level sets the job time estimates. PIN for the demo = the last 4 digits of the ID.
  const OPERATORS = [
    { id: 'OP1001', name: 'Aayush Raj', level: 'Intermediate', licence: 'F2 Licence', photo: 'assets/operator.jpg' },
    { id: 'OP1002', name: 'Sarah George', level: 'Expert', licence: 'F1 Licence' },
    { id: 'OP1003', name: 'Maneesh Ari', level: 'Beginner', licence: 'F3 Licence' },
  ];
  const initials = (n) => n.split(' ').map((w) => w[0]).join('');
  const avatar = (op, cls = '') => op.photo ? `<img class="${cls}" src="${op.photo}" alt="" />` : `<span class="${cls} ini" aria-hidden="true">${initials(op.name)}</span>`;

  // the signed-in operator shows everywhere: menu, reports, job time level
  function applyOperator(id) {
    const op = OPERATORS.find((x) => x.id === id) || OPERATORS[0];
    S.op = op;
    Object.assign(D.operator, { name: op.name, id: op.id });
    S.est.skill = op.level;
    const ub = $('#userBtn');
    if (ub) {
      ub.querySelector('.user-meta').innerHTML = `<b>${op.name}</b><small>Operator · ${op.licence}</small>`;
      const old = ub.querySelector('.avatar');
      old.outerHTML = op.photo ? `<img class="avatar" src="${op.photo}" alt="" width="34" height="34" />` : `<span class="avatar ini" aria-hidden="true">${initials(op.name)}</span>`;
    }
    const tb = $('#tbAvatar');
    if (tb) tb.innerHTML = op.photo ? `<img src="${op.photo}" alt="" width="36" height="36" />` : `<span class="ini">${initials(op.name)}</span>`;
  }

  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ }
    return null;
  }

  // step: 'who' (pick the operator) -> 'pin' -> 'start' (belt on, then start the engine) -> main screen
  function showLogin(step = 'who') {
    $('#login')?.remove();
    const o = document.createElement('div');
    o.className = 'login'; o.id = 'login';
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Sign in');
    let pin = '', shake = false;
    let op = OPERATORS.find((x) => x.id === session('cat-op')) || OPERATORS[0];
    const side = `<div class="login-side">
        <img src="assets/cat-logo.png" alt="Cat" class="login-logo" />
        <h1>Operator Assistant</h1>
        <p>EXC001 · 320 Hydraulic Excavator</p>
        <ol class="login-steps">${[['who', 'Who is driving'], ['pin', 'Your PIN'], ['start', 'Belt on, start']].map(([k, l], i) => `<li class="${k === step ? 'on' : ['who', 'pin', 'start'].indexOf(step) > i ? 'done' : ''}"><span>${i + 1}</span>${l}</li>`).join('')}</ol>
      </div>`;
    const views = {
      who: () => `<div class="login-main who">
          <h2>Who is driving?</h2>
          <div class="op-list">${OPERATORS.map((x) => `<button class="op-card" type="button" data-op="${x.id}">
            ${avatar(x, 'op-av')}<span class="op-txt"><b>${x.name}</b><small>${x.id} · ${x.licence}</small></span>
            <span class="op-lvl ${x.level.toLowerCase()}">${x.level}</span><i data-lucide="chevron-right"></i></button>`).join('')}</div>
          <div class="mgr-box">
            <span class="mgr-ico"><i data-lucide="building-2"></i></span>
            <div class="mgr-txt"><b>Fleet manager</b><small>Every machine and report on site.</small></div>
            <button class="btn outline" type="button" data-k="manager">Open fleet view<i data-lucide="arrow-right"></i></button>
          </div>
        </div>`,
      pin: () => `<div class="login-main">
          <button class="login-who" type="button" data-k="change">${avatar(op)}<div><b>${op.name}</b><small>${op.id} · ${op.level}</small></div><span class="lw-change">Change</span></button>
          <div class="pin-dots${shake ? ' shake' : ''}" aria-label="${pin.length} of 4 digits entered">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
          <div class="pin-msg${shake ? ' bad' : ''}" id="pinMsg">${shake ? 'That PIN is not right. Try again.' : `Enter your 4-digit PIN · demo PIN ${op.id.slice(2)}`}</div>
          <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="clear" aria-label="Clear">Clear</button><button type="button" data-k="0">0</button><button type="button" data-k="back" aria-label="Delete"><i data-lucide="delete"></i></button></div>
          <button class="btn badge-btn" type="button" data-k="badge"><i data-lucide="id-card"></i>Scan ID badge instead</button>
        </div>`,
      start: () => `<div class="login-main start">
          <div class="gate-lamp ${S.beltOn ? 'ok' : ''}${shake ? ' shake' : ''}">${ICON_BELT}</div>
          <h2>${S.beltOn ? 'Belt on. Start the engine.' : 'Put your seatbelt on'}</h2>
          <p>${S.beltOn ? `Good morning, ${op.name.split(' ')[0]}.` : 'The engine stays locked until your belt is on.'}</p>
          <button class="btn outline gate-belt" type="button" data-k="belt">${S.beltOn ? 'Take belt off (demo)' : 'Put belt on (demo)'}</button>
          <div class="gate-checks"><span>Walk-around (recommended)</span>
            <div>${CHECKS.map((c, i) => `<button class="check${S.lights[i] ? ' done' : ''}" data-check="${i}" type="button"><i data-lucide="${S.lights[i] ? 'check' : c.icon}"></i>${c.l}</button>`).join('')}</div></div>
          <button class="btn gate-start${S.beltOn ? '' : ' locked'}" type="button" data-k="engine"><i data-lucide="${S.beltOn ? 'power' : 'lock'}"></i>${S.beltOn ? 'Start engine' : 'Locked: belt off'}</button>
          <small class="gate-note" id="gateNote">${shake ? 'Put your belt on first. This try was logged.' : ''}</small>
        </div>`,
    };
    const draw = () => { o.innerHTML = `<div class="login-card">${side}${views[step]()}</div>`; icons(); };
    const to = (st) => showLogin(st);
    const finish = (role) => {
      clearInterval(showLogin.beltWatch);
      session('cat-session', role);
      o.classList.add('out');
      setTimeout(() => o.remove(), 320);
      go(role === 'manager' ? 'fleet' : 'home');
    };
    const signedIn = () => { session('cat-op', op.id); applyOperator(op.id); session('cat-session', 'pending'); to('start'); };
    o.addEventListener('click', (e) => {
      const c = e.target.closest('[data-op]');
      if (c) { op = OPERATORS.find((x) => x.id === c.dataset.op); session('cat-op', op.id); to('pin'); return; }
      const ch = e.target.closest('[data-check]');
      if (ch) { S.lights[+ch.dataset.check] = !S.lights[+ch.dataset.check]; draw(); return; }
      const k = e.target.closest('[data-k]');
      if (!k) return;
      const v = k.dataset.k;
      if (v === 'manager') { finish('manager'); return; }
      if (v === 'change') { to('who'); return; }
      if (v === 'badge') { toast(`Badge read: ${op.name}`, 'id-card'); signedIn(); return; }
      if (v === 'belt') { S.beltOn = !S.beltOn; shake = false; draw(); return; }
      if (v === 'engine') {
        if (!S.beltOn) {
          // a blocked start is logged, like on the machine
          addIncident('Engine start blocked, belt off', 'Machine', 'warn');
          shake = true; draw(); setTimeout(() => { shake = false; }, 450); return;
        }
        S.engine = 'on';
        toast('Engine started.', 'power');
        finish('operator'); return;
      }
      if (v === 'clear') pin = '';
      else if (v === 'back') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += v;
      shake = false; draw();
      if (pin.length === 4) {
        if (pin === op.id.slice(2)) signedIn();
        else { pin = ''; shake = true; setTimeout(() => { shake = false; draw(); }, 900); draw(); }
      }
    });
    document.body.appendChild(o);
    draw();
    // the belt can also change from the machine (backend remote): keep the gate in step
    clearInterval(showLogin.beltWatch);
    if (step === 'start') { let last = S.beltOn; showLogin.beltWatch = setInterval(() => { if (!document.body.contains(o)) return clearInterval(showLogin.beltWatch); if (S.beltOn !== last) { last = S.beltOn; draw(); } }, 400); }
  }
  function signOut() {
    session('cat-session', null); session('cat-op', null);
    S.engine = 'off'; S.beltOn = false; S.lights = S.lights.map(() => false);
    showLogin('who');
  }

  /* =========================================================
     MOVING: locked strip (SRS 3.3 / 5). Demo uses a switch; a real cab reads travel and joystick telemetry.
     ========================================================= */
  function setMoving(on) {
    S.moving = on;
    const b = $('#driveBtn');
    b.classList.toggle('on', on);
    b.innerHTML = `<i data-lucide="${on ? 'truck' : 'square-parking'}"></i><span>${on ? 'Moving' : 'Parked'}</span>`;
    let lock = $('#driveLock');
    if (on && !lock) {
      lock = document.createElement('div');
      lock.id = 'driveLock'; lock.className = 'drive-lock';
      lock.innerHTML = `<div class="dl-top"><span><i data-lucide="lock"></i>Screen locked while the machine moves</span><div class="dl-demo"><span class="dl-demo-tag">Demo</span><button type="button" id="parkBtn"><i data-lucide="square-parking"></i>Park the machine</button><small>Tap to stop and unlock · or press Esc</small></div></div>
        <div class="dl-scene" aria-hidden="true">
          <svg class="dl-svg" viewBox="0 0 640 260">
            <defs>
              <linearGradient id="dlY" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD43B"/><stop offset="1" stop-color="#E0A800"/></linearGradient>
              <linearGradient id="dlGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9FB6C4"/><stop offset="1" stop-color="#4F6570"/></linearGradient>
            </defs>
            <!-- distant site: hills and a crane, sliding slowly -->
            <g class="dl-far"><path d="M0 170 Q80 140 160 160 T320 150 T480 162 T640 148 T800 160 T960 150 T1120 162 T1280 150 V200 H0 Z" fill="rgba(255,255,255,.05)"/></g>
            <!-- ground and moving marks -->
            <line x1="0" y1="214" x2="640" y2="214" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
            <g class="dl-ground">${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 64}" y1="224" x2="${i * 64 + 26}" y2="224" stroke="rgba(255,255,255,.14)" stroke-width="3" stroke-linecap="round"/>`).join('')}</g>
            <!-- dust behind the tracks -->
            <g class="dl-dust"><circle cx="150" cy="204" r="10"/><circle cx="132" cy="198" r="14"/><circle cx="112" cy="206" r="9"/></g>
            <!-- excavator, side view, boom tucked for travel -->
            <g class="dl-exc">
              <g class="dl-body">
                <rect x="232" y="120" width="170" height="46" rx="8" fill="url(#dlY)" stroke="#1A1A19" stroke-width="2"/>
                <path d="M232 128 Q206 130 204 146 Q206 164 232 166 Z" fill="#E0A800" stroke="#1A1A19" stroke-width="2"/>
                <image href="assets/cat-logo.png" x="244" y="130" width="46" height="28" preserveAspectRatio="xMidYMid meet"/>
                <path d="M296 134 H330 M296 142 H330 M296 150 H330" stroke="#9A7800" stroke-width="3"/>
                <rect x="338" y="72" width="58" height="52" rx="6" fill="#1B1F23" stroke="#1A1A19" stroke-width="2"/>
                <rect x="346" y="80" width="42" height="34" rx="3" fill="url(#dlGlass)" opacity=".85"/>
                <rect x="372" y="62" width="6" height="12" rx="2" fill="#2A2A28"/>
                <!-- boom and stick folded, bucket tucked in -->
                <path d="M392 132 L470 70 L484 82 L410 146 Z" fill="url(#dlY)" stroke="#1A1A19" stroke-width="2"/>
                <path d="M470 70 L512 150 L498 156 L458 82 Z" fill="url(#dlY)" stroke="#1A1A19" stroke-width="2"/>
                <line x1="404" y1="126" x2="452" y2="88" stroke="#3A3A37" stroke-width="5" stroke-linecap="round"/>
                <path d="M492 146 L528 152 L524 186 L500 192 Q482 176 488 156 Z" fill="#3A3A37" stroke="#1A1A19" stroke-width="2"/>
                <path d="M500 192 l-4 6 M510 190 l-2 7 M519 188 l0 7" stroke="#1A1A19" stroke-width="3" stroke-linecap="round"/>
              </g>
              <!-- undercarriage and moving tracks -->
              <rect x="214" y="170" width="206" height="44" rx="22" fill="#2A2A28" stroke="#111" stroke-width="2"/>
              <rect class="dl-tread" x="214" y="170" width="206" height="44" rx="22" fill="none" stroke="#4A4A46" stroke-width="5" stroke-dasharray="6 8"/>
              ${[240, 276, 312, 348, 384].map((cx) => `<circle cx="${cx + 8}" cy="192" r="10" fill="#3A3A37" stroke="#111" stroke-width="2"/>`).join('')}
              <circle class="dl-sprocket" cx="236" cy="192" r="15" fill="#1F1F1D" stroke="#FFCD11" stroke-width="2" stroke-dasharray="4 4"/>
              <circle class="dl-sprocket" cx="398" cy="192" r="15" fill="#1F1F1D" stroke="#FFCD11" stroke-width="2" stroke-dasharray="4 4"/>
            </g>
          </svg>
          <div class="dl-msg"><b>Eyes on the site</b><span>The screen unlocks when you stop.</span></div>
        </div>
        <div class="dl-strip">
          <div class="dl-job"><small>Job</small><b>Trenching</b><span id="dlLeft"></span></div>
          <div class="dl-belt" id="dlBelt"></div>
          <button class="dl-btn report" id="dlReport" type="button" aria-label="Hold to report"><span class="dl-fill"></span><i data-lucide="mic"></i><b>Report</b><small>Hold</small></button>
          <button class="dl-btn dl-sos" id="dlSos" type="button" aria-label="Hold for SOS"><span class="dl-fill"></span><i data-lucide="siren"></i><b>SOS</b><small>Hold</small></button>
        </div>`;
      document.body.appendChild(lock);
      holdable($('#dlReport'), 1200, () => { logIncident(); });
      holdable($('#dlSos'), 1500, openSOS);
      $('#parkBtn').addEventListener('click', () => setMoving(false));
      // demo: Esc parks too, so a presenter can always get out
      if (!setMoving.esc) { setMoving.esc = true; addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.moving && $('#driveLock')) setMoving(false); }); }
      requestAnimationFrame(() => lock.classList.add('on'));
    }
    if (on) {
      const st = stateAt(S.t);
      $('#dlLeft').textContent = `About ${Math.max(1, Math.round(expect(taskById('T002')) - (D.LIVE - 380)))} min left`;
      const off = beltOffAt(st);
      $('#dlBelt').innerHTML = `<span class="il-lamp ${off ? 'off' : ''}">${ICON_BELT}</span><b>${off ? 'Belt off' : 'Belt on'}</b>`;
    } else if (lock) { lock.classList.remove('on'); setTimeout(() => lock.remove(), 260); }
    icons();
  }

  /* =========================================================
     OFFLINE FIRST (SRS 5): reports live on the tablet, sync when there is signal
     ========================================================= */
  function saveIncidents() { try { localStorage.setItem('cat-incidents', JSON.stringify(S.incidents)); } catch (e) { /* storage blocked */ } }
  function loadIncidents() { try { const x = JSON.parse(localStorage.getItem('cat-incidents')); if (Array.isArray(x) && x.length) S.incidents = x.map((i) => ({ ...i, fresh: false })); } catch (e) { /* ignore */ } }
  function updateSync(syncing) {
    const c = $('#syncChip');
    if (!c) return;
    // only shown when something needs attention: no signal, or reports being sent
    c.hidden = !S.offline && !syncing;
    c.className = `tb-chip sync ${S.offline ? 'off' : syncing ? 'busy' : ''}`;
    c.innerHTML = S.offline ? `<i data-lucide="cloud-off"></i>No signal · ${S.pending} waiting` : syncing ? `<i data-lucide="refresh-cw"></i>Sending ${syncing}…` : '<i data-lucide="circle-check"></i>Saved';
    c.dataset.tip = S.offline ? 'Reports are saved on this tablet and send when signal is back.' : 'Everything is saved and sent.';
    icons();
  }
  function setOffline(off) {
    if (window.LIVE?.setOffline?.(off)) return; // LIVE: really send the waiting reports
    S.offline = off;
    if (!off && S.pending) {
      const n = S.pending;
      updateSync(n);
      setTimeout(() => { S.incidents.forEach((x) => (x.synced = true)); S.pending = 0; saveIncidents(); updateSync(); toast(`${n} report${n === 1 ? '' : 's'} sent.`, 'circle-check'); if (S.route === 'safety') go(S.routeArg ? 'safety/' + S.routeArg : 'safety'); }, 1400);
    } else updateSync();
  }

  /* =========================================================
     DROPDOWNS: every <select> gets a custom list that matches the UI.
     The native select stays underneath and still fires "change", so page code is untouched.
     ========================================================= */
  let openDD = null;
  function closeDD(focus) {
    if (!openDD) return;
    const { wrap, btn } = openDD;
    wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    if (focus) btn.focus();
    openDD = null;
  }
  function enhanceSelect(sel) {
    if (sel.dataset.dd) return;
    sel.dataset.dd = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dd';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const label = sel.closest('label');
    if (label && label.firstElementChild) btn.setAttribute('aria-label', label.firstElementChild.textContent);
    const list = document.createElement('div');
    list.className = 'dd-list'; list.setAttribute('role', 'listbox');
    wrap.append(btn, list);
    let active = sel.selectedIndex;
    const mark = () => list.querySelectorAll('.dd-opt').forEach((x, k) => x.classList.toggle('act', k === active));
    const draw = () => {
      btn.innerHTML = `<span>${sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : ''}</span><i data-lucide="chevron-down"></i>`;
      list.innerHTML = [...sel.options].map((o, i) => `<div class="dd-opt${i === sel.selectedIndex ? ' sel' : ''}${i === active ? ' act' : ''}" role="option" aria-selected="${i === sel.selectedIndex}" data-i="${i}"><span>${o.text}</span><i data-lucide="check"></i></div>`).join('');
      icons();
    };
    const pick = (i) => {
      const changed = i !== sel.selectedIndex;
      closeDD(true);
      if (changed) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      if (sel.isConnected) draw();
    };
    const open = () => {
      if (openDD && openDD.wrap !== wrap) closeDD();
      active = sel.selectedIndex; draw();
      const r = btn.getBoundingClientRect();
      wrap.classList.toggle('up', innerHeight - r.bottom < Math.min(300, sel.options.length * 46 + 16));
      wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      openDD = { wrap, btn };
      const a = list.querySelector('.act'); if (a) a.scrollIntoView({ block: 'nearest' });
    };
    btn.addEventListener('click', () => (wrap.classList.contains('open') ? closeDD() : open()));
    list.addEventListener('click', (e) => { const o = e.target.closest('[data-i]'); if (o) pick(+o.dataset.i); });
    list.addEventListener('pointermove', (e) => {
      const o = e.target.closest('[data-i]');
      if (o && +o.dataset.i !== active) { active = +o.dataset.i; mark(); }
    });
    btn.addEventListener('keydown', (e) => {
      const isOpen = wrap.classList.contains('open');
      const n = sel.options.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) { open(); return; }
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        mark(); list.children[active].scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'Enter' || e.key === ' ') && isOpen) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape' && isOpen) { e.preventDefault(); closeDD(true); }
      else if (e.key.length === 1 && e.key.trim()) {
        const k = [...sel.options].findIndex((o, i) => i !== active && o.text.toLowerCase().startsWith(e.key.toLowerCase()));
        if (k >= 0) { if (isOpen) { active = k; mark(); } else pick(k); }
      }
    });
    draw();
  }
  function enhanceSelects(root) { root.querySelectorAll('select:not([data-dd])').forEach(enhanceSelect); }
  new MutationObserver(() => enhanceSelects(main)).observe(main, { childList: true, subtree: true });
  document.addEventListener('pointerdown', (e) => { if (openDD && !openDD.wrap.contains(e.target)) closeDD(); });

  /* ---------- NIGHT MODE ---------- */
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  // first visit opens in day mode; Night and Auto are the operator's choice after that
  function themePref() { try { return localStorage.getItem('cat-theme') || 'light'; } catch (e) { return 'light'; } }
  function applyTheme(pref, fade) {
    try { localStorage.setItem('cat-theme', pref); } catch (e) { /* storage blocked */ }
    const dark = pref === 'dark' || (pref === 'auto' && mqDark.matches);
    const root = document.documentElement;
    if (fade && !reduce) { root.classList.add('theme-fade'); setTimeout(() => root.classList.remove('theme-fade'), 300); }
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    const tc = $('#themeColor');
    if (tc) tc.setAttribute('content', dark ? '#121211' : '#F4F4F2');
    const b = $('#themeBtn');
    if (b) {
      b.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i>`;
      b.setAttribute('aria-label', dark ? 'Turn on day mode' : 'Turn on night mode');
      b.dataset.tip = dark ? 'Day mode' : 'Night mode';
      icons();
    }
    Machine3D.setTheme && Machine3D.setTheme(dark);
  }
  function initTheme() {
    applyTheme(themePref(), false);
    $('#themeBtn').addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(dark ? 'light' : 'dark', true);
      if (S.route === 'settings') renderProfile('settings');
    });
    mqDark.addEventListener('change', () => { if (themePref() === 'auto') applyTheme('auto', true); });
  }

  /* =========================================================
     RIGHT PANEL: live status (collapses to a glance strip)
     ========================================================= */
  // Safety at a glance in the Right now panel: belt, site warning, nearest person, today's stop zone
  function rpSafetyHTML() {
    const f = FLAGS[S.flag];
    const near = S.proxEvents[0];
    const m = near && near.what.match(/(\d+(?:\.\d+)?) m/);
    const beltOk = S.beltOn;
    return `<div class="rp-h"><h2>Safety</h2><button class="rp-link" type="button" data-go="safety">Safety <i data-lucide="chevron-right"></i></button></div>
      <div class="rp-row ${beltOk ? 'ok' : 'crit'}"><i data-lucide="armchair"></i><span>Seatbelt</span><em>${beltOk ? 'On' : 'Off'}</em></div>
      <div class="rp-row ${S.flag === 'green' ? 'ok' : S.flag === 'red' ? 'crit' : 'warn'}"><i data-lucide="${f.icon}"></i><span>Site warning</span><em>${f.t}</em></div>
      ${m ? `<div class="rp-row ${near.zone === 'stop' ? 'crit' : near.zone === 'slow' ? 'warn' : 'ok'}"><i data-lucide="user-round"></i><span>Nearest person</span><em>${m[1]} m</em></div>` : ''}
      <div class="rp-row info"><i data-lucide="cloud-rain"></i><span>Stop zone today</span><em>${rule('stop')} m</em></div>`;
  }
  let rpSafetyKey = '';
  setInterval(() => {
    const key = `${S.beltOn}|${S.flag}|${S.proxEvents.length}`;
    const el = $('#rpSafety');
    if (!el || key === rpSafetyKey) return;
    rpSafetyKey = key;
    el.innerHTML = rpSafetyHTML();
    icons();
  }, 600);

  function renderRight() {
    const rp = $('#rightPanel');
    rp.innerHTML = `
      <div class="panel-head">
        <button class="icon-btn" id="toggleRight" type="button" aria-label="Hide right now panel" aria-expanded="true"><i data-lucide="panel-right-close"></i></button>
        <span class="panel-title">Right now</span>
        <span class="rp-head-extra">Live</span>
      </div>
      <div class="rp-body">
        ${(() => {
          const { rows } = planDay();
          const cur = rows.find((r) => r.state === 'active');
          const left = cur ? Math.max(1, Math.round(cur.end - D.LIVE)) : 0;
          const done = cur ? Math.min(100, Math.max(0, pct(D.LIVE, cur.start, cur.end))) : 0;
          const g = ghostAt(D.LIVE);
          return `<section class="rp-card rp-now">
            <span class="rp-now-k"><i data-lucide="play"></i>Now</span>
            <b class="rp-now-job">${cur ? cur.t.type : 'No job running'}</b>
            ${cur ? `<span class="rp-now-left"><b class="num">${left}</b> min left</span>
            <span class="rp-now-bar" aria-hidden="true"><i style="width:${done}%"></i></span>
            <div class="rp-now-facts"><span><i data-lucide="map-pin"></i>${cur.zone}</span><span><i data-lucide="${WICON[cur.t.weather]}"></i>${cur.t.weather === 'Rainy' ? 'Rain' : cur.t.weather}</span>${g ? `<span class="${g.delta > 0 ? 'behind' : 'ahead'}"><i data-lucide="timer"></i>${g.delta > 0 ? '+' : '-'}${mmss(g.delta)}</span>` : ''}</div>` : ''}
            <button class="rp-link" type="button" data-go="tasks">Today's jobs <i data-lucide="chevron-right"></i></button>
          </section>`;
        })()}
        <section class="rp-card" id="rpSafety">${rpSafetyHTML()}</section>
        <section class="rp-card">
          <div class="rp-h"><h2>Machine</h2><button class="rp-link" type="button" data-go="machine">Details <i data-lucide="chevron-right"></i></button></div>
          ${D.health.filter((h) => h.st !== 'ok').map((h) => `<div class="rp-row ${h.st}"><i data-lucide="${h.icon}"></i><span>${h.name}</span><em>${h.label}</em></div>`).join('')}
          <div class="rp-ok"><i data-lucide="circle-check"></i>${D.health.filter((h) => h.st === 'ok').map((h) => h.name).join(', ')} OK</div>
        </section>
        <section class="rp-card">
          <div class="rp-h"><h2>Alerts</h2><span class="rp-count">${D.alerts.length}</span><button class="rp-link" type="button" data-go="safety/reports">See all <i data-lucide="chevron-right"></i></button></div>
          <div class="alert-list" id="alertList">
            ${D.alerts.slice(0, 3).map((a) => `<div class="rp-alert ${a.tone}"><i class="rp-dot"></i><b>${a.title.replace(/\. .*/, '')}</b><small>${a.time.startsWith('Today') ? a.time.slice(6) : a.time.split(' ').slice(0, 2).join(' ')}</small></div>`).join('')}
          </div>
        </section>
      </div>
      <div class="rp-strip">
        <button class="glance" type="button" data-expand data-tip="<b>Current job</b> · about 52 min"><i data-lucide="timer"></i><b>52m</b></button>
        <button class="glance" type="button" data-expand data-tip="<b>Seatbelt</b>" id="glBelt"><i data-lucide="armchair"></i><span class="dot" style="background:var(--ok)"></span></button>
        <button class="glance" type="button" data-expand data-tip="<b>Fault</b> · boom cylinder leaking"><i data-lucide="heart-pulse"></i><span class="dot" style="background:var(--crit)"></span></button>
        <button class="glance" type="button" data-expand data-tip="<b>${D.alerts.length} alerts</b> open"><i data-lucide="bell"></i><b>${D.alerts.length}</b><span class="dot" style="background:var(--crit)"></span></button>
      </div>`;
    icons();
    countUp(rp);
    rp.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]');
      if (g) { go(g.dataset.go); if (isMobile()) closeDrawers(); return; }
      if (e.target.closest('#toggleRight')) { isMobile() ? closeDrawers() : setPanels(S.leftCollapsed, !S.rightCollapsed, true); return; }
      if (e.target.closest('[data-expand]')) setPanels(S.leftCollapsed, false, true);
    });
  }

  function updateGlances(st) {
    const b = $('#glBelt');
    if (!b) return;
    b.querySelector('.dot').style.background = st.beltOff ? 'var(--crit)' : 'var(--ok)';
    b.dataset.tip = `<b>Seatbelt</b> · ${st.beltOff ? 'unfastened' : 'fastened'}`;
  }

  /* =========================================================
     PANELS: collapse on click, auto-collapse by width, drawers on phones
     ========================================================= */
  const mqRight = matchMedia('(max-width: 1279px)');
  const mqLeft = matchMedia('(max-width: 1023px)');
  const mqMobile = matchMedia('(max-width: 760px)');
  const isMobile = () => mqMobile.matches;

  function setPanels(leftC, rightC, user) {
    S.leftCollapsed = leftC; S.rightCollapsed = rightC;
    app.classList.toggle('left-collapsed', leftC);
    app.classList.toggle('right-collapsed', rightC);
    const tl = $('#toggleLeft'), tr = $('#toggleRight');
    if (tl) {
      tl.innerHTML = `<i data-lucide="${leftC ? 'panel-left-open' : 'panel-left-close'}"></i>`;
      tl.setAttribute('aria-label', leftC ? 'Show menu' : 'Hide menu');
      tl.setAttribute('aria-expanded', String(!leftC));
    }
    if (tr) {
      tr.innerHTML = `<i data-lucide="${rightC ? 'panel-right-open' : 'panel-right-close'}"></i>`;
      tr.setAttribute('aria-label', rightC ? 'Show right now panel' : 'Hide right now panel');
      tr.setAttribute('aria-expanded', String(!rightC));
    }
    icons();
    // keep the yellow active bar glued to its item while the grid springs
    const t0 = performance.now();
    const follow = (now) => { positionNavBar(); if (now - t0 < 650) requestAnimationFrame(follow); };
    requestAnimationFrame(follow);
    if (user) { try { localStorage.setItem('cat-panels', JSON.stringify({ leftC, rightC })); } catch (e) { /* storage blocked */ } }
  }
  function closeDrawers() {
    app.classList.remove('left-open', 'right-open');
    $('#scrim').classList.remove('on');
  }
  function openDrawer(side) {
    // a drawer on a phone always shows the full menu, never the icon strip
    if (isMobile() && (S.leftCollapsed || S.rightCollapsed)) setPanels(false, false, false);
    app.classList.add(side === 'left' ? 'left-open' : 'right-open');
    $('#scrim').classList.add('on');
  }
  function initPanels() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('cat-panels')); } catch (e) { /* storage blocked */ }
    app.style.transition = 'none';
    // first visit: menu open, right panel collapsed to its icon strip; after that, the operator's own choice
    setPanels(saved && !mqLeft.matches ? saved.leftC : mqLeft.matches, saved && !mqRight.matches ? saved.rightC : true, false);
    requestAnimationFrame(() => requestAnimationFrame(() => { app.style.transition = ''; }));
    mqRight.addEventListener('change', (e) => setPanels(S.leftCollapsed, e.matches, false));
    mqLeft.addEventListener('change', (e) => setPanels(e.matches, S.rightCollapsed, false));
    mqMobile.addEventListener('change', closeDrawers);
    $('#userBtn').addEventListener('click', () => { go('profile'); if (isMobile()) closeDrawers(); });
    $('#tbAvatar').addEventListener('click', () => go('profile'));
    $('#toggleLeft').addEventListener('click', () => (isMobile() ? closeDrawers() : setPanels(!S.leftCollapsed, S.rightCollapsed, true)));
    $('#openNav').addEventListener('click', () => openDrawer('left'));
    $('#openStatus').addEventListener('click', () => openDrawer('right'));
    $('#scrim').addEventListener('click', closeDrawers);
    $('#nav').addEventListener('click', () => { if (isMobile()) closeDrawers(); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });

    // top bar clock runs from the live replay time
    const started = Date.now();
    const tick = () => { $('#clock').textContent = hhmm(D.LIVE + (Date.now() - started) / 60000); };
    tick(); setInterval(tick, 15000);
  }

  /* =========================================================
     SOS: hold 1.5 s, then a staged emergency sequence
     ========================================================= */
  function holdable(btn, ms, onDone) {
    let timer;
    const start = (e) => {
      if (e.type === 'keydown' && (e.repeat || (e.key !== ' ' && e.key !== 'Enter'))) return;
      e.preventDefault();
      btn.classList.add('holding');
      timer = setTimeout(() => { btn.classList.remove('holding'); onDone(); }, ms);
    };
    const cancel = () => { clearTimeout(timer); btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('keydown', start);
    ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach((ev) => btn.addEventListener(ev, cancel));
    btn.addEventListener('click', (e) => { if (e.detail === 0) return; toast('Press and hold SOS to send it.', 'hand'); });
  }

  let sosTimers = [];
  function openSOS() {
    const o = $('#sosOverlay');
    const sentAt = $('#clock').textContent;
    const steps = [
      ['octagon-pause', 'Machine stopped', 'Arm locked and engine slowed down. Tracks will not move.'],
      ['radio', 'Supervisor A. Singh told', 'By radio and phone, with the camera view.'],
      ['ambulance', 'Site medic on the way', 'About 4 minutes away.'],
      ['map-pin', 'Your location sent', 'Zone B, trench line.'],
      ['hard-drive', 'What the machine was doing is saved', 'The last 60 seconds are added to the report.'],
    ];
    o.innerHTML = `
      <div class="sos-card">
        <div class="sos-top">
          <div class="beacon"><i></i><i></i><i></i><span><i data-lucide="siren"></i></span></div>
          <div><h2 id="sosTitle">SOS sent</h2><p>Help is coming. Stay in the cab if it is safe.</p></div>
        </div>
        <ol class="sos-steps">${steps.map(([ic, t, s2]) => `<li><span class="step-ico"><i data-lucide="check"></i></span><div><b>${t}</b><small>${s2}</small></div></li>`).join('')}</ol>
        <div class="sos-foot">
          <span class="meta">Sent at ${sentAt}</span>
          <button class="btn ghost-dark" type="button" data-sos="cancel">Cancel SOS</button>
          <button class="btn light" type="button" data-sos="ok">I'm safe</button>
        </div>
      </div>`;
    o.hidden = false;
    icons();
    requestAnimationFrame(() => o.classList.add('on'));
    S.flag = 'red'; applyFlag();
    const lis = $$('.sos-steps li', o);
    sosTimers.forEach(clearTimeout); sosTimers = [];
    lis.forEach((li, i) => {
      sosTimers.push(setTimeout(() => li.classList.add('working'), 250 + i * 650));
      sosTimers.push(setTimeout(() => { li.classList.remove('working'); li.classList.add('done'); }, 650 + i * 650));
    });
    addIncident('SOS sent', 'You', 'crit');
    o.querySelector('[data-sos="ok"]').focus();
  }
  function closeSOS(msg) {
    const o = $('#sosOverlay');
    sosTimers.forEach(clearTimeout);
    o.classList.remove('on');
    setTimeout(() => { o.hidden = true; o.innerHTML = ''; }, 260);
    S.flag = 'green'; applyFlag();
    if (msg) toast(msg, 'shield-check');
    if (S.route === 'incidents' || S.route === 'safety') go(S.route);
  }
  function initSOS() {
    holdable($('#sosBtn'), 1500, openSOS);
    $('#sosOverlay').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sos]');
      if (!b) return;
      closeSOS(b.dataset.sos === 'cancel' ? 'SOS cancelled. Your supervisor was told it was a mistake.' : 'Thanks. Your supervisor will still call you.');
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sosOverlay').hidden) closeSOS('SOS cancelled. Your supervisor was told it was a mistake.'); });
  }

  /* ---------- global clicks ---------- */
  main.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { go(g.dataset.go); return; }
    const t = e.target.closest('[data-toast]');
    if (t) toast(t.dataset.toast, 'play');
  });
  addEventListener('resize', positionNavBar);
  addEventListener('hashchange', () => { const r = location.hash.slice(1); if (r && r !== S.route) go(r); });

  // LIVE: helpers shared with live.js (the optional backend connection)
  window.APP = { S, D, $, go, toast, icons, applyFlag, flashEdge, setMoving, addIncident, saveIncidents, updateSync, setOffline, rule };

  loadIncidents();
  initTheme();
  renderNav();
  renderRight();
  initPanels();
  initSOS();
  // restore the shift before the first screen is drawn, so nothing shows a stale belt or operator
  const sess = session('cat-session');
  if (session('cat-op')) applyOperator(session('cat-op'));
  if (sess === 'operator') { S.engine = 'on'; S.beltOn = true; }
  go(location.hash.slice(1) || 'home');
  $('#driveBtn').addEventListener('click', () => setMoving(!S.moving));
  updateSync();
  // where the shift is: not signed in, signed in but engine off (belt gate), or working
  if (sess === 'pending') showLogin('start');
  else if (sess !== 'manager' && sess !== 'operator') showLogin('who');
})();
