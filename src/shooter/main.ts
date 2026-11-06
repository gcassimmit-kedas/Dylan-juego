import * as THREE from 'three';
import {
  newWorld, step, buy, cannotBuy, owns, nextWave, useTool, selectWeapon, dronePos,
  SHOP, WEAPONS, WEAPON_ORDER, TOOL_ORDER,
  type World, type Input, type Bullet, type Pickup, type EnemyType, type WeaponId, type ToolId, type ShopItem, type ShopKind, type ItemId,
} from './sim.ts';
import { sfx, unlock, isMuted, setMuted } from './audio.ts';
import { MAT, makeSoldier, animateSoldier, showWeapon, makeRobot, animateRobot, makeTurret, makeDrone, makeMine, makeObstacle, type Robot } from './models.ts';
import { Effects, SOFT } from './fx.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const hpEl = $('hp'), waveEl = $('wave'), coinsEl = $('coins'), scoreEl = $('score'), bannerEl = $('banner'), rapidEl = $('rapid');
const overlay = $('overlay'), overlayMsg = $('overlayMsg'), playBtn = $<HTMLButtonElement>('play'), muteBtn = $('mute');
const weaponsEl = $('weapons'), toolsEl = $('tools'), shopEl = $('shop');
const isTouch = matchMedia('(pointer: coarse)').matches;
$('help').textContent = isTouch
  ? 'Pulgar izquierdo: moverte · Pulgar derecho: apuntar y disparar. Escóndete detrás de rocas y sacos.'
  : 'WASD: moverte · Ratón: apuntar · Clic: disparar · 1-7: armas · T G F B: equipo. Escóndete detrás de rocas y sacos.';

const ICON: Record<ItemId, string> = {
  pistola: '🔫', subfusil: '💨', escopeta: '💥', lanzallamas: '🔥', francotirador: '🎯', granadas: '💣', cohetes: '🚀',
  botiquin: '🩹', armadura: '🛡️', botas: '🥾', municion: '🔶', iman: '🧲', regeneracion: '💚', dron: '🛸',
  torreta: '🗼', mina: '🧨', escudo: '🔰', barricada: '🧱',
};
const TOOL_KEY: Record<ToolId, string> = { torreta: 'T', mina: 'G', escudo: 'F', barricada: 'B' };

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.75 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xcfe6f3);
scene.fog = new THREE.Fog(HORIZON, 45, 125);
scene.background = HORIZON;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

// Cielo con degradado y resplandor del sol
const SUN_DIR = new THREE.Vector3(0.35, 0.8, 0.3).normalize();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d8ee0) }, bottom: { value: HORIZON }, sun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y * 1.6, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.7));
      float s = max(dot(vDir, sun), 0.0); c += vec3(1.0, 0.92, 0.75) * (pow(s, 64.0) * 1.2 + pow(s, 6.0) * 0.18);
      gl_FragColor = vec4(c, 1.0); }`,
  }),
);
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xd6ecff, 0x5d6b3a, 1.15);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(hemi, sun, sun.target);
const SUN_OFFSET = SUN_DIR.clone().multiplyScalar(70);

let world: World = newWorld();
const A = world.arena;
const fx = new Effects(scene);

// ---------- Terreno ----------
function seeded(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function groundTexture() {
  const N = 1024, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!, r = seeded(11);
  g.fillStyle = '#6e9a3c'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 260; i++) { // manchas grandes de tono
    const x = r() * N, y = r() * N, rad = 30 + r() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = ['122,166,70', '96,138,52', '134,170,78', '104,150,58'][Math.floor(r() * 4)];
    grd.addColorStop(0, `rgba(${col},0.55)`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Caminos de tierra
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = 'rgba(146,118,78,0.75)'; g.lineWidth = 26 + r() * 14;
    g.beginPath();
    let x = r() * N, y = 0; g.moveTo(x, y);
    while (y < N) { x += (r() - 0.5) * 120; y += 60 + r() * 40; g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = 'rgba(110,86,56,0.35)'; g.lineWidth = 4; g.stroke(); // roderas
  }
  for (let i = 0; i < 9000; i++) { // briznas
    g.fillStyle = ['#7fae48', '#5d8a31', '#8cbc55', '#577f2c', '#9ac462'][Math.floor(r() * 5)];
    g.globalAlpha = 0.6; g.fillRect(r() * N, r() * N, 1.5, 3 + r() * 4);
  }
  for (let i = 0; i < 12; i++) { // cráteres viejos
    const x = r() * N, y = r() * N, rad = 14 + r() * 22;
    g.globalAlpha = 1;
    const grd = g.createRadialGradient(x, y, rad * 0.2, x, y, rad * 1.3);
    grd.addColorStop(0, 'rgba(60,44,28,0.85)'); grd.addColorStop(0.7, 'rgba(120,96,64,0.6)'); grd.addColorStop(1, 'rgba(120,96,64,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad * 1.3, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const field = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, A * 2), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
field.rotation.x = -Math.PI / 2;
field.receiveShadow = true;
scene.add(field);
const outside = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x648f37, roughness: 1 }));
outside.rotation.x = -Math.PI / 2; outside.position.y = -0.03; outside.receiveShadow = true;
scene.add(outside);

// Hierba y flores (instanciadas: miles de objetos en pocas llamadas de dibujo)
{
  const r = seeded(5);
  const blade = new THREE.ConeGeometry(0.07, 0.45, 3); blade.translate(0, 0.22, 0);
  const n = 2600, grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0x6f9e3a, roughness: 1 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = (r() * 2 - 1) * (A + 12), z = (r() * 2 - 1) * (A + 12), s = 0.6 + r() * 0.9;
    q.setFromEuler(e.set((r() - 0.5) * 0.5, r() * 6, (r() - 0.5) * 0.5));
    grass.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s)));
    grass.setColorAt(i, col.setHSL(0.24 + r() * 0.05, 0.45, 0.32 + r() * 0.12));
  }
  grass.receiveShadow = true;
  const petal = new THREE.IcosahedronGeometry(0.08, 0); petal.translate(0, 0.3, 0);
  const nf = 260, flowers = new THREE.InstancedMesh(petal, new THREE.MeshStandardMaterial({ roughness: 0.8 }), nf);
  const fc = [0xffffff, 0xffe066, 0xff8fb1, 0xb69cff];
  for (let i = 0; i < nf; i++) {
    flowers.setMatrixAt(i, m.makeTranslation((r() * 2 - 1) * (A + 10), 0, (r() * 2 - 1) * (A + 10)));
    flowers.setColorAt(i, col.setHex(fc[Math.floor(r() * fc.length)]));
  }
  scene.add(grass, flowers);
}

// Valla perimetral, árboles de fondo y colinas
{
  const r = seeded(9);
  const posts: THREE.Vector3[] = [];
  for (let t = -A; t <= A; t += 2.5) posts.push(new THREE.Vector3(t, 0, -A), new THREE.Vector3(t, 0, A), new THREE.Vector3(-A, 0, t), new THREE.Vector3(A, 0, t));
  const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.4, 6); postGeo.translate(0, 0.7, 0);
  const inst = new THREE.InstancedMesh(postGeo, MAT.wood, posts.length);
  posts.forEach((p, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.15).setPosition(p)));
  inst.castShadow = true;
  scene.add(inst);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 });
  for (const h of [0.45, 0.85, 1.25]) for (const [x, z, w, d] of [[0, -A, A * 2, 0.03], [0, A, A * 2, 0.03], [-A, 0, 0.03, A * 2], [A, 0, 0.03, A * 2]]) {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), wireMat);
    wire.position.set(x, h, z);
    scene.add(wire);
  }
  const crate = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = A + 4 + r() * 22;
    const t = makeObstacle('tree', 0.7, r() * 10, crate);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    t.scale.setScalar(1 + r() * 0.8);
    scene.add(t);
  }
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x5a8434, flatShading: true, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.3, d = 75 + r() * 25;
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat);
    h.position.set(Math.cos(a) * d, -4, Math.sin(a) * d);
    h.scale.set(22 + r() * 18, 10 + r() * 10, 22 + r() * 18);
    scene.add(h);
  }
}

// Nubes: invisibles para la cámara pero proyectan sombras que cruzan el campo
const clouds = new THREE.Group();
{
  const r = seeded(3);
  const cloudMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat);
      p.position.set((r() - 0.5) * 7, 0, (r() - 0.5) * 4);
      p.scale.set(3 + r() * 3, 1, 2.5 + r() * 2);
      p.castShadow = true;
      c.add(p);
    }
    c.position.set((r() * 2 - 1) * 60, 45, (r() * 2 - 1) * 60);
    clouds.add(c);
  }
  scene.add(clouds);
}

// ---------- Personajes y objetos ----------
const crateTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#a77a43'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 21) { g.fillStyle = y % 42 ? '#9b6f3b' : '#ae8149'; g.fillRect(0, y, 128, 20); g.fillStyle = 'rgba(60,35,10,0.5)'; g.fillRect(0, y + 20, 128, 1); }
  g.strokeStyle = '#5e3f1c'; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116);
  g.lineWidth = 10; g.beginPath(); g.moveTo(10, 10); g.lineTo(118, 118); g.stroke();
  g.fillStyle = '#3a3a3a'; for (const [x, y] of [[6, 6], [122, 6], [6, 122], [122, 122]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });

const soldier = makeSoldier();
scene.add(soldier.root);
showWeapon(soldier, 'pistola');

const ENEMY_COLOR: Record<EnemyType, number> = { chaser: 0xc8342f, tank: 0x5b4f7a, gunner: 0xe39a26 };

interface Bar { g: THREE.Group; fg: THREE.Mesh }
const barGeo = new THREE.PlaneGeometry(1, 0.14);
const barBg = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.65, depthTest: false });
const barFg = new THREE.MeshBasicMaterial({ color: 0x6fe05a, depthTest: false });
function makeBar(): Bar {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBg), fg = new THREE.Mesh(barGeo, barFg);
  bg.scale.set(1.08, 1.4, 1); fg.position.z = 0.001;
  bg.renderOrder = fg.renderOrder = 9;
  g.add(bg, fg);
  return { g, fg };
}

const robots = new Map<number, Robot & { bar: Bar }>();
const objs = { bullets: new Map<number, THREE.Object3D>(), pickups: new Map<number, THREE.Object3D>(), obstacles: new Map<number, THREE.Object3D>(),
  turrets: new Map<number, THREE.Object3D>(), mines: new Map<number, THREE.Object3D>() };
const drones: THREE.Group[] = [];

function sync<T extends { id: number }>(map: Map<number, THREE.Object3D>, list: T[], make: (t: T) => THREE.Object3D, place: (m: THREE.Object3D, t: T) => void) {
  const alive = new Set<number>();
  for (const t of list) {
    alive.add(t.id);
    let m = map.get(t.id);
    if (!m) { m = make(t); map.set(t.id, m); scene.add(m); }
    place(m, t);
  }
  for (const [id, m] of map) if (!alive.has(id)) { scene.remove(m); map.delete(id); }
}

// Proyectiles
const PG = {
  tracer: new THREE.BoxGeometry(0.08, 0.08, 0.8), pellet: new THREE.BoxGeometry(0.07, 0.07, 0.45), ray: new THREE.BoxGeometry(0.06, 0.06, 3.2),
  grenade: new THREE.SphereGeometry(0.2, 10, 8), rocket: new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), rocketTip: new THREE.ConeGeometry(0.1, 0.25, 8),
  orb: new THREE.SphereGeometry(0.16, 10, 8),
};
const PM = {
  tracer: new THREE.MeshBasicMaterial({ color: 0xfff1a0 }), ray: new THREE.MeshBasicMaterial({ color: 0xd8fbff }),
  grenade: new THREE.MeshStandardMaterial({ color: 0x3d4f2a, roughness: 0.6 }), rocket: new THREE.MeshStandardMaterial({ color: 0x55602f, roughness: 0.5 }),
  orb: new THREE.MeshBasicMaterial({ color: 0xffe2d0 }),
  fireHot: new THREE.SpriteMaterial({ map: SOFT, color: 0xffd23a, transparent: true, opacity: 0.95, depthWrite: false }),
  fire: new THREE.SpriteMaterial({ map: SOFT, color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false }),
  fireOld: new THREE.SpriteMaterial({ map: SOFT, color: 0xc8361a, transparent: true, opacity: 0.6, depthWrite: false }),
  glowRed: new THREE.SpriteMaterial({ map: SOFT, color: 0xff3a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  glowJet: new THREE.SpriteMaterial({ map: SOFT, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
};
function makeBullet(b: Bullet): THREE.Object3D {
  const yaw = Math.atan2(b.vx, b.vz);
  switch (b.kind) {
    case 'fuego': return new THREE.Sprite(PM.fireHot);
    case 'granada': { const m = new THREE.Mesh(PG.grenade, PM.grenade); m.castShadow = true; return m; }
    case 'cohete': {
      const g = new THREE.Group();
      const body = new THREE.Mesh(PG.rocket, PM.rocket); body.rotation.x = Math.PI / 2;
      const tip = new THREE.Mesh(PG.rocketTip, MAT.red); tip.rotation.x = Math.PI / 2; tip.position.z = 0.45;
      const jet = new THREE.Sprite(PM.glowJet); jet.scale.setScalar(0.8); jet.position.z = -0.5;
      g.add(body, tip, jet); g.rotation.y = yaw; g.castShadow = true;
      return g;
    }
    case 'enemiga': { const g = new THREE.Group(); const glow = new THREE.Sprite(PM.glowRed); glow.scale.setScalar(0.9); g.add(new THREE.Mesh(PG.orb, PM.orb), glow); return g; }
    default: {
      const m = new THREE.Mesh(b.kind === 'rayo' ? PG.ray : b.kind === 'perdigon' ? PG.pellet : PG.tracer, b.kind === 'rayo' ? PM.ray : PM.tracer);
      m.rotation.y = yaw;
      return m;
    }
  }
}

function makePickup(k: Pickup): THREE.Object3D {
  const g = new THREE.Group();
  if (k.type === 'coins') {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.25, emissive: 0x4a3000 }));
      c.position.set(i * 0.12 - 0.12, i * 0.1, 0); c.rotation.x = Math.PI / 2;
      g.add(c);
    }
  } else if (k.type === 'health') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 })));
    const red = new THREE.MeshBasicMaterial({ color: 0xe53935 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.52), red), new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.52), red));
  } else {
    const m = new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0xffa000, emissiveIntensity: 0.6 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.12), m); a.rotation.z = 0.5; a.position.set(-0.06, 0.15, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.12), m); b.rotation.z = 0.5; b.position.set(0.06, -0.15, 0);
    g.add(a, b);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color: k.type === 'health' ? 0xff6a6a : 0xffd84d, transparent: true, opacity: 0.45, depthWrite: false }));
  glow.scale.setScalar(1.6); glow.name = 'glow';
  g.add(glow);
  g.traverse((c) => (c.castShadow = c.type === 'Mesh'));
  return g;
}

// ---------- Entrada ----------
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (!playing || world.phase !== 'fight') return;
  const n = Number(e.key);
  if (n >= 1 && n <= 7) pickWeapon(WEAPON_ORDER[n - 1]);
  if (e.code === 'KeyQ' || e.code === 'KeyE') {
    const own = WEAPON_ORDER.filter((w) => world.player.owned.includes(w));
    const i = own.indexOf(world.player.weapon);
    pickWeapon(own[(i + (e.code === 'KeyE' ? 1 : own.length - 1)) % own.length]);
  }
  for (const t of TOOL_ORDER) if (e.code === `Key${TOOL_KEY[t]}`) tool(t);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const mouse = { x: 0, y: 0, down: false, active: false };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPt = new THREE.Vector3();

interface Stick { id: number; ox: number; oy: number; dx: number; dy: number; el: HTMLElement }
const sticks: { L: Stick | null; R: Stick | null } = { L: null, R: null };
const stickEls = { L: $('stickL'), R: $('stickR') };
const STICK_R = 50;

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (e.pointerType === 'mouse') { mouse.down = e.button === 0; mouse.active = true; return; }
  const side = e.clientX < innerWidth / 2 ? 'L' : 'R';
  if (sticks[side]) return;
  const el = stickEls[side];
  sticks[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, el };
  el.style.left = `${e.clientX}px`; el.style.top = `${e.clientY}px`;
  el.classList.add('on');
  try { canvas.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; return; }
  for (const s of [sticks.L, sticks.R]) if (s && s.id === e.pointerId) {
    let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    s.dx = dx / STICK_R; s.dy = dy / STICK_R;
    (s.el.firstElementChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
  }
});
function releaseStick(side: 'L' | 'R') {
  const s = sticks[side];
  if (!s) return;
  s.el.classList.remove('on');
  (s.el.firstElementChild as HTMLElement).style.transform = '';
  sticks[side] = null;
}
function endPointer(e: PointerEvent) {
  if (e.pointerType === 'mouse') { mouse.down = false; return; }
  for (const side of ['L', 'R'] as const) if (sticks[side]?.id === e.pointerId) releaseStick(side);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput(): Input {
  const inp: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };
  if (keys.has('KeyA') || keys.has('ArrowLeft')) inp.moveX -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) inp.moveX += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) inp.moveZ -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) inp.moveZ += 1;
  if (sticks.L) { inp.moveX = sticks.L.dx; inp.moveZ = sticks.L.dy; }
  if (sticks.R) {
    inp.aimX = sticks.R.dx; inp.aimZ = sticks.R.dy;
    inp.fire = Math.hypot(sticks.R.dx, sticks.R.dy) > 0.3;
  } else if (mouse.active) {
    ndc.set((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, hitPt)) { inp.aimX = hitPt.x - world.player.x; inp.aimZ = hitPt.z - world.player.z; }
    inp.fire = mouse.down || keys.has('Space');
  } else inp.fire = keys.has('Space');
  return inp;
}

// ---------- HUD ----------
let best = 0;
try { best = Number(localStorage.getItem('shooter.best')) || 0; } catch { /* sin storage */ }
let hudKey = '', prevCoins = 0;
function hud() {
  const p = world.player;
  rapidEl.hidden = p.rapid <= 0;
  const key = [p.hp, p.maxHp, world.score, world.wave, world.coins, p.weapon, p.owned.length, ...TOOL_ORDER.map((t) => p.tools[t]), p.shield > 0].join('|');
  if (key === hudKey) return;
  hudKey = key;
  hpEl.innerHTML = Array.from({ length: p.maxHp }, (_, i) => `<span class="${i < p.hp ? '' : 'off'}"></span>`).join('');
  scoreEl.textContent = String(world.score);
  waveEl.textContent = `Oleada ${Math.max(1, world.wave)}`;
  coinsEl.textContent = `🪙 ${world.coins}`;
  if (world.coins > prevCoins) { coinsEl.classList.add('pulse'); setTimeout(() => coinsEl.classList.remove('pulse'), 150); }
  prevCoins = world.coins;

  weaponsEl.innerHTML = '';
  WEAPON_ORDER.forEach((id, i) => {
    if (!p.owned.includes(id)) return;
    const b = document.createElement('button');
    b.className = `wbtn${p.weapon === id ? ' on' : ''}`;
    b.innerHTML = `${isTouch ? '' : `<small>${i + 1}</small>`}${ICON[id]}`;
    b.title = WEAPONS[id].name;
    b.setAttribute('aria-label', WEAPONS[id].name);
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); pickWeapon(id); });
    weaponsEl.appendChild(b);
  });
  weaponsEl.hidden = p.owned.length < 2;

  toolsEl.innerHTML = '';
  for (const t of TOOL_ORDER) {
    if (p.tools[t] <= 0 && !(t === 'escudo' && p.shield > 0)) continue;
    const b = document.createElement('button');
    b.className = `tool${t === 'escudo' && p.shield > 0 ? ' active' : ''}`;
    b.innerHTML = `${ICON[t]}<span>${p.tools[t]}</span>${isTouch ? '' : `<small>${TOOL_KEY[t]}</small>`}`;
    b.setAttribute('aria-label', SHOP.find((s) => s.id === t)!.name);
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); tool(t); });
    toolsEl.appendChild(b);
  }
  showWeapon(soldier, p.weapon);
}
function pickWeapon(id: WeaponId) { selectWeapon(world, id); hud(); }
function tool(id: ToolId) { if (useTool(world, id)) { flushEvents(); hud(); } }

let bannerTimer = 0;
function banner(text: string) {
  bannerEl.textContent = text;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), 1400);
}
muteBtn.textContent = isMuted() ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); muteBtn.textContent = isMuted() ? '🔇' : '🔊'; });

// ---------- Tienda ----------
const SECTIONS: { kind: ShopKind; title: string }[] = [
  { kind: 'arma', title: 'Armas' }, { kind: 'mejora', title: 'Mejoras' }, { kind: 'equipo', title: 'Equipo (se usa con un botón)' },
];
function card(item: ShopItem) {
  const reason = cannotBuy(world, item.id);
  const n = owns(world, item.id);
  const lvl = item.max ? `<div class="lvl">${item.kind === 'equipo' ? `Tienes ${n}/${item.max}` : `Nivel ${n}/${item.max}`}</div>` : '';
  const el = document.createElement('div');
  el.className = `card${n && item.kind !== 'equipo' ? ' owned' : ''}`;
  el.innerHTML = `<div class="ic">${ICON[item.id]}</div><div class="info"><div class="t">${item.name}</div><div class="d">${item.desc}</div>${lvl}</div>`;
  const b = document.createElement('button');
  b.textContent = reason && reason !== 'Faltan monedas' ? reason : `🪙 ${item.price}`;
  b.disabled = !!reason;
  b.addEventListener('click', () => { if (buy(world, item.id)) { sfx.pickup(); renderShop(); hud(); } });
  el.appendChild(b);
  return el;
}
function renderShop() {
  $('shopCoins').textContent = String(world.coins);
  const body = $('shopBody');
  body.innerHTML = '';
  for (const sec of SECTIONS) {
    const h = document.createElement('h3'); h.textContent = sec.title;
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const item of SHOP) if (item.kind === sec.kind) grid.appendChild(card(item));
    body.append(h, grid);
  }
}
function openShop(bonus: number) {
  releaseStick('L'); releaseStick('R'); mouse.down = false;
  $('shopTitle').textContent = `¡Oleada ${world.wave} superada!`;
  $('shopSub').textContent = `+${bonus} monedas de bonificación`;
  renderShop();
  setTimeout(() => { shopEl.hidden = false; ($('shopBody').parentElement as HTMLElement).scrollTop = 0; }, 700);
}
$('nextWave').addEventListener('click', () => { shopEl.hidden = true; nextWave(world); flushEvents(); });

// ---------- Partida ----------
let playing = false, shake = 0, recoil = 0;
function clearScene() {
  for (const map of Object.values(objs)) sync(map, [], () => new THREE.Object3D(), () => {});
  for (const r of robots.values()) { scene.remove(r.root); scene.remove(r.bar.g); }
  robots.clear();
  fx.clear();
}
function start() {
  unlock();
  clearScene();
  world = newWorld();
  hudKey = ''; prevCoins = 0;
  overlay.hidden = true; shopEl.hidden = true;
  playing = true;
  last = performance.now();
  hud();
}
function gameOver() {
  playing = false;
  const record = world.score > best;
  if (record) { best = world.score; try { localStorage.setItem('shooter.best', String(best)); } catch { /* sin storage */ } }
  overlayMsg.textContent = `${record ? '¡Nuevo récord! ' : ''}Puntos: ${world.score} · Oleada ${world.wave} · Récord: ${best}`;
  playBtn.textContent = 'Otra vez';
  setTimeout(() => (overlay.hidden = false), 1100);
}
overlayMsg.textContent = best ? `Récord: ${best}` : 'Sobrevive a las oleadas de robots. Gana monedas y compra armas y equipo entre una y otra.';
playBtn.addEventListener('click', start);
document.addEventListener('visibilitychange', () => { last = performance.now(); });

const muzzlePos = new THREE.Vector3();
const MUZZLE_COLOR: Partial<Record<WeaponId, number>> = { lanzallamas: 0xff6a1a, francotirador: 0xc8f6ff, cohetes: 0xffa040 };
function flushEvents() {
  const p = world.player;
  for (const ev of world.events) {
    switch (ev.kind) {
      case 'shoot':
        if (ev.weapon !== 'lanzallamas') sfx.shoot();
        recoil = ev.weapon === 'cohetes' || ev.weapon === 'francotirador' ? 1 : ev.weapon === 'escopeta' || ev.weapon === 'granadas' ? 0.7 : 0.35;
        soldier.muzzle.getWorldPosition(muzzlePos);
        fx.muzzle(muzzlePos, MUZZLE_COLOR[ev.weapon], ev.weapon === 'escopeta' || ev.weapon === 'cohetes' ? 1 : 0.6);
        if (ev.weapon === 'cohetes') fx.smoke(muzzlePos.x, muzzlePos.y, muzzlePos.z, 3, 0x8a8a8a, 0.6, 0.8);
        if (ev.weapon === 'francotirador') shake = Math.max(shake, 0.2);
        break;
      case 'enemyShoot': sfx.enemyShoot(); break;
      case 'hit': sfx.hit(); fx.sparks(ev.x, 0.8, ev.z, 0xffe7a0, 3, 4); break;
      case 'kill': {
        sfx.kill();
        const c = ENEMY_COLOR[ev.type], big = ev.type === 'tank';
        fx.debris(ev.x, 0.7, ev.z, c, big ? 16 : 9, big ? 9 : 7, big ? 0.3 : 0.2);
        fx.debris(ev.x, 0.7, ev.z, 0x34383c, big ? 8 : 4, 6, 0.16);
        fx.sparks(ev.x, 0.8, ev.z, 0xffc56a, 10, 8);
        fx.smoke(ev.x, 0.5, ev.z, big ? 6 : 3, 0x4a4a4a, big ? 1.4 : 0.8, 1.8);
        fx.text(ev.x, 1.8, ev.z, `+${ev.coins} 🪙`);
        shake = Math.max(shake, big ? 0.45 : 0.2);
        break;
      }
      case 'hurt': sfx.hurt(); shake = 0.6; fx.sparks(p.x, 1, p.z, 0xff5a5a, 10, 5); break;
      case 'pickup':
        sfx.pickup();
        fx.text(p.x, 2.2, p.z, ev.type === 'health' ? '+1 ❤️' : ev.type === 'coins' ? '+15 🪙' : '⚡', ev.type === 'health' ? '#ff8a8a' : '#ffd54a');
        if (ev.type === 'rapid') banner('¡DISPARO RÁPIDO!');
        break;
      case 'wave': sfx.wave(); banner(`OLEADA ${ev.wave}`); break;
      case 'explosion': sfx.kill(); fx.explosion(ev.x, ev.z, ev.r); shake = Math.max(shake, 0.25 + ev.r * 0.08); break;
      case 'crate': sfx.hit(); fx.debris(ev.x, 0.6, ev.z, 0xa7783f, 14, 6, 0.25); fx.smoke(ev.x, 0.4, ev.z, 3, 0xb79f78, 1, 1); break;
      case 'blocked': fx.sparks(ev.x, 0.9, ev.z, 0xffd0a0, 3, 3); break;
      case 'tool':
        sfx.pickup();
        banner({ torreta: 'TORRETA', mina: 'MINA COLOCADA', escudo: '¡ESCUDO!', barricada: 'BARRICADA' }[ev.tool]);
        if (ev.tool === 'barricada') fx.smoke(p.x + Math.sin(p.angle) * 2.4, 0.3, p.z + Math.cos(p.angle) * 2.4, 4, 0xb79f78, 1.5, 0.6);
        break;
      case 'regen': fx.text(p.x, 2.2, p.z, '+1 ❤️', '#8aff9a'); break;
      case 'waveCleared': sfx.wave(); banner('¡OLEADA SUPERADA!'); openShop(ev.bonus); break;
      case 'gameover': sfx.gameover(); fx.debris(p.x, 1, p.z, 0x5d7a3e, 14, 6); fx.smoke(p.x, 0.5, p.z, 6); gameOver(); break;
    }
  }
  world.events.length = 0;
}

// ---------- Calidad adaptativa ----------
// ?calidad=alta o ?calidad=baja fuerza el modo; si no, se decide midiendo los FPS.
const QUALITY = new URLSearchParams(location.search).get('calidad');
let perfFrames = 0, perfTime = 0, perfDone = QUALITY === 'alta', lowQuality = false;
function adaptQuality(dt: number) {
  if (perfDone) return;
  perfFrames++; perfTime += dt;
  if (QUALITY !== 'baja' && perfFrames < 150 && perfTime < 2.5) return;
  perfDone = true;
  if (QUALITY !== 'baja' && perfFrames / perfTime >= 40) return;
  lowQuality = true;
  renderer.shadowMap.enabled = false;
  sun.castShadow = false;
  renderer.setPixelRatio(1);
  scene.traverse((o) => {
    if (o.name === 'blob') o.visible = true; // sombras falsas bajo los personajes
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) m.needsUpdate = true;
  });
  resize();
}
const setBlobs = (o: THREE.Object3D) => { if (lowQuality) o.traverse((c) => { if (c.name === 'blob') c.visible = true; }); return o; };

// ---------- Bucle ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const camGoal = new THREE.Vector3(), jitter = new THREE.Vector3();
// ?zoom=0.4 acerca la cámara (útil para ver los modelos de cerca)
const ZOOM = Number(new URLSearchParams(location.search).get('zoom')) || 1;
let last = performance.now(), prevPX = 0, prevPZ = 0, dustT = 0;
function frame(now: number) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  const t = now / 1000;
  if (playing && !document.hidden && rawDt < 1) adaptQuality(rawDt);
  if (playing && !document.hidden && world.phase === 'fight') {
    step(world, readInput(), dt);
    flushEvents();
  }
  hud();

  // Soldado
  const p = world.player;
  const pSpeed = dt > 0 ? Math.hypot(p.x - prevPX, p.z - prevPZ) / dt : 0;
  prevPX = p.x; prevPZ = p.z;
  recoil = Math.max(0, recoil - dt * 6);
  soldier.root.position.set(p.x, 0, p.z);
  soldier.root.rotation.y = p.angle;
  soldier.root.visible = !world.over && (p.invuln <= 0 || p.shield > 0 || Math.floor(now / 80) % 2 === 0);
  soldier.shield.visible = p.shield > 0 && (p.shield > 1 || Math.floor(now / 100) % 2 === 0);
  animateSoldier(soldier, pSpeed, dt, t, recoil);
  if (pSpeed > 2 && (dustT -= dt) <= 0) { dustT = 0.12; fx.dust(p.x, p.z); }

  // Robots
  const alive = new Set<number>();
  for (const e of world.enemies) {
    alive.add(e.id);
    let r = robots.get(e.id);
    if (!r) {
      r = Object.assign(makeRobot(e.type), { bar: makeBar() });
      r.px = e.x; r.pz = e.z;
      setBlobs(r.root);
      robots.set(e.id, r);
      scene.add(r.root, r.bar.g);
    }
    animateRobot(r, e.x, e.z, p.x, p.z, dt, t, e.flash > 0);
    const hurtK = e.hp / e.maxHp;
    r.bar.g.visible = hurtK < 1;
    if (hurtK < 1) {
      r.bar.g.position.set(e.x, e.type === 'tank' ? 2.1 : 1.9, e.z);
      r.bar.g.quaternion.copy(camera.quaternion);
      r.bar.fg.scale.x = Math.max(0.001, hurtK);
      r.bar.fg.position.x = -(1 - hurtK) / 2;
    }
  }
  for (const [id, r] of robots) if (!alive.has(id)) { scene.remove(r.root, r.bar.g); robots.delete(id); }

  sync(objs.obstacles, world.obstacles, (o) => setBlobs(makeObstacle(o.kind, o.r, o.rot, crateMat)), (m, o) => {
    m.position.set(o.x, 0, o.z);
    if (o.kind === 'crate') m.scale.setScalar(0.85 + 0.15 * (o.hp / 4));
    if (o.kind === 'barricade') m.scale.y = 0.6 + 0.4 * (o.hp / 18);
  });
  sync(objs.bullets, world.bullets, makeBullet, (m, b) => {
    let y = 1.05;
    if (b.kind === 'granada') y = 0.8 + Math.sin(Math.PI * (1 - b.life / b.maxLife)) * 2.4;
    if (b.kind === 'enemiga') y = 1;
    m.position.set(b.x, y, b.z);
    if (b.kind === 'fuego') {
      const k = 1 - b.life / b.maxLife; // 0 → 1 con la edad: amarillo, naranja, rojo
      const sp = m as THREE.Sprite;
      sp.material = k < 0.3 ? PM.fireHot : k < 0.7 ? PM.fire : PM.fireOld;
      sp.scale.setScalar(0.45 + k * 1.5);
      m.position.y = 1 + k * 0.6;
    }
    if (b.kind === 'cohete' && Math.random() < 0.5) fx.smoke(b.x, 1, b.z, 1, 0x9a9a9a, 0.35, 0.4);
    if (b.kind === 'granada') m.rotation.x += dt * 12;
  });
  sync(objs.pickups, world.pickups, makePickup, (m, k) => {
    m.position.set(k.x, 0.75 + Math.sin(now / 220 + k.id) * 0.18, k.z);
    m.rotation.y = now / 450;
    m.visible = k.life > 2.5 || Math.floor(now / 120) % 2 === 0;
  });
  sync(objs.turrets, world.turrets, () => setBlobs(makeTurret()), (m, tr) => {
    m.position.set(tr.x, 0, tr.z);
    m.getObjectByName('head')!.rotation.y = tr.angle;
    m.visible = tr.life > 4 || Math.floor(now / 150) % 2 === 0;
  });
  sync(objs.mines, world.mines, () => makeMine(), (m, mi) => {
    m.position.set(mi.x, 0, mi.z);
    m.getObjectByName('light')!.visible = mi.arm > 0 ? Math.floor(now / 300) % 2 === 0 : Math.floor(now / 120) % 2 === 0;
  });
  while (drones.length < p.drones) { const d = makeDrone(); drones.push(d); scene.add(d); }
  while (drones.length > p.drones) scene.remove(drones.pop()!);
  drones.forEach((d, i) => {
    const [x, z] = dronePos(world, i);
    d.position.set(x, 2.2 + Math.sin(t * 3 + i) * 0.15, z);
    d.rotation.y = p.angle;
    for (const r of d.userData.rotors as THREE.Mesh[]) r.rotation.y += dt * 40;
  });

  fx.update(dt);
  for (const c of clouds.children) { c.position.x += dt * 2.2; if (c.position.x > 70) c.position.x = -70; }

  // Cámara y sol siguen al jugador
  const portrait = camera.aspect < 1;
  const h = (portrait ? 26 : 17) * ZOOM, back = (portrait ? 11 : 11.5) * ZOOM;
  camGoal.set(p.x, h, p.z + back);
  camera.position.lerp(camGoal, 1 - Math.exp(-dt * 6));
  shake = Math.max(0, shake - dt * 2);
  jitter.set((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake);
  camera.position.add(jitter);
  camera.lookAt(camera.position.x, 0, camera.position.z - back);
  sun.target.position.set(camera.position.x, 0, camera.position.z - back);
  sun.position.copy(sun.target.position).add(SUN_OFFSET);
  sky.position.copy(camera.position);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Para pruebas automatizadas
Object.assign(window, { __world: () => world, __lowQuality: () => lowQuality, __flush: flushEvents });
