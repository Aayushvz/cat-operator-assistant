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
    settings: { haptics: true, voice: true, contrast: false, budget: 3, presets: true, share: false },
    watched: new Set(),
    psDismissed: new Set(),
    routeArg: null,
  };

  const NAV = [
    { id: 'home', icon: 'house', en: 'Home', hi: 'होम', group: 'Work' },
    { id: 'tasks', icon: 'list-checks', en: 'My jobs', hi: 'मेरे काम', group: 'Work' },
    { id: 'estimator', icon: 'timer', en: 'Job time', hi: 'काम का समय', group: 'Work' },
    { id: 'safety', icon: 'shield-check', en: 'Safety', hi: 'सुरक्षा', group: 'Safety' },
    { id: 'incidents', icon: 'siren', en: 'Reports', hi: 'रिपोर्ट', group: 'Safety' },
    { id: 'training', icon: 'graduation-cap', en: 'Learn', hi: 'सीखें', group: 'Get better' },
    { id: 'insights', icon: 'fuel', en: 'Fuel and idle', hi: 'ईंधन और खाली समय', group: 'Get better' },
    { id: 'machine', icon: 'wrench', en: 'Machine', hi: 'मशीन', group: 'Machine' },
    { id: 'settings', icon: 'settings', en: 'Settings', hi: 'सेटिंग्स', group: 'Machine' },
  ];
  const GROUP_HI = { Work: 'काम', Safety: 'सुरक्षा', 'Get better': 'बेहतर बनें', Machine: 'मशीन' };
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
    let last = '';
    nav.innerHTML = `<span class="nav-bar" id="navBar" aria-hidden="true"></span>` + NAV.map((n) => {
      const head = n.group !== last ? `<div class="nav-group">${S.lang === 'hi' ? GROUP_HI[n.group] : n.group}</div>` : '';
      last = n.group;
      return `${head}<button class="nav-item${S.route === n.id ? ' active' : ''}" data-route="${n.id}" data-tip-c="${n[S.lang]}" type="button" ${S.route === n.id ? 'aria-current="page"' : ''}>
        <i data-lucide="${n.icon}"></i><span>${n[S.lang]}</span></button>`;
    }).join('');
    icons();
    positionNavBar();
  }
  function positionNavBar() {
    const a = $('.nav-item.active'), bar = $('#navBar');
    if (bar) bar.style.opacity = a ? 1 : 0;
    if (a && bar) bar.style.transform = `translateY(${a.offsetTop + 10}px)`;
  }
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-route]');
    if (b) go(b.dataset.route);
  });

  const EXTRA_ROUTES = ['profile', 'video'];
  function go(target) {
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
    positionNavBar();
    if (route !== 'home') Machine3D.stop();
    ({ home: renderHome, tasks: renderTasks, safety: renderSafety, training: renderTraining, insights: renderInsights,
      estimator: renderEstimator, incidents: renderIncidents, machine: renderMachine,
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
    if (key === 'cab') return st.beltOff ? ['crit', 'Belt off'] : ['ok', 'Belt on'];
    if (key === 'undercarriage') return ['warn', 'Tracks worn'];
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
        R('armchair', 'Seatbelt', st.beltOff ? 'Unfastened' : 'Fastened', st.beltOff ? 'crit' : 'ok'),
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
      case 'hydraulics': return { title: 'Boom and hydraulics', rows: [
        R('thermometer', 'Hydraulic oil', '62 °C', 'ok'),
        R('gauge', 'Pump pressure', st.kind === 'work' ? '318 bar' : '40 bar'),
        R('repeat', 'Loads today', fmt(cyc)),
        R('shield-check', 'Status', 'OK', 'ok'),
      ] };
      case 'bucket': return { title: 'Bucket', rows: [
        R('repeat', 'Loads today', fmt(cyc)),
        R('timer', 'Time per load', '21 sec'),
        R('shovel', 'Teeth wear', '18%', '', 0.18),
        R('weight', 'Weight per bucket', 'About 1.1 t'),
      ] };
      case 'undercarriage': return { title: 'Undercarriage', rows: [
        R('tractor', 'Track wear', '64%', 'warn', 0.64),
        R('triangle-alert', 'Left track', 'Too loose', 'warn'),
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
    <g class="bp-g" data-part="hydraulics">
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
          <div class="replay-top">
            <button class="play" id="playBtn" type="button" aria-label="Pause replay"><i data-lucide="${S.paused ? 'play' : 'pause'}"></i></button>
            <span class="label">Replay speed</span>
            <div class="pills">${[1, 2, 4].map((s) => `<button class="pill${S.speed === s ? ' active' : ''}" data-speed="${s}" type="button">${s}x</button>`).join('')}</div>
            <button class="live" id="liveBtn" type="button">Back to now</button>
          </div>
          <div class="track" id="track" aria-label="Shift replay timeline, 08:00 to 18:00">
            <div class="ticks">${ticks}</div>
            <div class="segs">${segmentsHTML()}</div>
            ${D.alertsOnTrack.map((a) => `<span class="alert-dot" style="left:${pct(a.t, 0, 600)}%" data-tip="<b>${hhmm(a.t)}</b> ${a.text}"></span>`).join('')}
            <div class="hours">${[0, 120, 240, 360, 480, 600].map((m) => `<span data-m="${m}" style="left:${pct(m, 0, 600)}%">${hhmm(m)}</span>`).join('')}</div>
            <div class="playhead" id="playhead"><span class="playhead-time" id="phTime"></span></div>
          </div>
          <div class="chips">
            <span class="k">Now:</span><span class="chip ink" id="chipStatus"></span>
            <span class="chip"><i data-lucide="user-round"></i>Operator: OP1001</span>
            <span class="chip" id="chipTask"><i data-lucide="shovel"></i>Job: Trenching</span>
            <span class="chip"><i data-lucide="cloud-rain"></i>Rain, 24°C</span>
          </div>
        </div>
      </section>

    </div>`;

    icons();
    setOverview(S.hotspot, false);
    updateReplay(true);
    bindHome();

    const stage = $('#stage');
    const ok = Machine3D.mount(stage, $('#three'));
    if (ok) {
      Machine3D.onFrame(frame);
      Machine3D.start();
      setTimeout(() => stage.classList.remove('loading'), 60);
    } else {
      stage.classList.remove('loading');
    }
  }

  function segmentsHTML() {
    const out = [];
    D.segments.forEach((s) => {
      if (s.kind === 'break') return;
      const a = s.from, b = Math.min(s.to, D.LIVE);
      if (b > a) out.push(`<span class="seg ${s.kind}" style="left:${pct(a, 0, 600)}%;width:${pct(b, 0, 600) - pct(a, 0, 600)}%" data-tip="<b>${hhmm(a)} to ${hhmm(b)}</b> ${s.kind === 'work' ? 'Working' : 'Waiting'}${s.task ? ' · ' + s.task : ''}${s.beltOff ? ' · belt off' : ''}"></span>`);
    });
    out.push(`<span class="seg future" style="left:${pct(D.LIVE, 0, 600)}%;width:${100 - pct(D.LIVE, 0, 600)}%"></span>`);
    return out.join('');
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
      $$('.hs').forEach((h) => h.classList.toggle('active', h.dataset.hs === key));
    };
    if (animate && !reduce) {
      body.classList.add('swap');
      void body.offsetWidth;
      apply();
      requestAnimationFrame(() => body.classList.remove('swap'));
    } else apply();
    conProgress = key === 'machine' ? 0 : 0.001;
    conStart = performance.now();
  }

  function openOverview(open) {
    S.overviewOpen = open;
    $('#overview').classList.toggle('closed', !open);
    $('#xbtn').classList.toggle('closed', !open);
    if (!open) $$('.hs').forEach((h) => h.classList.remove('active'));
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
      if (sp) { S.speed = +sp.dataset.speed; $$('.pill').forEach((p) => p.classList.toggle('active', p === sp)); return; }
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
  function updateBelt(st) {
    const card = $('#beltCard');
    if (!card) return;
    const t = S.t, wins = beltWindows();
    const onMin = D.segments.filter((x) => x.kind !== 'break').reduce((a, x) => a + Math.max(0, Math.min(t, x.to) - x.from), 0);
    const offMin = wins.reduce((a, [f, e]) => a + Math.max(0, Math.min(t, e) - f), 0);
    const pct = onMin > 0 ? Math.round((1 - offMin / onMin) * 100) : 100;
    const state = st.kind === 'break' ? 'na' : st.beltOff ? 'off' : 'on';
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
      : state === 'off' ? (st.kind === 'work' ? 'Stop. Put your belt on.' : `Off for ${Math.floor(t - offNow[0])} min while waiting`)
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
    const st = stateAt(S.t);
    Machine3D.setState && Machine3D.setState(st.kind);
    updateGlances(st);
    updateGhost();
    updateBelt(st);
    updatePitstop(st);
    const chip = $('#chipStatus');
    chip.textContent = st.kind === 'work' ? (st.beltOff ? 'Working, belt off' : 'Working') : st.kind === 'idle' ? (st.beltOff ? 'Waiting, belt off' : 'Waiting') : 'Lunch';
    chip.className = `chip ink${st.kind === 'idle' ? ' idle' : st.kind === 'break' ? ' break' : ''}`;
    const task = $('#chipTask');
    if (task) task.lastChild.textContent = `Job: ${st.task || (st.kind === 'break' ? 'Lunch break' : 'Waiting for a truck')}`;
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
    if (S.overviewOpen && S.hotspot !== 'machine') {
      const sr = stage.getBoundingClientRect(), xr = $('#xbtn').getBoundingClientRect();
      const a = { x: xr.right - sr.left, y: xr.top - sr.top + xr.height / 2 };
      const b = Machine3D.project(S.hotspot);
      const p = reduce ? 1 : Math.min(1, (now - conStart) / 400);
      const e = 1 - Math.pow(1 - p, 3);
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
  const head = (id, sub, right = '') => `<div class="page-head"><div><h1>${label(id)}</h1><p>${sub}</p></div>${right}</div>`;
  const WICON = { Sunny: 'sun', Rainy: 'cloud-rain', Cloudy: 'cloud', Windy: 'wind' };

  /* ---------- TASKS ---------- */
  function renderTasks() {
    const P = (t) => D.predict(t.est, t.skill, t.weather, t.age);
    const plan = [
      { t: D.tasks[0], start: 0, status: 'done', zone: 'Zone A' },
      { t: D.tasks[3], start: 70, status: 'done', zone: 'Zone A pad' },
      { t: D.tasks[1], start: 380, status: 'active', zone: 'Zone B' },
      { t: D.tasks[2], start: 440, status: 'next', zone: 'Stockpile C' },
      { t: D.tasks[4], start: 490, status: 'next', zone: 'Block D' },
    ];
    const MAX = 630;
    const blocks = plan.map((p, i) => {
      const done = p.status === 'done';
      const len = done ? p.t.actual : P(p.t);
      const over = done ? 0 : Math.max(0, P(p.t) - p.t.est);
      const w = pct(len, 0, MAX);
      return `<div class="stint ${p.status} rise" style="--i:${i};left:${pct(p.start, 0, MAX)}%;width:${w}%"
        data-tip="<b>${p.t.id} ${p.t.type}</b><br>${hhmm(p.start)} to ${hhmm(p.start + len)} · ${done ? `took ${p.t.actual} min` : `expect ${Math.round(P(p.t))} min (plan was ${p.t.est})`}">
        ${over ? `<span class="over" style="width:${(over / len) * 100}%"></span>` : ''}
        <b>${p.t.id}</b><small>${p.t.type}</small></div>`;
    }).join('');

    main.innerHTML = `<div class="page">
      ${head('tasks', '5 jobs today on EXC001. The times already include the rain and your experience.',
        `<button class="btn" type="button" data-go="estimator"><i data-lucide="timer"></i>Check a job time</button>`)}
      <div class="grid">
        <div class="card pcard c12 rise">
          <h3>Today's plan</h3><div class="sub">08:00 to 18:30. Striped ends mean the job will likely run late. The yellow line is now.</div>
          <div class="legend" style="margin-top:12px"><span><i class="sw" style="background:#EDEDEA;border:1px solid var(--line)"></i>Done</span><span><i class="sw" style="background:var(--ink)"></i>Doing now</span><span><i class="sw" style="background:#fff;border:1px solid var(--line)"></i>Next</span><span><i class="sw" style="background:repeating-linear-gradient(-45deg,rgba(255,170,2,.7) 0 3px,rgba(255,170,2,.25) 3px 6px)"></i>Likely late</span><span><i class="sw" style="border:1px dashed var(--info)"></i>Rain</span></div>
          <div class="strip" style="margin-top:36px">
            <div class="strip-row">
              <div class="rain-zone" style="left:${pct(360, 0, MAX)}%;width:${pct(480, 0, MAX) - pct(360, 0, MAX)}%"><span class="rain-tag" style="left:8px"><i data-lucide="cloud-rain"></i>Rain 14:00 to 16:00, adds 4 min to trenching</span></div>
              ${blocks}
              <span class="pause" style="position:absolute;left:${pct(240, 0, MAX)}%;width:${pct(60, 0, MAX)}%;top:26px;text-align:center;font-size:11px;color:var(--t3)">Lunch</span>
              <span class="now-line" style="left:${pct(D.LIVE, 0, MAX)}%" data-tip="<b>Now</b> ${hhmm(D.LIVE)}"></span>
            </div>
            <div class="strip-hours">${[0, 120, 240, 360, 480, 600].map((m) => `<span style="left:${pct(m, 0, MAX)}%">${hhmm(m)}</span>`).join('')}</div>
          </div>
        </div>
        ${plan.map((p, i) => {
          const pr = P(p.t), done = p.status === 'done';
          const hi = Math.max(p.t.est, pr * 1.08, p.t.actual) * 1.15;
          return `<div class="card task-card c4 rise" style="--i:${i + 1}">
            <div class="task-top"><span class="tag ${p.status === 'active' ? 'active' : done ? 'done' : ''}">${done ? '<i data-lucide="check" style="width:12px;height:12px"></i>Done' : p.status === 'active' ? 'Doing now' : 'Next'}</span><span class="num" style="font-size:14px;color:var(--t2)">${p.t.id}</span></div>
            <h4>${p.t.type}</h4>
            <div class="meta"><span><i data-lucide="map-pin"></i>${p.zone}</span><span><i data-lucide="${WICON[p.t.weather]}"></i>${p.t.weather}</span><span><i data-lucide="hard-hat"></i>${p.t.skill}</span><span><i data-lucide="calendar"></i>Machine ${p.t.age} years old</span></div>
            <div>
              <div class="range" data-tip="Plan <b>${p.t.est}</b> · expect <b>${pr.toFixed(0)}</b>${done ? ` · took <b>${p.t.actual}</b>` : ''} min">
                <div class="range-track"></div>
                <div class="range-band" style="left:${pct(pr * 0.92, 0, hi)}%;width:${pct(pr * 1.08, 0, hi) - pct(pr * 0.92, 0, hi)}%"></div>
                ${done ? `<div class="range-fill growx" style="width:${pct(p.t.actual, 0, hi)}%"></div>` : p.status === 'active' ? `<div class="range-fill growx" style="width:${pct(31, 0, hi)}%"></div>` : ''}
                <span class="range-tick plan" style="left:${pct(p.t.est, 0, hi)}%"></span>
                <span class="range-tick pred" style="left:${pct(pr, 0, hi)}%"></span>
              </div>
              <div class="range-scale"><span>Plan ${p.t.est} min</span><span><b style="color:var(--text)">${done ? `Took ${p.t.actual}` : `Expect ${Math.round(pr * 0.92)} to ${Math.round(pr * 1.08)}`}</b> min</span></div>
            </div>
          </div>`;
        }).join('')}
      </div></div>`;
  }

  /* ---------- SAFETY ---------- */
  const FLAGS = {
    green: { icon: 'flag', t: 'All clear', s: 'Work as normal.' },
    yellow: { icon: 'triangle-alert', t: 'Slow down', s: 'Someone is near the machine. Watch your swing.' },
    red: { icon: 'octagon-x', t: 'Stop now', s: 'A person is inside your swing area.' },
    blue: { icon: 'truck', t: 'Give way', s: 'A dump truck is coming from the left.' },
  };
  const CHECKS = [
    { icon: 'footprints', l: 'Walk around' }, { icon: 'scan-eye', l: 'Mirrors' }, { icon: 'droplet', l: 'Oil and fluids' },
    { icon: 'camera', l: 'Cameras' }, { icon: 'armchair', l: 'Belt on' },
  ];

  function renderSafety() {
    const f = FLAGS[S.flag];
    const allDone = S.lights.every(Boolean);
    const tel = D.telemetry;
    // seatbelt vs idle chart
    const W = 520, H = 210, pl = 34, pb = 44, pt = 22, bw = 58;
    const x = (i) => pl + 30 + i * ((W - pl - 60) / 3);
    const y = (v) => pt + (1 - v / 70) * (H - pt - pb);
    const belt = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minutes waiting at each reading, and whether the belt was on">
      <defs><pattern id="hatchC" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#D61D1D"/><rect width="2.5" height="6" fill="#F07B7B"/></pattern></defs>
      ${[0, 20, 40, 60].map((v) => `<line class="grid-l" x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
      ${tel.map((r, i) => {
        const off = r.belt === 'Unfastened';
        return `<g data-tip="<b>${r.label}</b><br>Waiting ${r.idle} min · belt ${r.belt === 'Fastened' ? 'on' : 'off'} · ${r.cycles} loads">
          <rect class="grow" style="--i:${i}" x="${x(i) - bw / 2}" y="${y(r.idle)}" width="${bw}" height="${y(0) - y(r.idle)}" rx="4" fill="${off ? 'url(#hatchC)' : '#080808'}"/>
          <text class="lbl" x="${x(i)}" y="${y(r.idle) - 7}" text-anchor="middle">${r.idle} min</text>
          <text x="${x(i)}" y="${H - 24}" text-anchor="middle">${r.label}</text>
          <text x="${x(i)}" y="${H - 8}" text-anchor="middle" style="fill:${off ? 'var(--crit-ink)' : 'var(--ok-ink)'};font-weight:600">${off ? 'Belt off' : 'Belt on'}</text></g>`;
      }).join('')}
    </svg>`;

    const ang = (deg, r) => [140 + r * Math.cos((deg * Math.PI) / 180), 140 + r * Math.sin((deg * Math.PI) / 180)];
    const [px, py] = ang(205, 94), [tx, ty] = ang(-35, 122);
    const radar = `<div class="radar-wrap"><div class="sweep"></div>
      <svg viewBox="0 0 280 280" role="img" aria-label="One person in the slow zone, one truck coming closer">
        <circle cx="140" cy="140" r="132" fill="none" stroke="#E6E6E3"/>
        <circle cx="140" cy="140" r="104" fill="rgba(255,170,2,.08)" stroke="#FFAA02" stroke-dasharray="4 4"/>
        <circle cx="140" cy="140" r="62" fill="rgba(214,29,29,.07)" stroke="#D61D1D"/>
        <line x1="140" y1="8" x2="140" y2="272" stroke="#EFEFEC"/><line x1="8" y1="140" x2="272" y2="140" stroke="#EFEFEC"/>
        <g transform="rotate(-20 140 140)"><rect x="126" y="122" width="28" height="36" rx="4" fill="#FFCD11" stroke="#080808"/><rect x="134" y="84" width="8" height="40" rx="2" fill="#FFCD11" stroke="#080808"/></g>
        <circle class="blip" cx="${px}" cy="${py}" r="7" fill="#FFAA02"/>
        <circle cx="${px}" cy="${py}" r="6" fill="#FFAA02" stroke="#fff" stroke-width="2" data-tip="<b>Worker</b> · 9.4 m away · slow zone"/>
        <rect x="${tx - 7}" y="${ty - 7}" width="14" height="14" rx="3" fill="#3A8DFF" stroke="#fff" stroke-width="2" data-tip="<b>Dump truck</b> · 12 m away · coming closer"/>
        <text x="140" y="${140 - 68}" text-anchor="middle" style="font:500 10px Roboto Condensed;fill:#B3161B">6 m stop</text>
        <text x="140" y="${140 - 110}" text-anchor="middle" style="font:500 10px Roboto Condensed;fill:#9A6300">10 m slow</text>
      </svg></div>`;

    main.innerHTML = `<div class="page">
      ${head('safety', 'Warnings show as a colour around the screen, so you see them without reading.')}
      <div class="grid">
        <div class="card pcard c5 rise flag-tile">
          <div><h3>Site warning</h3><div class="sub">Tap one to see how it looks in the cab.</div></div>
          <div class="flag-big ${S.flag}" id="flagBig"><i data-lucide="${f.icon}"></i><div><b>${f.t}</b><small>${f.s}</small></div></div>
          <div class="opt-row">${Object.keys(FLAGS).map((k) => `<button class="opt${S.flag === k ? ' active' : ''}" data-flag="${k}" type="button" style="height:48px;padding:0 18px">${FLAGS[k].t}</button>`).join('')}</div>
        </div>
        <div class="card pcard c7 rise" style="--i:1">
          <h3>Before you start</h3><div class="sub">Do all 5 checks. The red lights go out when you are ready. Belt goes last.</div>
          <div class="gantry${allDone ? ' go' : ''}" id="gantry">${S.lights.map((d) => `<span class="light${d ? '' : ' on'}"></span>`).join('')}</div>
          <div class="checks">${CHECKS.map((c, i) => `<button class="check${S.lights[i] ? ' done' : ''}" data-check="${i}" type="button"><i data-lucide="${S.lights[i] ? 'check' : c.icon}"></i>${c.l}</button>`).join('')}</div>
          <div class="go-msg" id="goMsg">${allDone ? '<i data-lucide="circle-check" style="color:var(--ok)"></i>All done. You can start.' : `${S.lights.filter(Boolean).length} of 5 done`}</div>
        </div>
        <div class="card pcard c7 rise" style="--i:2">
          <h3>When the belt came off</h3><div class="sub">Minutes spent waiting at each machine reading. Red stripes mean the belt was off.</div>
          ${belt}
          <div class="note"><i data-lucide="lightbulb"></i><span><b>Both times, the belt came off during a wait of about an hour.</b> The risky part is starting work again. The screen checks your belt as soon as you move the joystick.</span></div>
        </div>
        <div class="card pcard c5 rise" style="--i:3">
          <h3>Who is near you</h3><div class="sub">People and vehicles around the machine.</div>
          ${radar}
          <div class="legend" style="justify-content:center;margin-top:10px"><span><i class="sw" style="background:#FFAA02;border-radius:50%"></i>Person</span><span><i class="sw" style="background:#3A8DFF"></i>Vehicle</span><span><i class="sw" style="border:1px solid #D61D1D"></i>Stop zone</span></div>
        </div>
        <div class="card pcard c5 rise" style="--i:4">
          <h3>Site conditions</h3><div class="sub">Right now on site.</div>
          <div class="cond">
            <div><span><i data-lucide="cloud-rain"></i>Weather</span><b>Rain</b></div>
            <div><span><i data-lucide="thermometer"></i>Temperature</span><b>24 °C</b></div>
            <div><span><i data-lucide="eye"></i>Visibility</span><b>1.2 km</b></div>
            <div><span><i data-lucide="layers"></i>Ground</span><b>Wet clay</b></div>
            <div><span><i data-lucide="wind"></i>Wind</span><b>18 km/h</b></div>
            <div><span><i data-lucide="sun"></i>Heat risk</span><b>Low</b></div>
          </div>
          <div class="note"><i data-lucide="hand"></i><span><b>Rain mode is on.</b> Bigger buttons for wet gloves.</span></div>
        </div>
        <div class="card pcard c7 rise" style="--i:5">
          <h3>Report something</h3><div class="sub">Hold the button for 1 second, then say what happened.</div>
          <div class="hold-wrap">
            <button class="hold" id="holdBtn" type="button" aria-label="Hold to log incident">
              <svg viewBox="0 0 108 108" aria-hidden="true"><circle class="bg" cx="54" cy="54" r="52" fill="none" stroke-width="3"/><circle class="fg" cx="54" cy="54" r="52" fill="none" stroke-width="3" stroke-linecap="round"/></svg>
              HOLD
            </button>
            <div style="font-size:12.5px;color:var(--t2)">Works with gloves on. A bump will not set it off. Speak in your own language.</div>
          </div>
          <div class="inc-list" id="incList">${incRows(3)}</div>
        </div>
        <div class="card pcard c12 rise sos-card-inline" style="--i:6">
          <button class="sos-big" id="sosBig" type="button" aria-label="Hold for 1.5 seconds to send SOS">
            <svg class="ring" viewBox="0 0 124 124" aria-hidden="true"><circle class="fg" cx="62" cy="62" r="59" fill="none" stroke-width="3" stroke-linecap="round"/></svg>SOS</button>
          <div style="flex:1;min-width:260px">
            <h3>Emergency SOS</h3>
            <div class="sub">Hold for 1.5 seconds, here or at the top of the screen. In the cab it is the red button on the right. It does all of this at once:</div>
            <div class="sos-list" style="margin-top:14px">
              <div><i data-lucide="octagon-pause"></i>Stops the machine and locks the arm</div>
              <div><i data-lucide="radio"></i>Calls your supervisor on radio and phone</div>
              <div><i data-lucide="ambulance"></i>Sends the site medic to you</div>
              <div><i data-lucide="hard-drive"></i>Saves what the machine was doing</div>
            </div>
          </div>
        </div>
      </div></div>`;
    bindSafety();
    holdable($('#sosBig'), 1500, openSOS);
  }
  const SEV = { crit: ['crit', 'siren'], caution: ['caution', 'hourglass'], warn: ['warn', 'gauge'], info: ['info', 'mic'] };
  const incRows = (n) => S.incidents.slice(0, n).map((x, i) => `
    <div class="inc${x.fresh && i === 0 ? ' new' : ''}"><span class="a-ico ${SEV[x.sev][0]}"><i data-lucide="${SEV[x.sev][1]}"></i></span>
    <div class="a-txt"><b>${x.type}</b><small>${x.src}</small></div><span class="a-time">${x.time}</span></div>`).join('');

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
  function logIncident() {
    S.incidents.forEach((x) => (x.fresh = false));
    S.incidents.unshift({ time: 'Now', type: 'Your report, with voice note', src: 'You', sev: 'info', status: 'New', fresh: true });
    toast('Report saved. Your supervisor can see it.', 'mic');
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
      const ch = e.target.closest('[data-check]');
      if (ch) {
        const i = +ch.dataset.check;
        if (i === 4 && !S.lights.slice(0, 4).every(Boolean)) { toast('Do the other 4 checks first. Belt goes last.', 'armchair'); return; }
        S.lights[i] = !S.lights[i];
        if (!S.lights[i] && i < 4) S.lights[4] = false;
        const all = S.lights.every(Boolean);
        $$('.light').forEach((l, k) => l.classList.toggle('on', !S.lights[k]));
        $('#gantry').classList.toggle('go', all);
        $$('[data-check]').forEach((b, k) => { b.classList.toggle('done', S.lights[k]); b.innerHTML = `<i data-lucide="${S.lights[k] ? 'check' : CHECKS[k].icon}"></i>${CHECKS[k].l}`; });
        $('#goMsg').innerHTML = all ? '<i data-lucide="circle-check" style="color:var(--ok)"></i>All done. You can start.' : `${S.lights.filter(Boolean).length} of 5 done`;
        icons();
      }
    });
    bindHold(() => { logIncident(); $('#incList').innerHTML = incRows(3); icons(); });
  }

  /* ---------- TRAINING ---------- */
  function renderTraining() {
    const slots = [['Thu', '09:30'], ['Thu', '13:00'], ['Fri', '08:00'], ['Fri', '12:30'], ['Sat', '10:00'], ['Sat', '14:00']];
    main.innerHTML = `<div class="page">
      ${head('training', 'Videos picked from how you worked this week. They only play when the machine is stopped.')}
      <div class="grid">
        <div class="licence c4 rise">
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
      ${head('insights', 'Where fuel and time went, and what to do about it.')}
      <div class="grid">
        <div class="card pcard c3 rise kpi"><span class="eyebrow">Most time waiting</span><b><span data-count="${Math.round(intervals[0].share * 100)}">0</span>%</b><span class="delta"><span class="st crit">High</span>08:00 to 10:00 on 01 May</span></div>
        <div class="card pcard c3 rise kpi" style="--i:1"><span class="eyebrow">Most fuel per load</span><b><span data-count="2" data-dec="1">0</span> L</b><span class="delta"><span class="st crit">4 times normal</span>02 May 09:00</span></div>
        <div class="card pcard c3 rise kpi" style="--i:2"><span class="eyebrow">Belt off</span><b><span data-count="2">0</span> of 4</b><span class="delta"><span class="st crit">Both during long waits</span></span></div>
        <div class="card pcard c3 rise kpi" style="--i:3"><span class="eyebrow">Engine hours per load</span><b><span data-count="3.7" data-dec="1">0</span> hr</b><span class="delta"><span class="st warn">Check this</span>01 May 14:00 to 02 May 09:00</span></div>

        <div class="card pcard c7 rise" style="--i:4"><h3>Fuel per load</h3><div class="sub">Fuel used, divided by loads moved. Red is more than double the normal amount.</div>${lolli}</div>
        <div class="card pcard c5 rise" style="--i:5"><h3>Time spent waiting</h3><div class="sub">Share of engine time when the machine was not working.</div>
          <div style="display:flex;justify-content:space-around;margin-top:18px;flex-wrap:wrap;gap:8px">${intervals.map(donut).join('')}</div>
          <div class="legend" style="justify-content:center;margin-top:14px"><span><i class="sw" style="background:#FFAA02"></i>Idle</span><span><i class="sw" style="background:#080808"></i>Working or travelling</span></div></div>

        <div class="card pcard c7 rise" style="--i:6"><h3>Each load, step by step</h3><div class="sub">Dig, swing, dump and return times for 12 loads this morning.</div>
          <div class="legend" style="margin-top:12px"><span><i class="sw" style="background:var(--s-pb)"></i>P · Personal best</span><span><i class="sw" style="background:var(--s-best)"></i>B · Best this shift</span><span><i class="sw" style="background:var(--s-slow)"></i>S · Slower than usual</span><span><i class="sw" style="background:#E9E9E6"></i>On pace (seconds)</span></div>
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
    const W = 960, H = 290, pl = 190, pr = 30, pt = 20;
    const x = (v) => pl + ((v - 20) / 100) * (W - pl - pr);
    const rowY = (i) => pt + 24 + i * 48;
    const dumbbell = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Planned, actual and predicted minutes per task">
      ${[20, 40, 60, 80, 100, 120].map((v) => `<line class="grid-l" x1="${x(v)}" x2="${x(v)}" y1="${pt}" y2="${H - 30}"/><text x="${x(v)}" y="${H - 10}" text-anchor="middle">${v} min</text>`).join('')}
      ${tasks.map((t, i) => {
        const p = D.predict(t.est, t.skill, t.weather, t.age);
        const lo = Math.min(t.est, t.actual, p), hi = Math.max(t.est, t.actual, p), y = rowY(i);
        return `<g data-tip="<b>${t.id} ${t.type}</b><br>Planned ${t.est} · actual ${t.actual} · model ${p.toFixed(1)} min">
          <rect x="0" y="${y - 20}" width="${W}" height="40" fill="transparent"/>
          <text x="0" y="${y - 2}" style="fill:#0B0B0B;font-weight:600">${t.id} ${t.type}</text>
          <text x="0" y="${y + 13}">${t.weather} · ${t.skill} · ${t.age} yr</text>
          <line class="growx" style="--i:${i}" x1="${x(lo)}" x2="${x(hi)}" y1="${y}" y2="${y}" stroke="#D6D6D2" stroke-width="2"/>
          <circle class="pop" style="--i:${i}" cx="${x(t.est)}" cy="${y}" r="7" fill="#fff" stroke="#6B6B6B" stroke-width="2"/>
          <circle class="pop" style="--i:${i}" cx="${x(t.actual)}" cy="${y}" r="7" fill="#080808" stroke="#fff" stroke-width="2"/>
          <path class="pop" style="--i:${i}" d="M${x(p)} ${y - 8} L${x(p) + 8} ${y} L${x(p)} ${y + 8} L${x(p) - 8} ${y} Z" fill="#FFCD11" stroke="#080808" stroke-width="1.5"/>
        </g>`;
      }).join('')}
    </svg>`;

    main.innerHTML = `<div class="page">
      ${head('estimator', 'How long will a job take? Pick the job and today\'s conditions.')}
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
          <div style="display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-end">
            <div><h3>How close were we?</h3><div class="sub">Your 5 finished jobs: the plan, what really happened, and this tool's guess.</div></div>
            <div style="display:flex;gap:28px">
              <div class="kpi"><span class="eyebrow">Plan was off by</span><b style="font-size:32px"><span data-count="${(D.plannerError * 100).toFixed(1)}" data-dec="1">0</span>%</b></div>
              <div class="kpi"><span class="eyebrow">This tool was off by</span><b style="font-size:32px"><span data-count="${(D.modelError * 100).toFixed(1)}" data-dec="1">0</span>%</b></div>
            </div>
          </div>
          <div class="legend" style="margin:14px 0 4px"><span><i class="sw" style="background:#fff;border:2px solid #6B6B6B;border-radius:50%"></i>Planned</span><span><i class="sw" style="background:#080808;border-radius:50%"></i>Actual</span><span><i class="sw" style="background:#FFCD11;border:1px solid #080808;transform:rotate(45deg)"></i>Model</span></div>
          ${dumbbell}
          <div class="note"><i data-lucide="info"></i><span><b>Average difference from the real time.</b> The tool learns from every job you finish, so it gets closer over time.</span></div>
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

  /* ---------- INCIDENTS ---------- */
  function renderIncidents() {
    const stTone = { Open: 'crit', Checking: 'warn', 'Talked through': 'ok', Closed: 'ok', New: 'warn' };
    main.innerHTML = `<div class="page">
      ${head('incidents', 'Everything that went wrong or nearly did. The machine adds some, you add the rest.')}
      <div class="grid">
        <div class="card pcard c8 rise">
          <h3>All reports</h3><div class="sub">${S.incidents.length} reports</div>
          <table class="tbl"><thead><tr><th>When</th><th>What happened</th><th>From</th><th>Status</th></tr></thead>
          <tbody id="incBody">${S.incidents.map((x, i) => `<tr class="${x.fresh && i === 0 ? 'new' : ''}"><td>${x.time}</td><td style="display:flex;gap:10px;align-items:center"><span class="a-ico ${SEV[x.sev][0]}" style="width:26px;height:26px"><i data-lucide="${SEV[x.sev][1]}" style="width:13px;height:13px"></i></span>${x.type}</td><td style="color:var(--t2)">${x.src}</td><td><span class="st ${stTone[x.status]}">${x.status}</span></td></tr>`).join('')}</tbody></table>
        </div>
        <div class="card pcard c4 rise" style="--i:1">
          <h3>Report something</h3><div class="sub">Hold the button for 1 second.</div>
          <div class="hold-wrap" style="flex-direction:column;align-items:flex-start">
            <button class="hold" id="holdBtn" type="button" aria-label="Hold to log incident">
              <svg viewBox="0 0 108 108" aria-hidden="true"><circle class="bg" cx="54" cy="54" r="52" fill="none" stroke-width="3"/><circle class="fg" cx="54" cy="54" r="52" fill="none" stroke-width="3" stroke-linecap="round"/></svg>HOLD</button>
            <div style="font-size:12.5px;color:var(--t2)">In the cab, double-tap the thumb button on the joystick. Your hands stay on the controls.</div>
          </div>
        </div>
      </div></div>`;
    bindHold(() => { logIncident(); renderIncidents(); icons(); });
  }

  /* ---------- MACHINE ---------- */
  function renderMachine() {
    const eng = 1530.2, next = 1600.2, since = 1350.2;
    main.innerHTML = `<div class="page">
      ${head('machine', 'EXC001, 20-tonne excavator. How each part is doing.')}
      <div class="grid">
        <div class="card pcard c7 rise">
          <h3>Parts</h3><div class="sub">What needs attention, and when.</div>
          <table class="tbl"><thead><tr><th>Part</th><th>Status</th><th>Wear</th><th>Next step</th></tr></thead><tbody>
          ${[['cog', 'Engine', 'ok', 'Healthy', 22, 'Oil change at 1,600 hr'], ['droplets', 'Hydraulics', 'ok', 'Healthy', 31, 'Filter check at 1,600 hr'], ['tractor', 'Undercarriage', 'warn', 'Warning', 64, 'Adjust left track tension'], ['shovel', 'Bucket teeth', 'ok', 'Healthy', 18, 'Rotate teeth in 40 hr'], ['thermometer', 'Cooling', 'ok', 'Healthy', 12, 'Clean radiator in rain season']]
            .map(([ic, n, st, l, w, a], i) => `<tr><td><span style="display:flex;gap:10px;align-items:center"><i data-lucide="${ic}"></i>${n}</span></td><td><span class="st ${st}">${l}</span></td>
              <td style="width:160px"><div style="height:6px;border-radius:3px;background:var(--chip);overflow:hidden" data-tip="${w}% wear"><div class="growx" style="--i:${i};height:100%;width:${w}%;background:${w > 50 ? 'var(--warn)' : 'var(--ink)'};border-radius:3px"></div></div></td><td style="color:var(--t2)">${a}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="card pcard c5 rise" style="--i:1">
          <h3>Next service</h3><div class="sub">Every 250 engine hours.</div>
          <div class="kpi" style="margin-top:16px"><b><span data-count="${Math.round(next - eng)}">0</span> hr</b><span class="delta">left until ${fmt(next, 0)} hr · now ${fmt(eng, 1)} hr</span></div>
          <div style="height:8px;border-radius:4px;background:var(--chip);margin-top:14px;overflow:hidden"><div class="growx" style="height:100%;width:${pct(eng, since, next)}%;background:var(--ink)"></div></div>
          <div class="cond" style="margin-top:18px">
            <div><span>Machine ID</span><b>EXC001</b></div><div><span>Operator</span><b>OP1001</b></div>
            <div><span>Engine hours</span><b>${fmt(eng, 1)}</b></div><div><span>Connected</span><b style="color:var(--ok-ink)">Online</b></div>
          </div>
        </div>
      </div></div>`;
  }

  /* ---------- VIDEO PLAYER ---------- */
  const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  function renderVideo(id) {
    const v = D.videos.find((x) => x.id === id) || D.videos[0];
    const watched = S.watched.has(v.id);
    const next = D.videos.filter((x) => x.id !== v.id);
    main.innerHTML = `<div class="page video-page">
      <div class="vp-top">
        <button class="back" type="button" data-go="training"><i data-lucide="arrow-left"></i>Learn</button>
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
      }
    });
    const b = $('#budgetIn');
    if (b) b.addEventListener('input', (e) => { S.settings.budget = +e.target.value; $('#budgetV').textContent = S.settings.budget; });
  }

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
  function renderRight() {
    const est = D.tasks[1];
    const skillAdd = est.est * (D.factors.skill[est.skill] - 1);
    const rainAdd = est.est * D.factors.skill[est.skill] * (D.factors.weather[est.weather] - 1);
    const rp = $('#rightPanel');
    rp.innerHTML = `
      <div class="panel-head">
        <button class="icon-btn" id="toggleRight" type="button" aria-label="Hide right now panel" aria-expanded="true"><i data-lucide="panel-right-close"></i></button>
        <span class="panel-title">Right now</span>
        <span class="rp-head-extra">Live</span>
      </div>
      <div class="rp-body">
        <section class="rp-sec">
          <div class="sec-head"><i data-lucide="timer"></i><h2>Current job</h2><span class="status-chip">Working</span></div>
          <div class="eyebrow">Job 3 of 5 · Trenching</div>
          <div class="eta" style="margin-top:10px"><b class="num">0</b><small>HR</small><b class="num" data-count="52">52</b><small>MIN</small></div>
          <div class="eta-cap">Should take 48 to 56 min</div>
          <div class="mini">
            <div><span>Planned</span><b>45 min</b></div>
            <div><span>Weather</span><b>Rainy</b></div>
            <div><span>Your level</span><b>Intermediate</b></div>
          </div>
          <div class="range" data-tip="<b>31 min</b> elapsed · predicted 52 · planned 45">
            <div class="range-track"></div>
            <div class="range-band" style="left:${pct(48, 0, 60)}%;width:${pct(56, 0, 60) - pct(48, 0, 60)}%"></div>
            <div class="range-fill" id="rangeFill" style="width:100%;transform:scaleX(0)"></div>
            <span class="range-tick plan" style="left:${pct(45, 0, 60)}%"></span>
            <span class="range-tick pred" style="left:${pct(52, 0, 60)}%"></span>
          </div>
          <div class="range-scale"><span>0</span><span>15</span><span>30</span><span>45</span><span>60 min</span></div>
          <div class="factors"><span class="factor">+${Math.round(skillAdd)} min for experience</span><span class="factor">+${Math.round(rainAdd)} min for rain</span></div>
          ${(() => { const r = ghostAt(D.LIVE); return r ? `<div class="rp-ghost"><i data-lucide="ghost"></i><span>vs your best time</span><b class="${r.delta > 0 ? 'behind' : 'ahead'}">${r.delta > 0 ? '+' : '-'}${mmss(r.delta)}</b></div>` : ''; })()}
          <div class="stops">
            <div class="stop"><i></i>Trench line, Zone B</div>
            <div class="stop"><i class="hollow"></i>Dump point D2</div>
          </div>
          <button class="btn-ghost" type="button" data-go="tasks">See today's jobs <i data-lucide="chevron-right"></i></button>
        </section>
        <section class="rp-sec">
          <div class="sec-head"><i data-lucide="heart-pulse"></i><h2>Machine health</h2><button class="link" type="button" data-go="machine">View all <i data-lucide="chevron-right"></i></button></div>
          ${D.health.map((h) => `<div class="health-row"><i data-lucide="${h.icon}"></i><span>${h.name}</span><span class="st ${h.st}">${h.label}</span></div>`).join('')}
        </section>
        <section class="rp-sec">
          <div class="sec-head"><i data-lucide="bell"></i><h2>Alerts</h2><span class="count">${D.alerts.length}</span><button class="link" type="button" data-go="incidents">View all <i data-lucide="chevron-right"></i></button></div>
          <div class="alert-list" id="alertList">
            ${D.alerts.map((a) => `
              <div class="alert-row"><span class="a-ico ${a.tone}"><i data-lucide="${a.icon}"></i></span>
                <div class="a-txt"><b>${a.title}</b><small>${a.time}</small></div></div>`).join('')}
          </div>
        </section>
      </div>
      <div class="rp-strip">
        <button class="glance" type="button" data-expand data-tip="<b>Current job</b> · about 52 min"><i data-lucide="timer"></i><b>52m</b></button>
        <button class="glance" type="button" data-expand data-tip="<b>Seatbelt</b>" id="glBelt"><i data-lucide="armchair"></i><span class="dot" style="background:var(--ok)"></span></button>
        <button class="glance" type="button" data-expand data-tip="<b>Machine health</b> · tracks need a check"><i data-lucide="heart-pulse"></i><span class="dot" style="background:var(--warn)"></span></button>
        <button class="glance" type="button" data-expand data-tip="<b>${D.alerts.length} alerts</b> open"><i data-lucide="bell"></i><b>${D.alerts.length}</b><span class="dot" style="background:var(--crit)"></span></button>
      </div>`;
    icons();
    countUp(rp);
    setTimeout(() => { const f = $('#rangeFill'); if (f) f.style.transform = `scaleX(${31 / 60})`; }, 120);
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
    S.incidents.forEach((x) => (x.fresh = false));
    S.incidents.unshift({ time: sentAt, type: 'SOS sent', src: 'You', sev: 'crit', status: 'Open', fresh: true });
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

  initTheme();
  renderNav();
  renderRight();
  initPanels();
  initSOS();
  go(location.hash.slice(1) || 'home');
})();
