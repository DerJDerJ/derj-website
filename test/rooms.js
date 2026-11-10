/* ==========================================================================
   DerJ — "RÄUME"   ·   room-to-room scroll story (prototype, NOT deployed)
   --------------------------------------------------------------------------
   Test #2, new approach after the tunnel:
     - six real, connected rooms; you walk from one into the next through a
       doorway (walls + floor + ceiling, door apertures, light spill ahead)
     - each room is lit by ONE of DerJ's own projections: his photos/videos,
       duotoned into the active palette (never leaves the colour system)
     - no tunnel rings, no beam cones, no wireframe grids
   Test hooks: window.__story = { jump(p), setPalette(i), scene, camera }
   ========================================================================== */
import * as THREE from 'three';

/* ---------------- the same 12 palettes as the live site ---------------- */
const PALETTES = [
  { n: 'Seagreen · Magenta', a: '#1f8a5b', b: '#ff2db8' },
  { n: 'Mint · Violet', a: '#74ffb0', b: '#8a2be2' },
  { n: 'Blau · Amber', a: '#0b1e6b', b: '#ffb000' },
  { n: 'Blau · Grün', a: '#0b1e6b', b: '#00e676' },
  { n: 'Yellow · Pink', a: '#ffe600', b: '#ff5fa2' },
  { n: 'Red · White', a: '#ff2d2d', b: '#f4f4f6' },
  { n: 'Red · Blue', a: '#ff2d2d', b: '#2d6bff' },
  { n: 'Amber · Magenta', a: '#ffb000', b: '#ff2db8' },
  { n: 'Teal · Orange', a: '#00b3a4', b: '#ff7a18' },
  { n: 'Cyan · Red', a: '#00e5ff', b: '#ff2d55' },
  { n: 'Lime · Purple', a: '#b6ff00', b: '#9b00ff' },
  { n: 'Petrol · Magenta', a: '#0a3333', b: '#ff3660' }
];
let palIdx = parseInt(localStorage.getItem('derj-pal') || '11', 10);
if (!(palIdx >= 0 && palIdx < PALETTES.length)) palIdx = 11;
const colA = new THREE.Color(PALETTES[palIdx].a);
const colB = new THREE.Color(PALETTES[palIdx].b);

const isMobile = matchMedia('(max-width: 820px)').matches;
const lowPower = isMobile || (navigator.hardwareConcurrency || 4) <= 4;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- renderer / scene / camera ---------------- */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
/* phone screens are DPR 2-3; a 1.3 clamp makes the canvas upscale and look pixelated */
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020204);
scene.fog = new THREE.FogExp2(0x020206, 0.030);

const portrait = innerWidth / innerHeight < 1;
const camera = new THREE.PerspectiveCamera(portrait ? 72 : 63, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 1.65, 6);
scene.add(camera);

/* ---------------- textures: his photos + videos ---------------- */
const MAXANISO = renderer.capabilities.getMaxAnisotropy();
const loader = new THREE.TextureLoader();
function photo(url) {
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXANISO;          // keeps the projection sharp at grazing angles
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const PHOT = ['./assets/proj-1.jpg', './assets/proj-2.jpg', './assets/proj-3.jpg',
  './assets/proj-4.jpg', './assets/proj-5.jpg', './assets/proj-6.jpg'].map(photo);

const VIDEO_SRC = ['./assets/video/20230803_233252.mp4', './assets/video/20230805_020436.mp4',
  './assets/video/20230806_041746.mp4'];
const videoEls = [], vidTex = [];
VIDEO_SRC.forEach(src => {
  const v = document.createElement('video');
  v.src = src; v.loop = true; v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.addEventListener('loadeddata', () => { try { v.currentTime = 1.6; } catch (e) {} });
  v.play().catch(() => {});
  const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAXANISO; t.minFilter = THREE.LinearFilter;
  videoEls.push(v); vidTex.push(t);
});
addEventListener('pointerdown', () => videoEls.forEach(v => v.play().catch(() => {})), { once: true });

/* ---------------- the wall AS the projection (his material on the wall) ----
   The room's content wall is not a floating screen: the whole wall is dark
   concrete and one of DerJ's images is thrown onto it, cover-fitted, duotoned
   into the active palette, with a soft projector falloff at the edges.      */
const projMats = [];
const WALL_ASPECT = 14 / 6.4;                 // room wall = roomLen / roomH
function wallProjMaterial(tex, amt, texAspect, isVideo) {
  /* the image keeps its own aspect: it sits as a projected rectangle ON the wall
     (wall visible around it) instead of being stretched across the whole wall */
  const s = 0.97;
  let fitY = s, fitX = s * (6.4 * texAspect / 14);
  if (fitX > 1) { fitX = 1; fitY = (14 / 6.4) / texAspect; }
  const u = {
    uTex: { value: tex }, uA: { value: colA.clone() }, uB: { value: colB.clone() },
    uTime: { value: 0 }, uAmt: { value: amt }, uDrift: { value: isVideo ? 0.30 : 1.0 },
    uColor: { value: 0.80 },          // 0 = pure duotone, 1 = natural photo colour
    uFit: { value: new THREE.Vector2(fitX, fitY) }
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uA, uB; uniform float uTime, uAmt, uDrift, uColor; uniform vec2 uFit;
      varying vec2 vUv; varying vec3 vP;
      void main(){
        /* dark concrete base, slightly lifted by the room's own light colour */
        vec3 base = vec3(0.055, 0.056, 0.064) + uA * 0.060;
        base *= 0.55 + 0.45 * smoothstep(0.0, 0.60, vUv.y);
        base *= 0.95 + 0.05 * sin(vUv.x * 170.0);

        vec2 half_ = uFit * 0.5;
        vec2 dd = abs(vUv - 0.5) / half_;
        float inside = max(dd.x, dd.y);

        /* stills breathe slowly, video gets only a whisper of drift */
        vec2 drift = vec2(sin(uTime * 0.050), cos(uTime * 0.037)) * 0.012 * uDrift;
        vec2 uv = clamp((vUv - 0.5) / uFit + 0.5 + drift, 0.002, 0.998);
        vec3 c = texture2D(uTex, uv).rgb;

        float l = dot(c, vec3(0.299, 0.587, 0.114));
        float e = clamp(length(vec2(dFdx(l), dFdy(l))) * 3.0, 0.0, 0.25);
        float shade = clamp(pow(l, 0.82) * 1.08 + e * 0.5, 0.0, 1.0);
        vec3 duo = mix(uA * 0.34, uB, shade);
        duo = mix(duo, vec3(0.98), smoothstep(0.86, 1.0, shade) * 0.30);
        /* the palette tints the image, but the photo keeps its own colour so it stays
           recognisable (uColor = 1 -> natural, 0 -> pure duotone) */
        vec3 img = mix(duo, c * 1.22, uColor);

        float scan = 0.985 + 0.015 * sin(vUv.y * 150.0 + uTime * 1.2);
        float fall = 1.0 - smoothstep(0.88, 1.04, inside);           // projector falloff
        float halo = (1.0 - smoothstep(1.0, 1.45, inside)) * 0.10;   // light bleeding past the frame

        vec3 col = mix(base, img * scan * 1.15, clamp(uAmt * fall, 0.0, 1.0));
        col += uB * halo * uAmt * 0.18;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  m.userData.u = u;
  projMats.push(m);
  return m;
}

/* ---------------- room kit ---------------- */
const L = 14, W = 16, H = 6.4;          // room depth / width / height
const DW = 3.6, DH = 4.3;               // doorway
const wallMat  = new THREE.MeshLambertMaterial({ color: 0x3c3d49 });
const floorMat = new THREE.MeshLambertMaterial({ color: 0x24252e });
const ceilMat  = new THREE.MeshLambertMaterial({ color: 0x1b1c24 });
const frameMat = new THREE.MeshLambertMaterial({ color: 0x4a4b58 });

function panel(w, h, mat, pos, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.y = rotY;
  return m;
}
function bar(w, h, d, pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/* ---------------- rooms + their projection ---------------- */
/* texAspect: what the source actually is, so the wall crop stays honest */
/* one distinct asset per chapter, no clip used twice (videos 0 and 2 are the
   same hall from the same angle, so only video 0 and 1 are in the story):
   ankunft  -> video 0  walking into the dark hall
   sound    -> video 1  DJs at the booth, beams over the floor
   licht    -> proj-5   haze rays (portrait)
   mapping  -> proj-3   the barn with the projection on it  (his mapping work)
   kunst    -> proj-6   placeholder - NO graffiti photo supplied yet
   kontakt  -> proj-1   crowd / dancefloor under the beams                */
const ROOMS = [
  { name: 'ankunft', side: -1, kind: 'video', idx: 0, amt: 0.90, texAspect: 16 / 9 },
  { name: 'sound',   side: +1, kind: 'video', idx: 1, amt: 0.95, texAspect: 4 / 3 },
  { name: 'licht',   side: -1, kind: 'photo', idx: 4, amt: 0.95, texAspect: 3 / 4 },
  { name: 'mapping', side: +1, kind: 'photo', idx: 2, amt: 1.00, texAspect: 4 / 3 },
  { name: 'kunst',   side: -1, kind: 'photo', idx: 5, amt: 0.90, texAspect: 3 / 4 },
  { name: 'kontakt', side: +1, kind: 'photo', idx: 0, amt: 0.90, texAspect: 4 / 3, endDoor: true }
];

const lightA = [], lightB = [], strips = [];

for (let i = 0; i < ROOMS.length; i++) {
  const R = ROOMS[i];
  const zc = -i * L;
  const zf = zc - L / 2;

  // shell
  const fl = panel(W, L, floorMat, [0, 0, zc], 0); fl.rotation.x = -Math.PI / 2; scene.add(fl);
  const ce = panel(W, L, ceilMat, [0, H, zc], 0); ce.rotation.x = Math.PI / 2; scene.add(ce);

  // far wall around the doorway
  const sideW = (W - DW) / 2;
  scene.add(panel(sideW, H, wallMat, [-(DW / 2 + sideW / 2), H / 2, zf]));
  scene.add(panel(sideW, H, wallMat, [DW / 2 + sideW / 2, H / 2, zf]));
  scene.add(panel(DW, H - DH, wallMat, [0, DH + (H - DH) / 2, zf]));

  // door frame
  scene.add(bar(0.18, DH + 0.2, 0.24, [-(DW / 2 + 0.09), DH / 2, zf]));
  scene.add(bar(0.18, DH + 0.2, 0.24, [DW / 2 + 0.09, DH / 2, zf]));
  scene.add(bar(DW + 0.36, 0.18, 0.24, [0, DH + 0.09, zf]));

  // one whole side wall is the projection surface, the other stays bare concrete
  const tex = R.kind === 'video' ? vidTex[R.idx] : PHOT[R.idx];
  const projWall = panel(L, H, wallProjMaterial(tex, R.amt, R.texAspect, R.kind === 'video'), [R.side * W / 2, H / 2, zc], -R.side * Math.PI / 2);
  const bareWall = panel(L, H, wallMat, [-R.side * W / 2, H / 2, zc], R.side * Math.PI / 2);
  scene.add(projWall, bareWall);
  R.wall = projWall; R.pz = zc; R.cy = 3.2;

  // light spilling from the room beyond: the doorway reads as a bright rectangle
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(DW, DH),
    new THREE.MeshBasicMaterial({ color: colB.clone(), transparent: true, opacity: i < 5 ? 0.40 : 0.0, toneMapped: false, depthWrite: false })
  );
  spill.position.set(0, DH / 2, zf - 0.6);
  scene.add(spill);
  R.spill = spill;

  // neutral room light (so the space reads) + a doorway light (so the hole spills)
  const lRoom = new THREE.PointLight(0xe8ebf5, 9, 46, 1.15);
  lRoom.position.set(0, 5.2, zc);
  scene.add(lRoom);
  const lDoor = new THREE.PointLight(colB.clone(), 7, 20, 1.4);
  lDoor.position.set(0, 2.4, zf - 1.6);
  scene.add(lDoor); lightB.push(lDoor);
  // the projection spills onto the floor, so the wall reads as a light source
  const lWall = new THREE.PointLight(colB.clone(), 3.4, 13, 1.4);
  lWall.position.set(R.side * (W / 2 - 3.6), 3.2, zc);
  scene.add(lWall); lightB.push(lWall);

  // practical: a thin strip at the ceiling edge
  const strip = bar(W - 1.2, 0.06, 0.06, [0, H - 0.22, zf + 0.6]);
  strip.material = new THREE.MeshBasicMaterial({ color: colA.clone(), transparent: true, opacity: 0.5, toneMapped: false });
  scene.add(strip); strips.push(strip);
}

/* the last room ends in a closed wall with a lit booking door */
{
  const zf = -5 * L - L / 2;
  const doorMat = new THREE.MeshBasicMaterial({ color: colB.clone(), transparent: true, opacity: 0.5, toneMapped: false });
  scene.add(panel(DW, DH, doorMat, [0, DH / 2, zf + 0.04]));
  const glow = new THREE.PointLight(colB.clone(), 6, 16, 2);
  glow.position.set(0, 2.2, zf + 2.2);
  scene.add(glow); lightB.push(glow);
}

const amb = new THREE.AmbientLight(0x2a2d3a, 1.0);
scene.add(amb);
const hemi = new THREE.HemisphereLight(0x3a3f52, 0x0a0a12, 0.75);
scene.add(hemi);

/* ---------------- camera path: one key per quarter-room ---------------- */
/* on a phone the wall must come much closer, otherwise it renders as a thin band */
const turnD = portrait ? 7.0 : 10.4;      // lateral distance to the content wall
const turnY = portrait ? 2.55 : 1.85;     // eye height for the wall beat
const kPos = [], kLook = [];
for (let i = 0; i < ROOMS.length; i++) {
  const R = ROOMS[i], z = -i * L, s = R.side;
  const camX = s * (W / 2 - turnD);
  /* keys 1 and 2 both face the wall, so the side glance is a real hold
     instead of a quick swing past the image */
  kPos.push(
    [0, 1.65, z + 6.6],
    [camX, turnY, z + 0.6],
    [camX * (portrait ? 0.55 : 0.72), turnY - 0.12, z - 1.0],
    [0, 1.62, z - 5.8]
  );
  kLook.push(
    [0, 1.70, z - 6.0],
    [s * W / 2, R.cy, R.pz],
    [s * W / 2, R.cy - (portrait ? 0.2 : 0.15), R.pz],
    [0, 1.70, z - 18]
  );
}
kPos.push([0, 1.65, -5 * L + 3.5]);
kLook.push([0, 2.5, -5.5 * L - 3]);
const posCurve = new THREE.CatmullRomCurve3(kPos.map(k => new THREE.Vector3(...k)), false, 'catmullrom', 0.5);
const lookCurve = new THREE.CatmullRomCurve3(kLook.map(k => new THREE.Vector3(...k)), false, 'catmullrom', 0.5);

const want = new THREE.Vector3(), look = new THREE.Vector3();
const curPos = new THREE.Vector3(0, 1.65, 6);
const curLook = new THREE.Vector3(0, 1.7, -6);

/* ---------------- beats (DOM copy) ---------------- */
const beats = [...document.querySelectorAll('.beat')].map(el => ({
  el, i: +el.dataset.i, o: parseFloat(el.dataset.open), c: parseFloat(el.dataset.close)
}));
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------------- rail + chapter label ---------------- */
const rail = document.getElementById('rail'), chap = document.getElementById('chap');
const ROMAN = ['01 ankunft', '02 sound', '03 licht', '04 mapping', '05 kunst', '06 kontakt'];
ROOMS.forEach((R, i) => {
  const a = document.createElement('a');
  a.href = '#'; a.innerHTML = '<span class="dot"></span>' + ROMAN[i];
  a.addEventListener('click', e => { e.preventDefault(); scrollTo(0, (document.body.scrollHeight - innerHeight) * (i / 6 + 0.02)); });
  rail.appendChild(a);
});
const railLinks = [...rail.querySelectorAll('a')];

/* ---------------- palette chip ---------------- */
const chip = document.getElementById('chip'), menu = document.getElementById('menu');
function paintMenu() {
  menu.innerHTML = '';
  PALETTES.forEach((P, i) => {
    const b = document.createElement('button');
    b.style.setProperty('--ca', P.a); b.style.setProperty('--cb', P.b);
    b.innerHTML = '<i></i>' + P.n;
    if (i === palIdx) b.classList.add('on');
    b.addEventListener('click', () => setPalette(i));
    menu.appendChild(b);
  });
}
function setPalette(i) {
  palIdx = i; localStorage.setItem('derj-pal', String(i));
  const A = new THREE.Color(PALETTES[i].a), B = new THREE.Color(PALETTES[i].b);
  colA.copy(A); colB.copy(B);
  projMats.forEach(m => { m.userData.u.uA.value.copy(A); m.userData.u.uB.value.copy(B); });
  lightA.forEach(l => l.color.copy(A));
  lightB.forEach(l => l.color.copy(B));
  strips.forEach(s => s.material.color.copy(A));
  ROOMS.forEach(R => R.spill && R.spill.material.color.copy(B));
  document.documentElement.style.setProperty('--colA', PALETTES[i].a);
  document.documentElement.style.setProperty('--colB', PALETTES[i].b);
  paintMenu();
}
chip.addEventListener('click', () => menu.classList.toggle('open'));
paintMenu();
setPalette(palIdx);

/* ---------------- scroll → progress ---------------- */
let manual = null, prog = 0;
function readProg() {
  const max = document.body.scrollHeight - innerHeight;
  return max > 0 ? clamp01(scrollY / max) : 0;
}
function apply(p) {
  prog = p;
  const t = posCurve.getPoint(clamp01(p));
  const l = lookCurve.getPoint(clamp01(p));
  const sway = reduceMotion ? 0 : 1;
  want.copy(t);
  want.x += sway * 0.06 * Math.sin(p * 46.0);
  want.y += sway * 0.03 * Math.sin(p * 31.0 + 1.3);
  look.copy(l);
  look.x += sway * 0.05 * Math.sin(p * 37.0 + 0.6);
  // beats
  beats.forEach(b => {
    const o = smooth(b.o, b.o + 0.06, p) * (1 - smooth(b.c - 0.06, b.c, p));
    b.el.style.opacity = o.toFixed(3);
    b.el.style.transform = 'translateY(' + ((1 - o) * 14).toFixed(1) + 'px)';
  });
  // rail
  const act = Math.min(5, Math.floor(p * 6 + 0.0001));
  railLinks.forEach((a, i) => a.classList.toggle('on', i === act));
  if (chap) chap.textContent = 'raum ' + ROMAN[act];
  const barEl = document.querySelector('#bar i');
  if (barEl) barEl.style.width = (p * 100).toFixed(1) + '%';
}

/* ---------------- loop ---------------- */
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const p = manual !== null ? manual : readProg();
  apply(p);
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 6);
  curPos.lerp(want, k);
  curLook.lerp(look, k);
  camera.position.copy(curPos);
  camera.lookAt(curLook);
  projMats.forEach(m => { m.userData.u.uTime.value += dt; });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
apply(manual !== null ? manual : readProg());
curPos.copy(posCurve.getPoint(prog)); curLook.copy(lookCurve.getPoint(prog));
frame();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 72 : 63;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});
addEventListener('scroll', () => { if (manual === null) apply(readProg()); }, { passive: true });

/* ---------------- test hooks ---------------- */
window.__story = {
  scene, camera, renderer, rooms: ROOMS, palettes: PALETTES,
  jump(p) { manual = clamp01(p); apply(manual); },
  release() { manual = null; },
  setPalette,
  get progress() { return prog; }
};
