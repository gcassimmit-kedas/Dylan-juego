import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { newGame, play, aiMove, coords, canPlay, type GameState, type Difficulty } from './game.ts';

const COLORS = { x: 0xff5d73, o: 0x4fc3ff, empty: 0x8890c8, hover: 0xffffff, win: 0xffe066 };

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;
const sizeEl = document.getElementById('size') as HTMLSelectElement;
const modeEl = document.getElementById('mode') as HTMLSelectElement;
const spreadEl = document.getElementById('spread') as HTMLInputElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1222);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 30;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(5, 10, 7);
scene.add(sun);

const board = new THREE.Group();
scene.add(board);

// Geometrías compartidas
const slotGeo = new THREE.SphereGeometry(0.12, 16, 12);
const hitGeo = new THREE.SphereGeometry(0.38, 8, 6);
const xGeo = new THREE.BoxGeometry(0.62, 0.14, 0.14);
const oGeo = new THREE.TorusGeometry(0.26, 0.09, 14, 32);

let state: GameState;
let slots: THREE.Mesh[] = []; // marcador visible de casilla vacía
let hits: THREE.Mesh[] = []; // esferas invisibles para tocar (más fáciles de acertar)
let pieces: (THREE.Object3D | null)[] = [];
let plates: THREE.Mesh[] = [];
let winBeam: THREE.Mesh | null = null;
let hovered = -1;
let aiTimer = 0;

const mode = () => modeEl.value;
const isCpuTurn = () => mode() !== '2p' && state.turn === 2 && !state.winner && !state.draw;

function cellPos(i: number, out = new THREE.Vector3()) {
  const n = state.n;
  const [x, y, z] = coords(n, i);
  const c = (n - 1) / 2;
  const gap = 1 + Number(spreadEl.value) * 1.6; // separación vertical entre capas
  return out.set(x - c, (y - c) * gap, z - c);
}

function makePiece(p: 1 | 2): THREE.Object3D {
  if (p === 1) {
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.x, roughness: 0.35, metalness: 0.1 });
    const g = new THREE.Group();
    const a = new THREE.Mesh(xGeo, mat), b = new THREE.Mesh(xGeo, mat);
    a.rotation.y = Math.PI / 4; b.rotation.y = -Math.PI / 4;
    g.add(a, b);
    return g;
  }
  const o = new THREE.Mesh(oGeo, new THREE.MeshStandardMaterial({ color: COLORS.o, roughness: 0.35, metalness: 0.1 }));
  o.rotation.x = Math.PI / 2;
  return o;
}

function clearBoard() {
  board.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) m.dispose();
  });
  board.clear();
  slots = []; hits = []; pieces = []; plates = [];
  winBeam?.geometry.dispose();
  winBeam = null;
}

function build() {
  clearBoard();
  const n = state.n;
  for (let y = 0; y < n; y++) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(n - 0.1, 0.03, n - 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2a3066, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    plate.userData.layer = y;
    plates.push(plate);
    board.add(plate);
  }
  state.cells.forEach((v, i) => {
    const slot = new THREE.Mesh(slotGeo, new THREE.MeshStandardMaterial({ color: COLORS.empty, transparent: true, opacity: 0.55 }));
    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.i = i;
    slot.visible = v === 0;
    board.add(slot, hit);
    slots.push(slot); hits.push(hit); pieces.push(null);
  });
  layout();
  const d = n === 4 ? 9 : 7.5;
  camera.position.set(d * 0.75, d * 0.55, d * 0.85);
  controls.target.set(0, 0, 0);
}

function layout() {
  const v = new THREE.Vector3();
  state.cells.forEach((_, i) => {
    cellPos(i, v);
    slots[i].position.copy(v); hits[i].position.copy(v);
    pieces[i]?.position.copy(v);
  });
  plates.forEach((p) => p.position.set(0, cellPos(state.n * p.userData.layer, v).y - 0.32, 0));
  if (state.winLine) drawWin();
}

function drawWin() {
  if (winBeam) { board.remove(winBeam); winBeam.geometry.dispose(); (winBeam.material as THREE.Material).dispose(); }
  const l = state.winLine!;
  const a = cellPos(l[0]), b = cellPos(l[l.length - 1]);
  const len = a.distanceTo(b) + 0.8;
  winBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, len, 12),
    new THREE.MeshBasicMaterial({ color: COLORS.win }),
  );
  winBeam.position.copy(a).add(b).multiplyScalar(0.5);
  winBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  board.add(winBeam);
}

function sync() {
  state.cells.forEach((v, i) => {
    if ((v === 1 || v === 2) && !pieces[i]) {
      const p = makePiece(v);
      p.position.copy(cellPos(i));
      p.scale.setScalar(0.01);
      p.userData.born = performance.now();
      board.add(p);
      pieces[i] = p;
    }
    slots[i].visible = v === 0 && !state.winner;
  });
  if (state.winLine) drawWin();
  const sym = state.turn === 1 ? 'X' : 'O';
  statusEl.className = '';
  if (state.winner) {
    const w = state.winner === 1 ? 'X' : 'O';
    statusEl.textContent = mode() !== '2p' ? (state.winner === 1 ? '¡Ganaste! 🎉' : 'Gana la CPU') : `¡Gana ${w}! 🎉`;
    statusEl.classList.add(w.toLowerCase());
  } else if (state.draw) {
    statusEl.textContent = 'Empate';
  } else {
    statusEl.textContent = isCpuTurn() ? 'La CPU piensa…' : `Turno de ${sym}`;
    statusEl.classList.add(sym.toLowerCase());
  }
}

function move(i: number) {
  if (!canPlay(state, i)) return;
  state = play(state, i);
  sync();
  if (isCpuTurn()) {
    const level = mode().split('-')[1] as Difficulty;
    aiTimer = window.setTimeout(() => move(aiMove(state, level)), 450);
  }
}

function restart() {
  clearTimeout(aiTimer);
  state = newGame(Number(sizeEl.value));
  build();
  sync();
}

// ----- Entrada: distinguir toque de arrastre (rotar) -----
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(e: PointerEvent): number {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const free = hits.filter((h) => state.cells[h.userData.i] === 0);
  const hit = ray.intersectObjects(free, false)[0];
  return hit ? (hit.object.userData.i as number) : -1;
}
let down: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > 8 || isCpuTurn()) return;
  const i = pick(e);
  if (i >= 0) move(i);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  hovered = isCpuTurn() ? -1 : pick(e);
  canvas.style.cursor = hovered >= 0 ? 'pointer' : 'grab';
});

sizeEl.addEventListener('change', restart);
modeEl.addEventListener('change', restart);
document.getElementById('restart')!.addEventListener('click', restart);
spreadEl.addEventListener('input', layout);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // En vertical (móvil) alejamos la cámara para que quepa el cubo.
  camera.fov = w < h ? 65 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function frame(t: number) {
  controls.update();
  slots.forEach((s, i) => {
    const m = s.material as THREE.MeshStandardMaterial;
    const on = i === hovered;
    m.color.setHex(on ? (state.turn === 1 ? COLORS.x : COLORS.o) : COLORS.empty);
    s.scale.setScalar(on ? 1.8 : 1);
  });
  for (const p of pieces) {
    if (!p) continue;
    const k = Math.min(1, (t - p.userData.born) / 220);
    p.scale.setScalar(0.01 + 0.99 * (1 - (1 - k) ** 3));
  }
  if (winBeam) (winBeam.material as THREE.MeshBasicMaterial).color.setHSL(0.14, 1, 0.55 + 0.15 * Math.sin(t / 150));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
restart();
requestAnimationFrame(frame);

// Para pruebas automatizadas
Object.assign(window, { __game: () => state, __move: move });
