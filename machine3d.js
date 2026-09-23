// 320-class hydraulic excavator (EXC001), built procedurally in Three.js r128.
// Realism comes from: extruded tapered profiles (boom, stick, bucket), bevelled panels,
// a studio environment map for reflections, clear-coat paint, ACES tone mapping, and Cat decals.
window.Machine3D = (() => {
  let renderer, scene, camera, group, stage, canvas, raf = 0, running = false;
  let dragging = false, dragStartX = 0, dragOffset = 0, dragBase = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onFrameCbs = [];
  const BASE_ROT = -0.36; // default pose: three-quarter side view, Cat branding on the counterweight faces the viewer
  const MAX_DRAG = 25 * Math.PI / 180;
  // slow showroom rotation around the default pose: +-11 degrees over about 45 seconds
  const SWAY = 0.19, SWAY_SPEED = 0.14;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const anchors = {
    cab: V(0.85, 2.2, 1.24),
    engine: V(-1.1, 2.25, 0.55),
    hydraulics: V(1.62, 2.1, 0.05),
    bucket: V(4.5, 0.62, 0.24),
    undercarriage: V(0.3, 0.45, 1.45),
    proximity: V(-2.55, 2.16, 0.9),
  };

  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  function mats() {
    return {
      paint: new THREE.MeshPhysicalMaterial({ color: lin(0xffb000), roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.75 }),
      black: new THREE.MeshStandardMaterial({ color: lin(0x161616), roughness: 0.5, metalness: 0.2 }),
      track: new THREE.MeshStandardMaterial({ color: lin(0x1c1c1c), roughness: 0.85, metalness: 0.25 }),
      shoe: new THREE.MeshStandardMaterial({ color: lin(0x2e2e2c), roughness: 0.6, metalness: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ color: lin(0xf2f2f2), roughness: 0.07, metalness: 1 }),
      barrel: new THREE.MeshStandardMaterial({ color: lin(0x121212), roughness: 0.35, metalness: 0.4 }),
      rubber: new THREE.MeshStandardMaterial({ color: lin(0x0c0c0c), roughness: 0.7 }),
      glass: new THREE.MeshPhysicalMaterial({ color: lin(0x1d2a32), roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.42, clearcoat: 1, envMapIntensity: 1.6 }),
      interior: new THREE.MeshStandardMaterial({ color: lin(0x111111), roughness: 0.9 }),
      seat: new THREE.MeshStandardMaterial({ color: lin(0x2a2a2a), roughness: 0.95 }),
      lamp: new THREE.MeshStandardMaterial({ color: lin(0xffffff), emissive: lin(0xfff6dc), emissiveIntensity: 1.4, roughness: 0.2 }),
      screen: new THREE.MeshStandardMaterial({ color: lin(0x111111), emissive: lin(0xffcd11), emissiveIntensity: 0.9, roughness: 0.3 }),
    };
  }

  /* ---------- geometry helpers ---------- */
  function roundRect(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function extrude(shape, depth, b = 0.025) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 14 });
    geo.translate(0, 0, -(depth - 2 * b) / 2);
    return geo;
  }
  function mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  // bevelled box: the bevel grows outward, so shrink the shape to keep the outer size exact
  function rbox(w, h, d, r, mat, x, y, z, b = 0.025) {
    return mesh(extrude(roundRect(w - 2 * b, h - 2 * b, Math.max(0.002, r - b)), d, b), mat, x, y, z);
  }
  function box(w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
  function rod(a, b, r, mat, seg = 18) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    return m;
  }
  function pin(x, y, z, len, r, mat) {
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 20), mat, x, y, z);
    m.rotation.x = Math.PI / 2;
    return m;
  }
  // a tapered arm: sample a spline and offset it by a varying thickness
  function arm(ctrl, thick, depth, mat, z) {
    const curve = new THREE.SplineCurve(ctrl.map(([x, y]) => V2(x, y)));
    const n = 28, up = [], lo = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPoint(t), tan = curve.getTangent(t);
      const nx = -tan.y, ny = tan.x, h = thick(t) / 2;
      up.push(V2(p.x + nx * h, p.y + ny * h));
      lo.push(V2(p.x - nx * h, p.y - ny * h));
    }
    const shape = new THREE.Shape([...up, ...lo.reverse()]);
    const m = mesh(extrude(shape, depth, 0.03), mat, 0, 0, z);
    m.userData.curve = curve;
    return m;
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- decals ---------- */
  function loadImage(src) {
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }
  function decalMat(tex) {
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  }
  function boomDecal(img) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 280;
    const x = c.getContext('2d');
    x.fillStyle = '#141414';
    x.beginPath(); x.moveTo(70, 0); x.lineTo(1024, 0); x.lineTo(954, 280); x.lineTo(0, 280); x.closePath(); x.fill();
    x.fillStyle = '#C8102E';
    x.beginPath(); x.moveTo(880, 0); x.lineTo(950, 0); x.lineTo(880, 280); x.lineTo(810, 280); x.closePath(); x.fill();
    if (img) { const h = 190, w = h * (img.width / img.height); x.drawImage(img, 130, (280 - h) / 2, w, h); }
    return decalMat(new THREE.CanvasTexture(c));
  }
  function textDecal(text, w, h, color) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = color; x.font = `700 ${Math.round(h * 0.78)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    x.textBaseline = 'middle'; x.fillText(text, 4, h / 2 + 2);
    return decalMat(new THREE.CanvasTexture(c));
  }

  function build() {
    const M = mats();
    const g = new THREE.Group();

    /* undercarriage */
    [-1.05, 1.05].forEach((z) => {
      const side = z > 0 ? 1 : -1;
      g.add(rbox(4.0, 0.68, 0.74, 0.34, M.track, 0, 0.4, z, 0.03));
      for (let x = -1.66; x <= 1.67; x += 0.185) {
        g.add(box(0.13, 0.05, 0.78, M.shoe, x, 0.755, z));
        g.add(box(0.13, 0.05, 0.78, M.shoe, x, 0.045, z));
      }
      // sprocket, idler, rollers on the outer face
      [-1.66, 1.66].forEach((x) => {
        const w = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 24), M.black, x, 0.4, z + side * 0.385); w.rotation.x = Math.PI / 2; g.add(w);
        const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 16), M.shoe, x, 0.4, z + side * 0.41); hub.rotation.x = Math.PI / 2; g.add(hub);
      });
      [-1.0, -0.33, 0.33, 1.0].forEach((x) => { const r = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16), M.black, x, 0.2, z + side * 0.38); r.rotation.x = Math.PI / 2; g.add(r); });
      g.add(box(2.7, 0.14, 0.04, M.black, 0, 0.55, z + side * 0.38));
    });
    g.add(rbox(1.9, 0.36, 1.5, 0.08, M.black, 0, 0.56, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.2, 40), M.black, 0, 0.84, 0));

    /* upper structure */
    g.add(rbox(3.8, 0.16, 2.5, 0.05, M.paint, -0.45, 1.02, 0));
    g.add(rbox(2.3, 0.98, 2.44, 0.12, M.paint, -1.0, 1.56, 0));
    // counterweight with a rounded rear
    const cw = new THREE.Shape();
    cw.moveTo(0.36, -0.52); cw.lineTo(-0.1, -0.52); cw.quadraticCurveTo(-0.42, -0.52, -0.42, -0.2);
    cw.lineTo(-0.42, 0.24); cw.quadraticCurveTo(-0.42, 0.53, -0.12, 0.53); cw.lineTo(0.36, 0.53); cw.lineTo(0.36, -0.52);
    g.add(mesh(extrude(cw, 2.52, 0.03), M.paint, -2.3, 1.56, 0));
    // engine hood, exhaust, intake
    g.add(rbox(1.9, 0.2, 1.7, 0.08, M.paint, -1.15, 2.13, -0.2));
    g.add(rod(V(-1.45, 2.2, -0.75), V(-1.45, 2.78, -0.75), 0.065, M.black));
    g.add(rod(V(-1.45, 2.78, -0.75), V(-1.45, 2.82, -0.75), 0.075, M.chrome));
    g.add(rbox(0.36, 0.22, 0.36, 0.08, M.black, -0.55, 2.3, -0.6));
    // right-front tool box under the boom
    g.add(rbox(1.3, 0.82, 1.0, 0.1, M.paint, 0.86, 1.49, -0.72));
    // side grille, door seams, steps
    for (let i = 0; i < 7; i++) g.add(box(0.95, 0.025, 0.02, M.black, -0.95, 1.3 + i * 0.075, 1.225));
    [-0.2, -1.62].forEach((x) => g.add(box(0.012, 0.86, 0.01, M.black, x, 1.56, 1.226)));
    g.add(box(0.36, 0.05, 0.28, M.shoe, 0.35, 0.92, 1.28));
    // handrail along the top edge
    g.add(rod(V(-2.1, 2.36, 1.12), V(-0.25, 2.36, 1.12), 0.022, M.paint, 10));
    [-2.1, -1.2, -0.25].forEach((x) => g.add(rod(V(x, 2.05, 1.12), V(x, 2.36, 1.12), 0.022, M.paint, 10)));
    // rear camera
    g.add(rbox(0.16, 0.12, 0.2, 0.03, M.black, -2.58, 2.14, 0.9, 0.01));

    /* cab */
    const cx = 0.86, cz = 0.72;
    g.add(rbox(1.14, 1.4, 0.98, 0.04, M.glass, cx, 1.86, cz, 0.01));
    g.add(rbox(1.22, 0.1, 1.06, 0.05, M.black, cx, 2.6, cz, 0.02));
    g.add(rbox(1.18, 0.14, 1.02, 0.03, M.black, cx, 1.14, cz, 0.02));
    [[0.28, 0.24], [0.28, 1.2], [1.44, 0.24], [1.44, 1.2], [0.92, 1.2]].forEach(([x, z]) => g.add(box(0.07, 1.4, 0.07, M.black, x, 1.87, z)));
    g.add(box(1.14, 0.05, 0.03, M.black, cx, 1.72, 1.205));
    // interior: seat, consoles, joysticks, monitor with the assistant UI glowing
    g.add(rbox(0.42, 0.14, 0.44, 0.04, M.seat, 0.72, 1.46, cz, 0.01));
    g.add(rbox(0.12, 0.56, 0.44, 0.05, M.seat, 0.5, 1.76, cz, 0.01));
    g.add(box(0.36, 0.24, 0.1, M.interior, 0.8, 1.38, cz - 0.3));
    g.add(box(0.36, 0.24, 0.1, M.interior, 0.8, 1.38, cz + 0.3));
    g.add(rod(V(0.95, 1.5, cz - 0.3), V(0.97, 1.64, cz - 0.3), 0.022, M.interior));
    g.add(rod(V(0.95, 1.5, cz + 0.3), V(0.97, 1.64, cz + 0.3), 0.022, M.interior));
    const mon = box(0.03, 0.16, 0.24, M.screen, 1.3, 1.72, 0.42); mon.rotation.y = 0.5; g.add(mon);
    // work lights on the cab roof
    [0.4, 1.04].forEach((z) => { g.add(box(0.1, 0.1, 0.14, M.black, 1.42, 2.7, z)); g.add(box(0.012, 0.07, 0.11, M.lamp, 1.475, 2.7, z)); });
    // mirror
    g.add(rod(V(1.2, 1.2, 1.25), V(1.35, 2.2, 1.35), 0.015, M.black, 8));
    g.add(rbox(0.04, 0.22, 0.16, 0.02, M.black, 1.36, 2.28, 1.36, 0.005));

    /* boom */
    const BZ = -0.25;
    const boom = arm([[0.6, 1.5], [1.35, 2.6], [2.25, 3.52], [3.1, 3.6], [3.95, 3.2]],
      (t) => (t < 0.5 ? lerp(0.46, 0.66, t / 0.5) : lerp(0.66, 0.4, (t - 0.5) / 0.5)), 0.46, M.paint, BZ);
    g.add(boom);
    g.add(pin(0.6, 1.5, BZ, 0.62, 0.12, M.chrome));
    g.add(pin(3.95, 3.2, BZ, 0.56, 0.1, M.chrome));
    // work light on the boom
    const bl = boom.userData.curve.getPoint(0.42);
    g.add(box(0.12, 0.1, 0.12, M.black, bl.x, bl.y + 0.4, BZ + 0.1));
    g.add(box(0.12, 0.07, 0.012, M.lamp, bl.x, bl.y + 0.4, BZ + 0.166));

    /* stick */
    g.add(arm([[3.62, 3.86], [3.95, 3.2], [4.18, 2.2], [4.4, 1.15]], (t) => (t < 0.3 ? lerp(0.3, 0.5, t / 0.3) : lerp(0.5, 0.3, (t - 0.3) / 0.7)), 0.38, M.paint, BZ));
    g.add(pin(4.4, 1.15, BZ, 1.02, 0.08, M.chrome));

    /* bucket */
    const bk = new THREE.Shape([V2(4.34, 1.22), V2(4.72, 1.08), V2(4.95, 0.74), V2(4.97, 0.38), V2(4.8, 0.13), V2(4.48, 0.04), V2(4.08, 0.1), V2(3.94, 0.19), V2(4.2, 0.36), V2(4.3, 0.74)]);
    g.add(mesh(extrude(bk, 0.98, 0.03), M.paint, 0, 0, BZ));
    g.add(box(0.26, 0.05, 1.0, M.shoe, 4.02, 0.16, BZ));
    for (let i = -2; i <= 2; i++) {
      const tooth = mesh(new THREE.CylinderGeometry(0.0, 0.055, 0.24, 4), M.shoe, 3.88, 0.12, BZ + i * 0.2);
      tooth.quaternion.setFromUnitVectors(V(0, 1, 0), V(-1, -0.28, 0).normalize());
      g.add(tooth);
    }
    // linkage
    [-0.1, 0.1].forEach((dz) => g.add(rod(V(4.3, 1.62, BZ + dz * 2.2), V(4.62, 1.08, BZ + dz * 2.2), 0.05, M.black, 10)));

    /* hydraulic cylinders: black barrel, chrome rod */
    const cyl = (p, q, r) => {
      const mid = new THREE.Vector3().lerpVectors(p, q, 0.56);
      g.add(rod(p, mid, r, M.barrel));
      g.add(rod(mid, q, r * 0.55, M.chrome));
      g.add(rod(new THREE.Vector3().lerpVectors(p, q, 0.54), new THREE.Vector3().lerpVectors(p, q, 0.57), r * 1.12, M.barrel));
    };
    cyl(V(1.3, 1.22, 0.02), V(2.0, 2.92, 0.02), 0.09);
    cyl(V(1.3, 1.22, -0.52), V(2.0, 2.92, -0.52), 0.09);
    cyl(V(2.3, 3.95, BZ), V(3.62, 3.84, BZ), 0.085);
    cyl(V(3.98, 2.95, BZ), V(4.3, 1.66, BZ), 0.075);

    /* hoses along the top of the boom */
    [-0.12, -0.38].forEach((hz) => {
      const pts = [0.08, 0.3, 0.5, 0.7, 0.92].map((t) => { const p = boom.userData.curve.getPoint(t); return V(p.x, p.y + 0.36, BZ + (hz + 0.25)); });
      pts.unshift(V(0.3, 1.9, BZ + (hz + 0.25)));
      pts.push(V(3.85, 3.55, BZ + (hz + 0.25)));
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.024, 8, false), M.rubber));
    });

    /* decals: Cat logo on the boom and counterweight, model number on the housing */
    loadImage('assets/cat-logo-white.png').then((img) => {
      const t = 0.3, p = boom.userData.curve.getPoint(t), tan = boom.userData.curve.getTangent(t);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.33), boomDecal(img));
      d.position.set(p.x, p.y, BZ + 0.231);
      d.rotation.z = Math.atan2(tan.y, tan.x);
      g.add(d);
    });
    new THREE.TextureLoader().load('assets/cat-logo.png', (tex) => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.376), decalMat(tex));
      d.position.set(-2.33, 1.66, 1.262);
      g.add(d);
    });
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.16), textDecal('320', 330, 120, '#111'));
    badge.position.set(-1.72, 1.92, 1.226);
    g.add(badge);

    g.position.set(-0.8, 0, 0);
    return g;
  }

  /* studio environment for reflections: gradient dome plus soft boxes */
  function studioEnv() {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16);
    const cols = [], pos = geo.attributes.position;
    const top = lin(0xffffff), mid = lin(0xc9c9c4), bot = lin(0x55554f);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, -y);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const box = (w, h, col, pos, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col, col, col), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(...look); env.add(m);
    };
    box(40, 14, 4, [0, 30, 0], [0, 0, 0]);
    box(26, 10, 2.2, [10, 12, 32], [0, 2, 0]);
    box(16, 10, 1.4, [-34, 10, -6], [0, 2, 0]);
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    return tex;
  }

  // Frame the machine: centre it in the free area of the stage (below the top control,
  // above the replay panel) and size it to fill that area. Measured, not hand-tuned.
  const VIEW_DIR = new THREE.Vector3(10.2, 4.0, 16.9).sub(new THREE.Vector3(0.3, 1.5, 0)).normalize();
  let fitPts = null;
  function samplePoints() {
    // real vertices at the resting angle (bounding boxes overestimate a boom this tall)
    const pivot = group.userData.pivot, rot = pivot.rotation.y;
    pivot.rotation.y = BASE_ROT; pivot.updateMatrixWorld(true);
    const pts = [], v = new THREE.Vector3();
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 60));
      for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
    });
    pivot.rotation.y = rot;
    return pts;
  }
  function fitCamera(w, h) {
    if (!fitPts) fitPts = samplePoints();
    const c = new THREE.Box3().setFromPoints(fitPts).getCenter(new THREE.Vector3());
    const mobile = w <= 760;
    const topPad = 70, botPad = mobile ? 240 : 196;
    const freeH = Math.max(160, h - topPad - botPad);
    const tx = mobile ? 0.94 : 0.82;   // share of half-width, leaves room for the idle sway
    const ty = (freeH / h) * 0.94;     // share of half-height, the free band
    camera.clearViewOffset();
    const extents = () => {
      camera.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const q = new THREE.Vector3();
      fitPts.forEach((p) => { q.copy(p).project(camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); });
      return { x0, x1, y0, y1 };
    };
    let d = 20;
    for (let k = 0; k < 5; k++) {
      camera.position.copy(c).addScaledVector(VIEW_DIR, d);
      camera.lookAt(c);
      const e = extents();
      d *= Math.max((e.x1 - e.x0) / 2 / tx, (e.y1 - e.y0) / 2 / ty);
    }
    camera.position.copy(c).addScaledVector(VIEW_DIR, d);
    camera.lookAt(c);
    const e = extents();
    // centre the true outline: horizontally in the stage, vertically in the free band
    const px = ((e.x0 + e.x1) / 2 * 0.5 + 0.5) * w;
    const py = (-(e.y0 + e.y1) / 2 * 0.5 + 0.5) * h;
    camera.setViewOffset(w, h, px - w / 2, py - (topPad + freeH / 2), w, h);
  }

  // Hero framing (desktop): close, front three-quarter, tracks tucked behind the replay panel.
  // Vertical size depends only on the stage height, so it stays the same when panels collapse.
  function heroCamera(w, h) {
    camera.clearViewOffset();
    // 5% further back than the original close-up, and lifted so the bucket clears the replay panel
    camera.position.set(0.6 + 8.9 * 1.06, 1.55 + 3.85 * 1.06, 13.5 * 1.06);
    camera.lookAt(0.6, 1.55, 0);
    camera.setViewOffset(w, h, -w * 0.08, h * 0.1, w, h);
  }

  function resize() {
    if (!renderer || !stage) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w > 760) heroCamera(w, h); else fitCamera(w, h);
    camera.updateProjectionMatrix();
    // setSize clears the canvas; draw straight away so a panel collapse never flashes empty
    if (scene) renderer.render(scene, camera);
  }

  function mount(stageEl, canvasEl) {
    stage = stageEl; canvas = canvasEl;
    if (!window.THREE) return false;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.environment = studioEnv();
    camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(10.2, 6.0, 16.9);
    camera.lookAt(0.3, 1.5, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a84, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 34 });
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(-9, 6, -7);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.26 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    group = build();
    fitPts = null;
    const pivot = new THREE.Group();
    pivot.add(group);
    pivot.rotation.y = BASE_ROT;
    scene.add(pivot);
    group.userData.pivot = pivot;

    new ResizeObserver(resize).observe(stage);
    resize();

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; dragStartX = e.clientX; dragBase = dragOffset;
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const raw = dragBase + (e.clientX - dragStartX) * 0.006;
      // damping past the limit instead of a hard wall
      dragOffset = Math.abs(raw) > MAX_DRAG ? Math.sign(raw) * (MAX_DRAG + (Math.abs(raw) - MAX_DRAG) * 0.2) : raw;
    });
    const end = () => { dragging = false; canvas.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    return true;
  }

  const tmp = new THREE.Vector3();
  function project(key) {
    if (!group) return null;
    tmp.copy(anchors[key]);
    group.localToWorld(tmp);
    tmp.project(camera);
    return {
      x: (tmp.x * 0.5 + 0.5) * stage.clientWidth,
      y: (-tmp.y * 0.5 + 0.5) * stage.clientHeight,
    };
  }

  const t0 = performance.now();
  function loop(now) {
    if (!running) return;
    const t = (now - t0) / 1000;
    if (!dragging) dragOffset *= 0.9; // ease back to rest
    // starts exactly at the default pose (sin 0 = 0), then turns slowly
    const sway = reduce ? 0 : Math.sin(t * SWAY_SPEED) * SWAY;
    group.userData.pivot.rotation.y = BASE_ROT + sway + dragOffset;
    renderer.render(scene, camera);
    onFrameCbs.forEach((cb) => cb(now));
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!renderer || running) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function onFrame(cb) { onFrameCbs.length = 0; onFrameCbs.push(cb); }
  function remount(stageEl, canvasEl) {
    // Home view is re-rendered on navigation; rebuild the renderer on the new canvas.
    stop();
    if (renderer) renderer.dispose();
    renderer = null; group = null;
    return mount(stageEl, canvasEl);
  }

  function setState() { /* engine vibration removed: it read as a rendering glitch */ }
  return { mount: remount, start, stop, project, onFrame, setState, keys: Object.keys(anchors) };
})();
