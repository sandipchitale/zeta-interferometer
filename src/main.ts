import * as THREE from 'three';
import './style.css';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import GUI from 'lil-gui';
import { ZETA_ZEROS } from './zeros.ts';

/* ===========================================================================
   The Zeta-Zeros Interferometer
   ---------------------------------------------------------------------------
   A diffraction grating on the critical line (the plane Re(s) = x = 1/2) carries
   one slit at each non-trivial zero height y = ±gamma_n of zeta(s). A line source
   at x = +inf sends parallel (plane-wave) light in the -x direction. The far field
   on a curved screen is the optical Fourier transform of the slit comb:

       E(phi) = sum_n [ e^{ i k y_n sin phi } + e^{ -i k y_n sin phi } ]
              = 2 sum_n cos( gamma_n * v ),   v := SPREAD * sin(phi)

   By the Riemann–Weil explicit formula this sum has coherent peaks at
   v = log(p^k): the logs of the prime powers. So the bright fringes land on the
   PRIMES. Conjugate symmetry (±gamma_n) makes the pattern even -> mirror wing 1/p.
   =========================================================================== */

// ---- Geometry constants (scene units) ----
// The horizontal axis IS Re(s). The grating lives on the critical line, so it
// stands at x = Re(s) = 1/2. Diffraction (the screen) is centred on the grating.
const CRITICAL_X = 0.5;               // Re(s) = 1/2 : where the grating/critical line sits
const Y_SCALE = 0.15;                 // gamma -> scene height
const SOURCE_X = 44;                  // line source plane (x = +inf, drawn finite)
const SCREEN_R = 78;                  // radius of the curved screen (-x side); large -> flatter, more room
const PHI_MAX = (80 * Math.PI) / 180; // angular half-extent of the screen
const V_MAX = 4.6;                    // screen range: exp(4.6) ~ 99 -> first 25 primes (..97)
const SPREAD = V_MAX / Math.sin(PHI_MAX); // v = SPREAD * sin(phi)
const SCREEN_SAMPLES = 1500;
const Y_MAX = ZETA_ZEROS[ZETA_ZEROS.length - 1] * Y_SCALE + 4;

// ---- State ----
const state = {
  zeroPairs: 30,
  showGrid: true,
  showXAxis: true,
  showYAxis: true,
  showCriticalLine: true,
  showProfile: false,
  profileGain: 16,
  contrast: 0.55, // display tone-map exponent: brightness = |amp|^contrast (NOT the γₙ ordinates)
  showRays: true,
  showWavefronts: true,
  showPrimePowers: false,
  showInversePrimes: true,
  autoRotate: false,
  orthographic: false // false = perspective, true = orthographic (parallel) projection
};

// ===========================================================================
//  Scene / renderer / cameras
// ===========================================================================
const app = document.getElementById('app')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.0016);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(70, 44, 112);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

// Orthographic ("parallel") camera — same position/orientation as the perspective
// one, swapped in on toggle. Wide near/far slab (near negative) so the parallel clip
// volume never slices the scene — orthographic clips along the view axis.
const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000);
let activeCamera: THREE.Camera = camera;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.8;
controls.target.set(-14, 0, 0);
controls.update();

// Size the ortho frustum to match the perspective view at the current distance,
// so flipping projection doesn't jump the scale.
function syncOrthoToPerspective() {
  const dist = camera.position.distanceTo(controls.target);
  const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
  const halfW = halfH * camera.aspect;
  orthoCamera.top = halfH; orthoCamera.bottom = -halfH;
  orthoCamera.left = -halfW; orthoCamera.right = halfW;
  orthoCamera.position.copy(camera.position);
  orthoCamera.quaternion.copy(camera.quaternion);
  orthoCamera.zoom = 1;
  orthoCamera.updateProjectionMatrix();
}

function setProjection(orthographic: boolean) {
  if (orthographic) {
    syncOrthoToPerspective();
    activeCamera = orthoCamera;
  } else {
    // Carry position/orientation back so the view stays continuous.
    camera.position.copy(orthoCamera.position);
    camera.quaternion.copy(orthoCamera.quaternion);
    camera.updateProjectionMatrix();
    activeCamera = camera;
  }
  controls.object = activeCamera;
  controls.update();
}

scene.add(new THREE.AmbientLight(0x8090c0, 1.4));
const key = new THREE.PointLight(0xffffff, 1.2, 0);
key.position.set(40, 60, 80);
scene.add(key);

// Helper: a CSS2D text label.
function makeLabel(text: string, cls: string, pos: THREE.Vector3): CSS2DObject {
  const el = document.createElement('div');
  el.className = `label ${cls}`;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.copy(pos);
  return obj;
}

// ===========================================================================
//  XY-plane reference frame (faint): optical axis, grating/critical line, grid
// ===========================================================================
// Independently-toggleable reference layers.
const gridGroup = new THREE.Group();         // the faint XY-plane grid
const xAxisGroup = new THREE.Group();        // X axis: Re(s), the line y = 0
const yAxisGroup = new THREE.Group();        // Y axis: Im(s), the line x = 0 (Re = 0)
const criticalLineGroup = new THREE.Group(); // the critical line, x = Re(s) = 1/2
scene.add(gridGroup, xAxisGroup, yAxisGroup, criticalLineGroup);

function addLine(group: THREE.Group, pts: THREE.Vector3[], color: number, opacity: number): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(g, m);
  group.add(line);
  return line;
}

// X axis — this is Re(s); light also propagates along it. Crosses Re = 0 and Re = ½.
addLine(xAxisGroup, [new THREE.Vector3(SOURCE_X + 4, 0, 0), new THREE.Vector3(-SCREEN_R - 6, 0, 0)], 0x556088, 0.5);
xAxisGroup.add(makeLabel('Re(s) axis  (light propagation)', 'note', new THREE.Vector3(24, 1.2, 0)));
xAxisGroup.add(makeLabel('Re(s)', 'note', new THREE.Vector3(SOURCE_X + 6, -1.4, 0)));

// Y axis — the imaginary axis: the vertical line at x = 0 (Re = 0), height = Im(s) = t.
addLine(yAxisGroup, [new THREE.Vector3(0, -Y_MAX, 0), new THREE.Vector3(0, Y_MAX, 0)], 0x6f7fb8, 0.55);
yAxisGroup.add(makeLabel('Y axis: Im(s)  (Re = 0)', 'note', new THREE.Vector3(-2.4, Y_MAX + 12, 0)));

// Critical line — parallel to the Y axis but at x = Re(s) = ½; this is where the grating sits.
addLine(criticalLineGroup, [new THREE.Vector3(CRITICAL_X, -Y_MAX, 0), new THREE.Vector3(CRITICAL_X, Y_MAX, 0)], 0x8fa6e0, 0.6);
criticalLineGroup.add(makeLabel('critical line  Re(s) = ½', 'note', new THREE.Vector3(CRITICAL_X + 1.2, Y_MAX + 7, 0)));

// A faint XY grid, pushed a hair behind z = 0 so nothing in the z = 0 plane
// (source, axes, rays) coincides with a grid line and shimmers.
{
  const grid = new THREE.GridHelper(220, 110, 0x2a3150, 0x161b30);
  grid.rotation.x = Math.PI / 2; // lie in XY (normal along Z)
  grid.position.z = -0.3;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.32;
  gridGroup.add(grid);
}

// ===========================================================================
//  Grating: opaque sheet on the critical line (x = Re(s) = ½), slit at each zero
// ===========================================================================
// The opaque sheet is effectively INFINITE: a very large plane whose colour is
// almost the background, so its edges dissolve into the void (no visible border).
// It blocks all light; only the slits let it through. It stands at x = Re(s) = ½.
{
  const geo = new THREE.PlaneGeometry(900, 600); // (Y extent, Z extent) — beyond any view
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a0d18, roughness: 1, metalness: 0,
    transparent: true, opacity: 0.38, side: THREE.DoubleSide,
    depthWrite: false // don't fight coplanar slit/frame lines that sit on the critical line
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 2; // face along x; plane spans Y (local X) and Z (local Y)
  mesh.position.x = CRITICAL_X;  // on the critical line, Re(s) = 1/2
  scene.add(mesh);
}
scene.add(makeLabel('infinite opaque grating  (∥ YZ plane, at Re(s) = ½)', 'note', new THREE.Vector3(CRITICAL_X, -Y_MAX - 3, 0)));

const slitGroup = new THREE.Group();   // bright slit marks
const rayGroup = new THREE.Group();    // parallel incoming rays
const sourceGroup = new THREE.Group(); // line source + glow (grows with active zeros)
const frameGroup = new THREE.Group();  // active aperture frame (grows with active zeros)
scene.add(slitGroup, rayGroup, sourceGroup, frameGroup);

// ===========================================================================
//  Incoming plane-wavefront hints (subtle)
// ===========================================================================
const wavefrontGroup = new THREE.Group();
scene.add(wavefrontGroup);
function buildWavefronts() {
  wavefrontGroup.clear();
  // Incoming plane wavefronts only: a few faint vertical lines on the +x side
  // (the diffracted side is a superposition of many parallel orders, which would
  // be misleading to draw as rays/arcs from the origin — the bright spots show it).
  for (let i = 1; i <= 3; i++) {
    const x = (SOURCE_X * i) / 4;
    addToGroup(wavefrontGroup,
      [new THREE.Vector3(x, -Y_MAX * 0.85, 0), new THREE.Vector3(x, Y_MAX * 0.85, 0)],
      0xffd86b, 0.10);
  }
}
function addToGroup(group: THREE.Group, pts: THREE.Vector3[], color: number, opacity: number) {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
}

// ===========================================================================
//  The screen: a curved ribbon coloured by intensity + an intensity profile
// ===========================================================================
const screenMesh = (() => {
  const geo = new THREE.BufferGeometry();
  const half = 3;                         // ribbon half-depth in Z
  const pos = new Float32Array(SCREEN_SAMPLES * 2 * 3);
  const col = new Float32Array(SCREEN_SAMPLES * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i < SCREEN_SAMPLES; i++) {
    const phi = -PHI_MAX + (2 * PHI_MAX * i) / (SCREEN_SAMPLES - 1);
    const x = CRITICAL_X - SCREEN_R * Math.cos(phi);
    const y = SCREEN_R * Math.sin(phi);
    pos.set([x, y, half], i * 6);
    pos.set([x, y, -half], i * 6 + 3);
    if (i < SCREEN_SAMPLES - 1) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, c, b, d);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
})();
scene.add(makeLabel('screen — far-field interference', 'note', new THREE.Vector3(0, Y_MAX + 17, 3)));

const profileLine = (() => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SCREEN_SAMPLES * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9af0ff, transparent: true, opacity: 0.9 }));
  line.visible = state.showProfile;
  scene.add(line);
  return line;
})();

const peakGroup = new THREE.Group();    // glow dots
const leaderGroup = new THREE.Group();  // leader ticks from arc to staggered labels
const labelGroup = new THREE.Group();   // prime / power / 1/p labels
scene.add(peakGroup, leaderGroup, labelGroup);

// ===========================================================================
//  Physics: amplitude of the diffraction pattern
// ===========================================================================
function amplitude(v: number, n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.cos(ZETA_ZEROS[i] * v);
  return s / n; // |.| peaks ~0.2-0.3 at prime powers, ~0.03 background, 1 at v=0
}

// Tone-map the field amplitude for display: a gamma-style exponent that lifts the
// faint prime fringes off the floor. This is why the screen shows |𝓕|^contrast, a
// tone-mapped amplitude, rather than the squared intensity |𝓕|².
function brightness(absAmp: number): number {
  return Math.pow(Math.min(1, absAmp), state.contrast);
}

function colorFor(t: number, out: THREE.Color) {
  // dark -> cyan -> white
  if (t < 0.5) out.setRGB(0.04 + 0.12 * t, 0.08 + 1.4 * t, 0.18 + 1.4 * t);
  else { const u = (t - 0.5) * 2; out.setRGB(0.1 + 0.9 * u, 0.78 + 0.22 * u, 0.86 + 0.14 * u); }
}

// ---- Prime / prime-power table over the visible v range (sorted by v = log n) ----
type Mark = { n: number; v: number; isPrime: boolean };
const marks: Mark[] = (() => {
  const xMax = Math.floor(Math.exp(V_MAX));
  const isPrime = (k: number) => { for (let d = 2; d * d <= k; d++) if (k % d === 0) return false; return k > 1; };
  const out: Mark[] = [];
  for (let p = 2; p <= xMax; p++) {
    if (!isPrime(p)) continue;
    for (let m = p, k = 1; m <= xMax; m *= p, k++) out.push({ n: m, v: Math.log(m), isPrime: k === 1 });
  }
  return out.sort((a, b) => a.v - b.v);
})();

function arcPoint(v: number, radius = SCREEN_R): THREE.Vector3 {
  const phi = Math.asin(Math.max(-1, Math.min(1, v / SPREAD)));
  return new THREE.Vector3(CRITICAL_X - radius * Math.cos(phi), radius * Math.sin(phi), 0);
}

// ===========================================================================
//  Rebuild grating + rays for the active number of zero pairs
// ===========================================================================
const SLIT_OFFSET = 0.04;    // slit marks a sliver to the RIGHT of the plane (touching, not in)
const SLIT_DEPTH = 3;        // half-extent of the slit marks along Z

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const a = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    a.geometry?.dispose();
    if (a.material) Array.isArray(a.material) ? a.material.forEach((m) => m.dispose()) : a.material.dispose();
  });
  g.clear();
}

function rebuildGrating() {
  disposeGroup(slitGroup);
  disposeGroup(rayGroup);
  disposeGroup(sourceGroup);
  disposeGroup(frameGroup);
  const n = state.zeroPairs;
  const halfH = ZETA_ZEROS[n - 1] * Y_SCALE + 3; // active aperture half-height (grows with n)

  // --- slits: the real slit is IN the grating plane (x = ½). We draw the marks
  //     just on the RIGHT (+x, source side), touching it but not in it, so they
  //     never z-fight with the plane (no shimmer); the semi-transparent grating
  //     lets them be seen from the other side too. ---
  const slitPts: number[] = [];
  const rayPts: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = ZETA_ZEROS[i] * Y_SCALE;
    for (const yy of [y, -y]) {
      slitPts.push(CRITICAL_X + SLIT_OFFSET, yy, -SLIT_DEPTH, CRITICAL_X + SLIT_OFFSET, yy, SLIT_DEPTH);
      if (state.showRays) rayPts.push(SOURCE_X, yy, 0, CRITICAL_X + SLIT_OFFSET, yy, 0);
    }
  }
  const slitGeo = new THREE.BufferGeometry();
  slitGeo.setAttribute('position', new THREE.Float32BufferAttribute(slitPts, 3));
  slitGroup.add(new THREE.LineSegments(slitGeo,
    new THREE.LineBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0.95 })));

  if (state.showRays) {
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(rayPts, 3));
    rayGroup.add(new THREE.LineSegments(rayGeo,
      new THREE.LineBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.18 })));
  }

  // --- line source (grows with the active aperture) + soft glow ---
  const srcGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(SOURCE_X, -halfH, 0), new THREE.Vector3(SOURCE_X, halfH, 0)]);
  sourceGroup.add(new THREE.Line(srcGeo,
    new THREE.LineBasicMaterial({ color: 0xffd86b, transparent: true, opacity: 0.95 })));
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 2 * halfH, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.12, depthWrite: false }));
  glow.position.set(SOURCE_X, 0, 0);
  sourceGroup.add(glow);
  sourceGroup.add(makeLabel('line source  (x → +∞)', 'note', new THREE.Vector3(SOURCE_X, halfH + 1.4, 0)));

  // --- active aperture frame: the slit-bearing rectangle, grows with n ---
  const fx = CRITICAL_X; // the aperture frame lies in the grating plane (x = ½)
  const frameGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(fx, -halfH, -SLIT_DEPTH - 0.5), new THREE.Vector3(fx, halfH, -SLIT_DEPTH - 0.5),
    new THREE.Vector3(fx, halfH, SLIT_DEPTH + 0.5), new THREE.Vector3(fx, -halfH, SLIT_DEPTH + 0.5),
    new THREE.Vector3(fx, -halfH, -SLIT_DEPTH - 0.5)]);
  frameGroup.add(new THREE.Line(frameGeo,
    new THREE.LineBasicMaterial({ color: 0x4a78d8, transparent: true, opacity: 0.5 })));
  frameGroup.add(makeLabel(`active aperture · ${n} zero pairs`, 'note', new THREE.Vector3(CRITICAL_X, halfH + 3, 0)));
}

// ===========================================================================
//  Rebuild the screen colours, profile, peaks and labels
// ===========================================================================
const tmpColor = new THREE.Color();
// Cached |amplitude| per screen sample. The cosine sum (the expensive part, n terms
// × SCREEN_SAMPLES) depends only on the zero count, so we compute it once here and
// reuse it whenever only the display knobs (Contrast / Profile height) change.
const ampAbsCache = new Float32Array(SCREEN_SAMPLES);

// Full recompute: re-evaluate the field. Call when the zero count changes.
function rebuildPattern() {
  const n = state.zeroPairs;
  for (let i = 0; i < SCREEN_SAMPLES; i++) {
    const phi = -PHI_MAX + (2 * PHI_MAX * i) / (SCREEN_SAMPLES - 1);
    const v = SPREAD * Math.sin(phi);
    ampAbsCache[i] = Math.abs(amplitude(v, n));
  }
  remapPattern();   // colour + profile from the freshly cached field
  rebuildMarks();
}

// Cheap re-tone-map: reuse the cached |amplitude| and only redo the tone map, colour
// and profile geometry. Call when Contrast or Profile height changes — no cosine sum.
function remapPattern() {
  const colAttr = screenMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const profPos = profileLine.geometry.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < SCREEN_SAMPLES; i++) {
    const phi = -PHI_MAX + (2 * PHI_MAX * i) / (SCREEN_SAMPLES - 1);
    const b = brightness(ampAbsCache[i]);
    colorFor(b, tmpColor);
    colAttr.setXYZ(i * 2, tmpColor.r, tmpColor.g, tmpColor.b);
    colAttr.setXYZ(i * 2 + 1, tmpColor.r, tmpColor.g, tmpColor.b);
    // profile bumps outward (away from the grating) by brightness
    const nx = -Math.cos(phi), ny = Math.sin(phi);
    const r = SCREEN_R + b * state.profileGain;
    profPos.setXYZ(i, CRITICAL_X + nx * r, ny * r, 0);
  }
  colAttr.needsUpdate = true;
  profPos.needsUpdate = true;
  profileLine.geometry.computeBoundingSphere();
}

const STAGGER_GAP = 0.05;   // rad: primes closer than this fan their labels outward
const STAGGER_STEP = 5.5;   // radial step per stagger level
const dotGeo = new THREE.SphereGeometry(0.5, 10, 10);
const primeDotMat = new THREE.MeshBasicMaterial({ color: 0x9af0ff });
const powerDotMat = new THREE.MeshBasicMaterial({ color: 0xe7d36b, transparent: true, opacity: 0.7 });

function rebuildMarks() {
  peakGroup.clear();          // shared geo/materials -> just detach the dots
  disposeGroup(leaderGroup);  // unique geometry each rebuild
  labelGroup.clear();

  // centre / zeroth order
  labelGroup.add(makeLabel('1', 'center', arcPoint(0, SCREEN_R + 4.5)));

  const leaderPts: number[] = [];

  // Adaptive stagger: high primes crowd in log-space (twins etc.), so when two
  // consecutive primes are within STAGGER_GAP we push the label one step further out.
  let lastPhi = -Infinity, level = 0;
  for (const m of marks) {
    if (!m.isPrime && !state.showPrimePowers) continue;
    let off: number;
    if (m.isPrime) {
      const phi = Math.asin(Math.min(1, m.v / SPREAD));
      level = phi - lastPhi < STAGGER_GAP ? Math.min(level + 1, 3) : 0;
      lastPhi = phi;
      off = 4.2 + level * STAGGER_STEP;
    } else {
      off = 2.8; // prime powers: single inner ring
    }

    const wings: Array<[number, string]> = [[+1, `${m.n}`]];
    if (state.showInversePrimes) wings.push([-1, `1/${m.n}`]);

    for (const [sign, text] of wings) {
      const v = sign * m.v;
      const p = arcPoint(v, SCREEN_R);
      const dot = new THREE.Mesh(dotGeo, m.isPrime ? primeDotMat : powerDotMat);
      dot.position.copy(p);
      peakGroup.add(dot);
      labelGroup.add(makeLabel(text, m.isPrime ? (sign > 0 ? 'prime' : 'invprime') : 'power',
        arcPoint(v, SCREEN_R + off)));
      if (m.isPrime && level > 0) { // leader tick only where we fanned the label out
        const a = arcPoint(v, SCREEN_R + 0.6), b = arcPoint(v, SCREEN_R + off - 1.2);
        leaderPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }

  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(leaderPts, 3));
  leaderGroup.add(new THREE.LineSegments(lg,
    new THREE.LineBasicMaterial({ color: 0x6aa0c8, transparent: true, opacity: 0.35 })));
}

// ===========================================================================
//  GUI
// ===========================================================================
const gui = new GUI({ title: 'Interferometer', width: 340 });
const guiEl = gui.domElement as HTMLElement;

// Projection: a radio choice (a mode switch between two named states), not a checkbox.
const projPanel = document.createElement('div');
projPanel.id = 'projection-radio';
projPanel.innerHTML =
  '<span class="pr-label">Projection</span>' +
  '<div class="pr-options">' +
  '<label><input type="radio" name="projection" value="perspective" checked> Perspective</label>' +
  '<label><input type="radio" name="projection" value="orthographic"> Orthographic</label>' +
  '</div>';
projPanel.addEventListener('change', (e) => {
  const v = (e.target as HTMLInputElement).value;
  state.orthographic = v === 'orthographic';
  setProjection(state.orthographic);
});
const projChildren = (gui as any).$children as HTMLElement;
projChildren.insertBefore(projPanel, projChildren.firstChild); // top of the panel

const fZeros = gui.addFolder('Zeros & primes');
const zeroPairsCtrl = fZeros.add(state, 'zeroPairs', 1, ZETA_ZEROS.length, 1).name('Zero pairs (γₙ)  ◂ ▸')
  .onChange(() => { rebuildGrating(); rebuildPattern(); });
fZeros.add(state, 'contrast', 0.3, 1.0, 0.01).name('Contrast').onChange(remapPattern);
fZeros.add(state, 'showPrimePowers').name('Prime powers (pᵏ)').onChange(rebuildMarks);
fZeros.add(state, 'showInversePrimes').name('Mirror wing (1/p)').onChange(rebuildMarks);

const fLight = gui.addFolder('Light & screen');
fLight.add(state, 'showRays').name('Incoming rays').onChange(rebuildGrating);
fLight.add(state, 'showWavefronts').name('Wavefronts').onChange(() => wavefrontGroup.visible = state.showWavefronts);
fLight.add(state, 'showProfile').name('Intensity profile').onChange(() => profileLine.visible = state.showProfile);
fLight.add(state, 'profileGain', 0, 32, 1).name('Profile height').onChange(remapPattern);
fLight.close();

const fRef = gui.addFolder('Reference frame');
fRef.add(state, 'showGrid').name('XY grid').onChange(() => gridGroup.visible = state.showGrid);
fRef.add(state, 'showXAxis').name('X axis: Re(s)').onChange(() => xAxisGroup.visible = state.showXAxis);
fRef.add(state, 'showYAxis').name('Y axis: Im(s)').onChange(() => yAxisGroup.visible = state.showYAxis);
fRef.add(state, 'showCriticalLine').name('Critical line (½)').onChange(() => criticalLineGroup.visible = state.showCriticalLine);
fRef.close();

gui.add(state, 'autoRotate').name('Auto-rotate').onChange(() => controls.autoRotate = state.autoRotate);

// ← / → arrow keys step the number of zero pairs (and keep the slider in sync).
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const next = Math.max(1, Math.min(ZETA_ZEROS.length, state.zeroPairs + (e.key === 'ArrowRight' ? 1 : -1)));
  if (next === state.zeroPairs) return;
  state.zeroPairs = next;
  zeroPairsCtrl.updateDisplay();
  rebuildGrating();
  rebuildPattern();
  e.preventDefault();
});

// ===========================================================================
//  Sidebar toggle
// ===========================================================================
const sidebar = document.getElementById('sidebar')!;
const toggle = document.getElementById('sidebar-toggle')!;
toggle.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
  toggle.classList.toggle('collapsed');
  toggle.textContent = sidebar.classList.contains('hidden') ? '›' : '‹';
});

// ===========================================================================
//  ViewCube — a Tinkercad-style navigation widget
// ===========================================================================
// A small overlay (its own scene + renderer) showing a labeled cube that mirrors
// the main view's orientation. Its 26 regions — 6 faces, 12 edges, 8 corners — are
// pickable: hovering highlights one, clicking snaps the main camera to that view.
// Dragging the cube orbits the main view; the home button restores a 3/4 view.
const VIEWCUBE_SIZE = 150; // px

const cubeContainer = document.createElement('div');
cubeContainer.id = 'view-cube';
cubeContainer.style.width = `${VIEWCUBE_SIZE}px`;
document.body.appendChild(cubeContainer);

// Sit in a card directly under the lil-gui panel. Track the panel's height
// (folders/resize) so it stays glued just beneath it.
function positionViewCube() {
  const r = guiEl.getBoundingClientRect();
  cubeContainer.style.top = `${r.bottom + 8}px`;
  cubeContainer.style.right = `${window.innerWidth - r.right}px`;
}
new ResizeObserver(positionViewCube).observe(guiEl);
window.addEventListener('resize', positionViewCube);
positionViewCube();

const cubeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
cubeRenderer.setSize(VIEWCUBE_SIZE, VIEWCUBE_SIZE);
cubeRenderer.setPixelRatio(window.devicePixelRatio);
cubeContainer.appendChild(cubeRenderer.domElement);

const cubeScene = new THREE.Scene();
// Frustum half-width just larger than a cube corner (√3·0.5 ≈ 0.87) so the cube
// fills the canvas with only a thin margin, instead of floating in whitespace.
const cubeCamera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 100);
cubeScene.add(new THREE.AmbientLight(0xffffff, 0.9));
const cubeKeyLight = new THREE.DirectionalLight(0xffffff, 0.55);
cubeKeyLight.position.set(3, 5, 4);
cubeScene.add(cubeKeyLight);

// Face-label textures (light face, dark text). BoxGeometry material order is
// +X, -X, +Y, -Y, +Z, -Z → RIGHT, LEFT, TOP, BOTTOM, FRONT, BACK.
function makeFaceTexture(text: string): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#eef0fa';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(80,90,140,0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, s - 6, s - 6);
  ctx.fillStyle = '#222a4a';
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, s / 2, s / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

const cubeFaceLabels = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];
const cubeMaterials = cubeFaceLabels.map(t => new THREE.MeshLambertMaterial({ map: makeFaceTexture(t) }));
const cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMaterials);
cubeScene.add(cubeMesh);
const cubeEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(cubeMesh.geometry),
  new THREE.LineBasicMaterial({ color: 0x2a3358 })
);
cubeScene.add(cubeEdges);

// 26 pickable zones: enumerate (dx,dy,dz) ∈ {-1,0,1}³ minus the origin. Each zone
// is a thin slab flush to the surface; #non-zero components → face(1)/edge(2)/corner(3).
const ZONE_BASE = 0x6fb7ff, ZONE_HI = 0x00ffff;
const CUBE_H = 0.5, ZONE_BAND = 0.2, ZONE_INNER = 1 - 2 * ZONE_BAND; // face inner = 0.6
const cubeZones: THREE.Mesh[] = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      const d = [dx, dy, dz];
      const size = d.map(c => (c === 0 ? ZONE_INNER : ZONE_BAND));
      const pos = d.map(c => c * (CUBE_H - ZONE_BAND / 2)); // slab flush to its face
      const zone = new THREE.Mesh(
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        new THREE.MeshBasicMaterial({ color: ZONE_BASE, transparent: true, opacity: 0 })
      );
      zone.position.set(pos[0] * 1.01, pos[1] * 1.01, pos[2] * 1.01); // just proud of the face
      zone.userData.dir = new THREE.Vector3(dx, dy, dz).normalize();
      cubeScene.add(zone);
      cubeZones.push(zone);
    }

// Orientation sync: place the cube camera along the main view's direction so the
// fixed, axis-aligned cube presents the same orientation as the scene. Read the
// ACTIVE camera so the cube also tracks rotation in orthographic mode.
const cubeOffset = new THREE.Vector3();
function syncCubeOrientation() {
  const cam = activeCamera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  cubeOffset.copy(cam.position).sub(controls.target).normalize().multiplyScalar(5);
  cubeCamera.position.copy(cubeOffset);
  cubeCamera.up.copy(cam.up);
  cubeCamera.lookAt(0, 0, 0);
  cubeCamera.updateMatrixWorld();
}

// Picking + hover.
const cubeRay = new THREE.Raycaster();
const cubePtr = new THREE.Vector2();
let hoveredZone: THREE.Mesh | null = null;

function pickZone(ev: PointerEvent): THREE.Mesh | null {
  const r = cubeRenderer.domElement.getBoundingClientRect();
  cubePtr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  cubePtr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  cubeRay.setFromCamera(cubePtr, cubeCamera);
  const hit = cubeRay.intersectObjects(cubeZones, false)[0];
  return hit ? (hit.object as THREE.Mesh) : null;
}

function setCubeHover(z: THREE.Mesh | null) {
  if (hoveredZone === z) return;
  if (hoveredZone) (hoveredZone.material as THREE.MeshBasicMaterial).opacity = 0;
  hoveredZone = z;
  if (hoveredZone) {
    const m = hoveredZone.material as THREE.MeshBasicMaterial;
    m.color.set(ZONE_HI);
    m.opacity = 0.45;
  }
}

// Camera snap animation toward a direction (keeps the current orbit distance).
const WORLD_UP = new THREE.Vector3(0, 1, 0);
let cubeTween: { from: THREE.Vector3; to: THREE.Vector3; fromUp: THREE.Vector3; toUp: THREE.Vector3; t0: number; dur: number } | null = null;

function snapToDir(dir: THREE.Vector3) {
  const n = dir.clone().normalize();
  const dist = camera.position.distanceTo(controls.target);
  const to = controls.target.clone().add(n.clone().multiplyScalar(dist));
  // Up is world-up, except a straight top/bottom view (dir ∥ Y) would gimbal → use Z.
  const toUp = Math.abs(n.dot(WORLD_UP)) > 0.99
    ? new THREE.Vector3(0, 0, n.y > 0 ? -1 : 1)
    : WORLD_UP.clone();
  cubeTween = { from: camera.position.clone(), to, fromUp: camera.up.clone(), toUp, t0: performance.now(), dur: 450 };
  controls.enabled = false; // block orbit input mid-flight
}

function updateCubeTween() {
  if (!cubeTween) return;
  const k = Math.min(1, (performance.now() - cubeTween.t0) / cubeTween.dur);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
  camera.position.lerpVectors(cubeTween.from, cubeTween.to, e);
  camera.up.lerpVectors(cubeTween.fromUp, cubeTween.toUp, e).normalize();
  camera.lookAt(controls.target);
  if (activeCamera === orthoCamera) syncOrthoToPerspective();
  if (k >= 1) {
    cubeTween = null;
    controls.enabled = true;
    controls.update();
  }
}

// Drag the cube to orbit the main view (spherical around the orbit target).
const _orbitOff = new THREE.Vector3();
const _orbitSph = new THREE.Spherical();
function orbitMain(dxPix: number, dyPix: number) {
  if (cubeTween) return;
  _orbitOff.copy(camera.position).sub(controls.target);
  _orbitSph.setFromVector3(_orbitOff);
  _orbitSph.theta -= dxPix * 0.01;
  _orbitSph.phi = Math.max(0.001, Math.min(Math.PI - 0.001, _orbitSph.phi - dyPix * 0.01));
  _orbitOff.setFromSpherical(_orbitSph);
  camera.position.copy(controls.target).add(_orbitOff);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
  if (activeCamera === orthoCamera) syncOrthoToPerspective();
  controls.update();
}

const cubeDom = cubeRenderer.domElement;
let cubeDownX = 0, cubeDownY = 0, cubeDragging = false, cubeMoved = false;
cubeDom.addEventListener('pointerdown', (ev) => {
  cubeDragging = true; cubeMoved = false;
  cubeDownX = ev.clientX; cubeDownY = ev.clientY;
  cubeDom.setPointerCapture(ev.pointerId);
  cubeContainer.style.cursor = 'grabbing';
});
cubeDom.addEventListener('pointermove', (ev) => {
  if (cubeDragging) {
    if (!cubeMoved && Math.hypot(ev.clientX - cubeDownX, ev.clientY - cubeDownY) > 4) cubeMoved = true;
    if (cubeMoved) orbitMain(ev.movementX, ev.movementY);
  } else {
    setCubeHover(pickZone(ev));
    cubeContainer.style.cursor = hoveredZone ? 'pointer' : 'grab';
  }
});
cubeDom.addEventListener('pointerup', (ev) => {
  if (cubeDragging && !cubeMoved) {
    const z = pickZone(ev);
    if (z) snapToDir(z.userData.dir as THREE.Vector3);
  }
  cubeDragging = false;
  cubeContainer.style.cursor = 'grab';
});
cubeDom.addEventListener('pointerleave', () => { if (!cubeDragging) setCubeHover(null); });

// Home button → a pleasant three-quarter view (front-right-top).
const cubeHomeBtn = document.createElement('button');
cubeHomeBtn.id = 'view-cube-home';
cubeHomeBtn.title = 'Home view';
cubeHomeBtn.setAttribute('aria-label', 'Home view');
cubeHomeBtn.textContent = '⌂';
cubeHomeBtn.addEventListener('click', () => snapToDir(new THREE.Vector3(1, 0.7, 1)));
cubeContainer.appendChild(cubeHomeBtn);

function updateViewCube() {
  updateCubeTween();
  syncCubeOrientation();
  cubeRenderer.render(cubeScene, cubeCamera);
}

// ===========================================================================
//  Init + loop
// ===========================================================================
buildWavefronts();
rebuildGrating();
rebuildPattern();

window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (activeCamera === orthoCamera) {
    // Keep the ortho camera's own orbit-driven transform; just refit the frustum
    // width to the new aspect so the scene doesn't stretch.
    const halfH = (orthoCamera.top - orthoCamera.bottom) / 2;
    orthoCamera.left = -halfH * aspect;
    orthoCamera.right = halfH * aspect;
    orthoCamera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update(); // handles damping + auto-rotate (orbits around the target)
  renderer.render(scene, activeCamera);
  labelRenderer.render(scene, activeCamera);
  updateViewCube();
}
animate();
