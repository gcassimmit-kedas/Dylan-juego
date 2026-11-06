import * as THREE from 'three';
import {
  newWorld, step, buy, cannotBuy, owns, nextWave, deployTurret, selectWeapon,
  SHOP, WEAPONS, WEAPON_ORDER, waveBonus,
  type World, type Input, type Enemy, type Bullet, type Pickup, type EnemyType, type Obstacle, type Turret, type WeaponId, type ShopItem,
} from './sim.ts';
import { sfx, unlock, isMuted, setMuted } from './audio.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const hpEl = $('hp'), waveEl = $('wave'), coinsEl = $('coins'), scoreEl = $('score'), bannerEl = $('banner'), rapidEl = $('rapid');
const overlay = $('overlay'), overlayMsg = $('overlayMsg'), playBtn = $<HTMLButtonElement>('play'), muteBtn = $('mute');
const weaponsEl = $('weapons'), turretBtn = $<HTMLButtonElement>('turretBtn'), turretCount = $('turretCount');
const shopEl = $('shop');
const isTouch = matchMedia('(pointer: coarse)').matches;
$('help').textContent = isTouch
  ? 'Pulgar izquierdo: moverte · Pulgar derecho: apuntar y disparar. Escóndete detrás de rocas y sacos.'
  : 'WASD: moverte · Ratón: apuntar · Clic: disparar · 1-4: armas · T: torreta. Escóndete detrás de rocas y sacos.';

const ICON: Record<string, string> = {
  pistola: '🔫', subfusil: '💥', escopeta: '🎯', granadas: '💣', botiquin: '🩹', armadura: '🛡️', botas: '🥾', municion: '🔶', torreta: '🗼',
};

// ---------- Escena de día ----------
const SKY = 0x9fd4f2;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 45, 95);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x5a6b34, 1.3));
const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(14, 30, 10);

let world: World = newWorld();
const A = world.arena;

function groundTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#6f9a3e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { // matas de hierba
    g.fillStyle = ['#7aa646', '#628c36', '#86b04f', '#5c8131'][Math.floor(r() * 4)];
    g.globalAlpha = 0.5; g.beginPath(); g.arc(r() * 512, r() * 512, 2 + r() * 7, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 14; i++) { // tierra removida
    const x = r() * 512, y = r() * 512, rad = 18 + r() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(120, 92, 58, 0.85)'); grd.addColorStop(1, 'rgba(120, 92, 58, 0)');
    g.globalAlpha = 1; g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 7; i++) { // cráteres
    const x = r() * 512, y = r() * 512, rad = 8 + r() * 12;
    g.globalAlpha = 0.7; g.fillStyle = '#4b3a26'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.6; g.strokeStyle = '#8a6e48'; g.lineWidth = 3; g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const field = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, A * 2), new THREE.MeshStandardMaterial({ map: groundTexture(7), roughness: 1 }));
field.rotation.x = -Math.PI / 2;
field.receiveShadow = true;
scene.add(field);
const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5f8a35, roughness: 1 }));
outside.rotation.x = -Math.PI / 2;
outside.position.y = -0.02;
scene.add(outside);

// Valla perimetral (postes + alambre)
{
  const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), postMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2e });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x8b8f94, metalness: 0.6, roughness: 0.4 });
  const posts: THREE.Vector3[] = [];
  for (let t = -A; t <= A; t += 3) posts.push(new THREE.Vector3(t, 0.7, -A), new THREE.Vector3(t, 0.7, A), new THREE.Vector3(-A, 0.7, t), new THREE.Vector3(A, 0.7, t));
  const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  posts.forEach((p, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  inst.castShadow = true;
  scene.add(inst);
  for (const h of [0.5, 1.05]) for (const [x, z, w, d] of [[0, -A, A * 2, 0.04], [0, A, A * 2, 0.04], [-A, 0, 0.04, A * 2], [A, 0, 0.04, A * 2]]) {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), wireMat);
    wire.position.set(x, h, z);
    scene.add(wire);
  }
}

// Árboles de fondo fuera del campo
{
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 6), leaves = new THREE.ConeGeometry(1.6, 3.6, 7);
  const tm = new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), lm = new THREE.MeshStandardMaterial({ color: 0x3f6b2a, flatShading: true });
  const n = 90, ti = new THREE.InstancedMesh(trunk, tm, n), li = new THREE.InstancedMesh(leaves, lm, n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rad = A + 5 + Math.random() * 18;
    const x = Math.cos(a) * rad * (1 + Math.random() * 0.15), z = Math.sin(a) * rad, s = 0.8 + Math.random() * 0.8;
    ti.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 1 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
    li.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 3.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
  }
  scene.add(ti, li);
}

// ---------- Modelos ----------
const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse((c) => { c.castShadow = true; c.receiveShadow = true; }); return o; };

const crateTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#a7783f'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#6b4a22'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.lineWidth = 5; g.beginPath(); g.moveTo(4, 4); g.lineTo(60, 60); g.stroke();
  g.strokeStyle = 'rgba(80,50,20,0.35)'; g.lineWidth = 1;
  for (let y = 12; y < 64; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

const G = {
  rock: new THREE.DodecahedronGeometry(1, 0),
  trunk: new THREE.CylinderGeometry(0.22, 0.3, 1.4, 7),
  leaves: new THREE.IcosahedronGeometry(1.15, 0),
  crate: new THREE.BoxGeometry(1.2, 1.2, 1.2),
  bag: new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
  chaser: new THREE.OctahedronGeometry(0.65),
  tank: new THREE.BoxGeometry(1.7, 1, 1.7),
  turretTop: new THREE.CylinderGeometry(0.45, 0.55, 0.5, 8),
  gunner: new THREE.CylinderGeometry(0.6, 0.7, 1.1, 6),
  tracer: new THREE.BoxGeometry(0.1, 0.1, 0.7),
  ebullet: new THREE.SphereGeometry(0.2, 10, 8),
  grenade: new THREE.SphereGeometry(0.22, 10, 8),
  health: new THREE.BoxGeometry(0.75, 0.75, 0.75),
  rapid: new THREE.OctahedronGeometry(0.5),
  coin: new THREE.CylinderGeometry(0.4, 0.4, 0.12, 16),
  spark: new THREE.BoxGeometry(0.2, 0.2, 0.2),
  scorch: new THREE.CircleGeometry(1, 20),
  flash: new THREE.SphereGeometry(1, 16, 12),
};
const M = {
  rock: mat(0x8a8d8f, { flatShading: true }), trunk: mat(0x6b4a2b), leaves: mat(0x4a7f2e, { flatShading: true }),
  crate: mat(0xffffff, { map: crateTex }), bag: mat(0xc8b48a),
  tracer: new THREE.MeshBasicMaterial({ color: 0xfff27a }), ebullet: new THREE.MeshBasicMaterial({ color: 0xff5a2a }),
  grenade: mat(0x3d4f2a), turretBase: mat(0x55606a, { metalness: 0.5 }), turretTop: mat(0x7d8b6a, { metalness: 0.3 }),
  scorch: new THREE.MeshBasicMaterial({ color: 0x241a10, transparent: true, opacity: 0.55, depthWrite: false }),
};

function makeObstacle(o: Obstacle): THREE.Object3D {
  const g = new THREE.Group();
  if (o.kind === 'rock') {
    const m = new THREE.Mesh(G.rock, M.rock);
    m.scale.set(o.r * 1.05, o.r * 0.75, o.r * 1.05);
    m.position.y = o.r * 0.35;
    m.rotation.set(o.rot, o.rot * 2, 0);
    g.add(m);
  } else if (o.kind === 'tree') {
    const t = new THREE.Mesh(G.trunk, M.trunk); t.position.y = 0.7;
    const l = new THREE.Mesh(G.leaves, M.leaves); l.position.y = 1.9; l.scale.set(1, 0.9, 1); l.rotation.y = o.rot;
    g.add(t, l);
  } else if (o.kind === 'crate') {
    const m = new THREE.Mesh(G.crate, M.crate); m.position.y = 0.6; m.rotation.y = o.rot;
    g.add(m);
  } else {
    for (const [y, off] of [[0.3, -0.25], [0.3, 0.25], [0.78, 0]]) {
      const b = new THREE.Mesh(G.bag, M.bag);
      b.rotation.z = Math.PI / 2;
      b.position.set(0, y, off);
      g.add(b);
    }
    g.rotation.y = -o.rot;
  }
  g.position.set(o.x, 0, o.z);
  return shadowed(g);
}

// Soldado
const player = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 12), mat(0x4f6b3a));
  body.position.y = 0.75;
  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.45, 12), mat(0x3a4d2a));
  vest.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), mat(0xe0b48a));
  head.position.y = 1.42;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x556b2f));
  helmet.position.y = 1.47;
  player.add(body, vest, head, helmet);
}
const gun = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x2b2b2b, { metalness: 0.4, roughness: 0.5 }));
player.add(gun);
const GUN_SHAPE: Record<WeaponId, [number, number, number]> = { pistola: [0.14, 0.18, 0.5], subfusil: [0.16, 0.2, 0.85], escopeta: [0.18, 0.18, 1.15], granadas: [0.3, 0.3, 0.9] };
function setGun(id: WeaponId) {
  const [w, h, d] = GUN_SHAPE[id];
  gun.scale.set(w, h, d);
  gun.position.set(0.28, 0.95, 0.25 + d / 2);
}
shadowed(player);
scene.add(player);

const ENEMY_COLOR: Record<EnemyType, number> = { chaser: 0xd63a3a, tank: 0x5b4a7a, gunner: 0xe08a1e };
function makeEnemy(e: Enemy) {
  const c = ENEMY_COLOR[e.type];
  const m = mat(c, { emissive: c, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0.2 });
  const g = new THREE.Group();
  if (e.type === 'tank') {
    const hull = new THREE.Mesh(G.tank, m); hull.position.y = 0.5;
    const top = new THREE.Mesh(G.turretTop, m); top.position.y = 1.2;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1), mat(0x2b2b2b)); barrel.position.set(0, 1.2, 0.7);
    g.add(hull, top, barrel);
  } else {
    const b = new THREE.Mesh(e.type === 'chaser' ? G.chaser : G.gunner, m);
    b.position.y = 0.75; b.name = 'body';
    g.add(b);
    if (e.type === 'gunner') { const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.8), mat(0x2b2b2b)); barrel.position.set(0, 0.9, 0.6); g.add(barrel); }
  }
  g.userData.mat = m;
  return shadowed(g);
}
function makeBullet(b: Bullet): THREE.Object3D {
  if (b.blast) return shadowed(new THREE.Mesh(G.grenade, M.grenade));
  const m = new THREE.Mesh(b.enemy ? G.ebullet : G.tracer, b.enemy ? M.ebullet : M.tracer);
  m.rotation.y = Math.atan2(b.vx, b.vz);
  return m;
}
function makePickup(k: Pickup): THREE.Object3D {
  if (k.type === 'coins') return shadowed(new THREE.Mesh(G.coin, mat(0xffc83d, { metalness: 0.8, roughness: 0.3, emissive: 0x553300 })));
  const c = k.type === 'health' ? 0xff4d4d : 0xffd84d;
  const m = new THREE.Mesh(k.type === 'health' ? G.health : G.rapid, mat(c, { emissive: c, emissiveIntensity: 0.35 }));
  if (k.type === 'health') {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), mat(0xffffff));
    const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2;
    m.add(cross, cross2);
  }
  return shadowed(m);
}
function makeTurret(_t: Turret): THREE.Object3D {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.5, 8), M.turretBase); base.position.y = 0.25;
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.75;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), M.turretTop);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), mat(0x2b2b2b)); barrel.position.z = 0.5;
  head.add(box, barrel);
  g.add(base, head);
  return shadowed(g);
}

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
const meshes = { enemies: new Map<number, THREE.Object3D>(), bullets: new Map<number, THREE.Object3D>(), pickups: new Map<number, THREE.Object3D>(),
  obstacles: new Map<number, THREE.Object3D>(), turrets: new Map<number, THREE.Object3D>() };

// ---------- Efectos ----------
interface Fx { o: THREE.Object3D; vx: number; vy: number; vz: number; life: number; max: number; kind: 'spark' | 'flash' | 'scorch'; size: number }
const fx: Fx[] = [];
const sparkMats = new Map<number, THREE.MeshBasicMaterial>();
function burst(x: number, z: number, color: number, count: number, power = 8, y = 0.7) {
  let m = sparkMats.get(color);
  if (!m) sparkMats.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  for (let i = 0; i < count; i++) {
    const o = new THREE.Mesh(G.spark, m);
    o.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, s = power * (0.3 + Math.random()), life = 0.35 + Math.random() * 0.4;
    fx.push({ o, vx: Math.cos(a) * s, vy: 2 + Math.random() * 6, vz: Math.sin(a) * s, life, max: life, kind: 'spark', size: 1 });
    scene.add(o);
  }
}
function explosionFx(x: number, z: number, r: number) {
  const f = new THREE.Mesh(G.flash, new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.85, depthWrite: false }));
  f.position.set(x, 0.6, z);
  fx.push({ o: f, vx: 0, vy: 0, vz: 0, life: 0.35, max: 0.35, kind: 'flash', size: r });
  scene.add(f);
  const s = new THREE.Mesh(G.scorch, M.scorch.clone());
  s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z); s.scale.setScalar(r * 0.7);
  fx.push({ o: s, vx: 0, vy: 0, vz: 0, life: 12, max: 12, kind: 'scorch', size: r });
  scene.add(s);
  burst(x, z, 0xff8a1e, 18, 10); burst(x, z, 0x5a5a5a, 12, 6); burst(x, z, 0x6b4a2b, 8, 7, 0.2);
}

// ---------- Entrada ----------
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (!playing || world.phase !== 'fight') return;
  const n = Number(e.key);
  if (n >= 1 && n <= 4) pickWeapon(WEAPON_ORDER[n - 1]);
  if (e.code === 'KeyQ' || e.code === 'KeyE') {
    const own = WEAPON_ORDER.filter((w) => world.player.owned.includes(w));
    const i = own.indexOf(world.player.weapon);
    pickWeapon(own[(i + (e.code === 'KeyE' ? 1 : own.length - 1)) % own.length]);
  }
  if (e.code === 'KeyT') placeTurret();
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
function endPointer(e: PointerEvent) {
  if (e.pointerType === 'mouse') { mouse.down = false; return; }
  for (const side of ['L', 'R'] as const) {
    const s = sticks[side];
    if (s && s.id === e.pointerId) releaseStick(side);
  }
}
function releaseStick(side: 'L' | 'R') {
  const s = sticks[side];
  if (!s) return;
  s.el.classList.remove('on');
  (s.el.firstElementChild as HTMLElement).style.transform = '';
  sticks[side] = null;
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

// ---------- HUD, armas y torreta ----------
let best = 0;
try { best = Number(localStorage.getItem('shooter.best')) || 0; } catch { /* sin storage */ }
let hudKey = '';
function hud() {
  const p = world.player;
  const key = [p.hp, p.maxHp, world.score, world.wave, world.coins, p.weapon, p.owned.length, p.turrets].join('|');
  rapidEl.hidden = p.rapid <= 0;
  if (key === hudKey) return;
  const prevCoins = Number(hudKey.split('|')[4] ?? 0);
  hudKey = key;
  hpEl.innerHTML = Array.from({ length: p.maxHp }, (_, i) => `<span class="${i < p.hp ? '' : 'off'}"></span>`).join('');
  scoreEl.textContent = String(world.score);
  waveEl.textContent = `Oleada ${Math.max(1, world.wave)}`;
  coinsEl.textContent = `🪙 ${world.coins}`;
  if (world.coins > prevCoins) { coinsEl.classList.add('pulse'); setTimeout(() => coinsEl.classList.remove('pulse'), 150); }
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
  turretBtn.hidden = p.turrets <= 0;
  turretCount.textContent = String(p.turrets);
  setGun(p.weapon);
}
function pickWeapon(id: WeaponId) { selectWeapon(world, id); hud(); }
function placeTurret() { if (deployTurret(world)) { sfx.pickup(); hud(); } }
turretBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); placeTurret(); });

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
function card(item: ShopItem) {
  const reason = cannotBuy(world, item.id);
  const n = owns(world, item.id);
  const lvl = item.max ? `<div class="lvl">${item.id === 'torreta' ? `Tienes ${n}/${item.max}` : `Nivel ${n}/${item.max}`}</div>` : '';
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="t">${ICON[item.id]} ${item.name}</div><div class="d">${item.desc}</div>${lvl}`;
  const b = document.createElement('button');
  b.textContent = reason && reason !== 'Faltan monedas' ? reason : `🪙 ${item.price}`;
  b.disabled = !!reason;
  b.addEventListener('click', () => { if (buy(world, item.id)) { sfx.pickup(); renderShop(); hud(); } });
  el.appendChild(b);
  return el;
}
function renderShop() {
  $('shopCoins').textContent = String(world.coins);
  const ws = $('shopWeapons'), ts = $('shopTools');
  ws.innerHTML = ''; ts.innerHTML = '';
  for (const item of SHOP) (item.kind === 'arma' ? ws : ts).appendChild(card(item));
}
function openShop(bonus: number) {
  releaseStick('L'); releaseStick('R'); mouse.down = false;
  $('shopTitle').textContent = `¡Oleada ${world.wave} superada!`;
  $('shopSub').textContent = `+${bonus} monedas de bonificación`;
  renderShop();
  setTimeout(() => (shopEl.hidden = false), 600);
}
$('nextWave').addEventListener('click', () => { shopEl.hidden = true; nextWave(world); flushEvents(); });

// ---------- Partida ----------
let playing = false, shake = 0;
function clearScene() {
  for (const map of Object.values(meshes)) sync(map, [], () => new THREE.Object3D(), () => {});
  for (const f of fx) scene.remove(f.o);
  fx.length = 0;
}
function start() {
  unlock();
  clearScene();
  world = newWorld();
  hudKey = '';
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
  setTimeout(() => (overlay.hidden = false), 900);
}
overlayMsg.textContent = best ? `Récord: ${best}` : 'Sobrevive a las oleadas. Gana monedas y compra armas entre una y otra.';
playBtn.addEventListener('click', start);
document.addEventListener('visibilitychange', () => { last = performance.now(); });

function flushEvents() {
  for (const ev of world.events) {
    switch (ev.kind) {
      case 'shoot': sfx.shoot(); break;
      case 'enemyShoot': sfx.enemyShoot(); break;
      case 'hit': sfx.hit(); burst(ev.x, ev.z, 0xffffff, 3, 4); break;
      case 'kill': sfx.kill(); burst(ev.x, ev.z, ENEMY_COLOR[ev.type], ev.type === 'tank' ? 26 : 14); burst(ev.x, ev.z, 0xffc83d, 4, 3); shake = Math.max(shake, 0.25); break;
      case 'hurt': sfx.hurt(); shake = 0.6; burst(world.player.x, world.player.z, 0xff4d4d, 10, 6); break;
      case 'pickup': sfx.pickup(); banner(ev.type === 'health' ? '+1 VIDA' : ev.type === 'coins' ? '+15 🪙' : '¡DISPARO RÁPIDO!'); break;
      case 'wave': sfx.wave(); banner(`OLEADA ${ev.wave}`); break;
      case 'explosion': sfx.kill(); explosionFx(ev.x, ev.z, ev.r); shake = Math.max(shake, 0.5); break;
      case 'crate': sfx.hit(); burst(ev.x, ev.z, 0xa7783f, 16, 6); break;
      case 'turret': banner('TORRETA'); break;
      case 'waveCleared': sfx.wave(); banner('¡OLEADA SUPERADA!'); openShop(ev.bonus); break;
      case 'gameover': sfx.gameover(); burst(world.player.x, world.player.z, 0x4f6b3a, 30, 8); gameOver(); break;
    }
  }
  world.events.length = 0;
}

// ---------- Bucle ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Calidad adaptativa: si el dispositivo no llega a ~40 FPS, quitar sombras y bajar resolución.
let perfFrames = 0, perfTime = 0, perfDone = false, lowQuality = false;
function adaptQuality(dt: number) {
  if (perfDone) return;
  perfFrames++; perfTime += dt;
  if (perfFrames < 150 && perfTime < 2.5) return;
  perfDone = true;
  if (perfFrames / perfTime >= 40) return;
  lowQuality = true;
  renderer.shadowMap.enabled = false;
  sun.castShadow = false;
  renderer.setPixelRatio(1);
  scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  resize();
}

const camGoal = new THREE.Vector3(), jitter = new THREE.Vector3();
let last = performance.now();
const GRENADE_LIFE = WEAPONS.granadas.life;
function frame(now: number) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  if (playing && !document.hidden && rawDt < 1) adaptQuality(rawDt);
  if (playing && !document.hidden && world.phase === 'fight') {
    step(world, readInput(), dt);
    flushEvents();
  }
  hud();

  const p = world.player;
  player.position.set(p.x, 0, p.z);
  player.rotation.y = p.angle;
  player.visible = !world.over && (p.invuln <= 0 || Math.floor(now / 80) % 2 === 0);

  sync(meshes.obstacles, world.obstacles, makeObstacle, (m, o) => {
    if (o.kind === 'crate') m.scale.setScalar(0.85 + 0.15 * (o.hp / 4));
  });
  sync(meshes.enemies, world.enemies, makeEnemy, (m, e) => {
    m.position.set(e.x, 0, e.z);
    if (e.type === 'chaser') m.rotation.y += dt * 6;
    else m.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
    (m.userData.mat as THREE.MeshStandardMaterial).emissive.setHex(e.flash > 0 ? 0xffffff : ENEMY_COLOR[e.type]);
    (m.userData.mat as THREE.MeshStandardMaterial).emissiveIntensity = e.flash > 0 ? 0.9 : 0.15;
  });
  sync(meshes.bullets, world.bullets, makeBullet, (m, b) => {
    const y = b.blast ? 0.7 + Math.sin(Math.PI * (1 - b.life / GRENADE_LIFE)) * 2.2 : 0.95;
    m.position.set(b.x, y, b.z);
  });
  sync(meshes.pickups, world.pickups, makePickup, (m, k) => {
    m.position.set(k.x, 0.8 + Math.sin(now / 200 + k.id) * 0.2, k.z);
    if (k.type === 'coins') m.rotation.set(Math.PI / 2, 0, now / 300); else m.rotation.y = now / 400;
    m.visible = k.life > 2.5 || Math.floor(now / 120) % 2 === 0;
  });
  sync(meshes.turrets, world.turrets, makeTurret, (m, t) => {
    m.position.set(t.x, 0, t.z);
    m.getObjectByName('head')!.rotation.y = t.angle;
    m.visible = t.life > 4 || Math.floor(now / 150) % 2 === 0;
  });

  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) { scene.remove(f.o); if (f.kind !== 'spark') ((f.o as THREE.Mesh).material as THREE.Material).dispose(); fx.splice(i, 1); continue; }
    const k = f.life / f.max;
    if (f.kind === 'spark') {
      f.vy -= 18 * dt;
      f.o.position.x += f.vx * dt; f.o.position.y = Math.max(0.05, f.o.position.y + f.vy * dt); f.o.position.z += f.vz * dt;
      f.o.scale.setScalar(k);
    } else if (f.kind === 'flash') {
      f.o.scale.setScalar(f.size * (1.15 - k * 0.6));
      ((f.o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * k;
    } else ((f.o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, k * 3);
  }

  // Cámara y sol siguen al jugador
  const portrait = camera.aspect < 1;
  const h = portrait ? 30 : 22, back = portrait ? 13 : 14;
  camGoal.set(p.x, h, p.z + back);
  camera.position.lerp(camGoal, 1 - Math.exp(-dt * 6));
  shake = Math.max(0, shake - dt * 2);
  jitter.set((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake);
  camera.position.add(jitter);
  camera.lookAt(camera.position.x, 0, camera.position.z - back);
  sun.target.position.set(camera.position.x, 0, camera.position.z - back);
  sun.position.copy(sun.target.position).add(SUN_OFFSET);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
setGun('pistola');
requestAnimationFrame(frame);

// Para pruebas automatizadas
Object.assign(window, { __world: () => world, __hud: hud, __waveBonus: waveBonus, __lowQuality: () => lowQuality });
