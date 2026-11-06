import * as THREE from 'three';
import { newWorld, step, type World, type Input, type Enemy, type Bullet, type Pickup, type EnemyType } from './sim.ts';
import { sfx, unlock, isMuted, setMuted } from './audio.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const hpEl = $('hp'), waveEl = $('wave'), scoreEl = $('score'), bannerEl = $('banner'), rapidEl = $('rapid');
const overlay = $('overlay'), overlayMsg = $('overlayMsg'), playBtn = $<HTMLButtonElement>('play'), muteBtn = $('mute');
const isTouch = matchMedia('(pointer: coarse)').matches;
$('help').textContent = isTouch
  ? 'Pulgar izquierdo: moverte · Pulgar derecho: apuntar y disparar'
  : 'WASD / flechas: moverte · Ratón: apuntar · Clic (mantener): disparar';

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d1a);
scene.fog = new THREE.Fog(0x0b0d1a, 30, 70);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0x8899ff, 0x111122, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(8, 20, 10);
scene.add(sun);

let world: World = newWorld();
const A = world.arena;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, A * 2), new THREE.MeshStandardMaterial({ color: 0x14183a, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(A * 2, 20, 0x2e3a8c, 0x1f2560);
grid.position.y = 0.01;
scene.add(grid);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x39f3ff, emissive: 0x39f3ff, emissiveIntensity: 0.8 });
for (const [x, z, w, d] of [[0, -A, A * 2 + 0.4, 0.4], [0, A, A * 2 + 0.4, 0.4], [-A, 0, 0.4, A * 2], [A, 0, 0.4, A * 2]]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), wallMat);
  wall.position.set(x, 0.3, z);
  scene.add(wall);
}

// Jugador
const player = new THREE.Group();
const playerMat = new THREE.MeshStandardMaterial({ color: 0x39f3ff, emissive: 0x0a6a80, roughness: 0.4 });
const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.9, 20), playerMat);
body.position.y = 0.45;
const gun = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.9), new THREE.MeshStandardMaterial({ color: 0xeef0ff }));
gun.position.set(0, 0.6, 0.6);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: 0xeef0ff, emissive: 0x39f3ff, emissiveIntensity: 0.4 }));
head.position.y = 1.05;
player.add(body, gun, head);
scene.add(player);

// Geometrías compartidas
const geo = {
  chaser: new THREE.OctahedronGeometry(0.65),
  tank: new THREE.BoxGeometry(1.7, 1.2, 1.7),
  gunner: new THREE.CylinderGeometry(0.6, 0.7, 1.1, 6),
  bullet: new THREE.SphereGeometry(0.18, 10, 8),
  health: new THREE.BoxGeometry(0.8, 0.8, 0.8),
  rapid: new THREE.OctahedronGeometry(0.5),
  spark: new THREE.BoxGeometry(0.18, 0.18, 0.18),
};
const ENEMY_COLOR: Record<EnemyType, number> = { chaser: 0xff4d6d, tank: 0xa66bff, gunner: 0xff9f1c };
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xbffcff });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff9f1c });

const enemyMeshes = new Map<number, THREE.Mesh>();
const bulletMeshes = new Map<number, THREE.Mesh>();
const pickupMeshes = new Map<number, THREE.Mesh>();

function makeEnemy(e: Enemy) {
  const c = ENEMY_COLOR[e.type];
  const m = new THREE.Mesh(geo[e.type], new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.5 }));
  m.position.y = e.type === 'tank' ? 0.6 : 0.7;
  return m;
}
const makeBullet = (b: Bullet) => new THREE.Mesh(geo.bullet, b.enemy ? enemyBulletMat : bulletMat);
function makePickup(k: Pickup) {
  const c = k.type === 'health' ? 0x4dff88 : 0xffd84d;
  return new THREE.Mesh(geo[k.type], new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }));
}

function sync<T extends { id: number }>(map: Map<number, THREE.Mesh>, list: T[], make: (t: T) => THREE.Mesh, place: (m: THREE.Mesh, t: T) => void) {
  const alive = new Set<number>();
  for (const t of list) {
    alive.add(t.id);
    let m = map.get(t.id);
    if (!m) { m = make(t); map.set(t.id, m); scene.add(m); }
    place(m, t);
  }
  for (const [id, m] of map) if (!alive.has(id)) {
    scene.remove(m);
    if (m.material !== bulletMat && m.material !== enemyBulletMat) (m.material as THREE.Material).dispose();
    map.delete(id);
  }
}

// Partículas
interface Spark { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number }
const sparks: Spark[] = [];
const sparkMats = new Map<number, THREE.MeshBasicMaterial>();
function burst(x: number, z: number, color: number, count: number, power = 8) {
  let mat = sparkMats.get(color);
  if (!mat) sparkMats.set(color, (mat = new THREE.MeshBasicMaterial({ color })));
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo.spark, mat);
    m.position.set(x, 0.7, z);
    const a = Math.random() * Math.PI * 2, s = power * (0.3 + Math.random());
    const life = 0.35 + Math.random() * 0.35;
    sparks.push({ m, vx: Math.cos(a) * s, vy: 2 + Math.random() * 5, vz: Math.sin(a) * s, life, max: life });
    scene.add(m);
  }
}

// ---------- Entrada ----------
const keys = new Set<string>();
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
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
    if (s && s.id === e.pointerId) {
      s.el.classList.remove('on');
      (s.el.firstElementChild as HTMLElement).style.transform = '';
      sticks[side] = null;
    }
  }
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
    if (ray.ray.intersectPlane(groundPlane, hitPt)) {
      inp.aimX = hitPt.x - world.player.x; inp.aimZ = hitPt.z - world.player.z;
    }
    inp.fire = mouse.down || keys.has('Space');
  } else inp.fire = keys.has('Space');
  return inp;
}

// ---------- HUD ----------
let best = 0;
try { best = Number(localStorage.getItem('shooter.best')) || 0; } catch { /* sin storage */ }
let lastHp = -1, lastScore = -1, lastWave = -1;
function hud() {
  const p = world.player;
  if (p.hp !== lastHp) {
    lastHp = p.hp;
    hpEl.innerHTML = Array.from({ length: p.maxHp }, (_, i) => `<span class="${i < p.hp ? '' : 'off'}"></span>`).join('');
  }
  if (world.score !== lastScore) scoreEl.textContent = String((lastScore = world.score));
  if (world.wave !== lastWave) waveEl.textContent = `Oleada ${(lastWave = Math.max(1, world.wave))}`;
  rapidEl.hidden = p.rapid <= 0;
}
let bannerTimer = 0;
function banner(text: string) {
  bannerEl.textContent = text;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), 1400);
}
muteBtn.textContent = isMuted() ? '🔇' : '🔊';
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); muteBtn.textContent = isMuted() ? '🔇' : '🔊'; });

// ---------- Estado de partida ----------
let playing = false, shake = 0;
function start() {
  unlock();
  for (const map of [enemyMeshes, bulletMeshes, pickupMeshes]) sync(map, [], () => new THREE.Mesh(), () => {});
  world = newWorld();
  lastHp = lastScore = lastWave = -1;
  overlay.hidden = true;
  playing = true;
  last = performance.now();
}
function gameOver() {
  playing = false;
  const record = world.score > best;
  if (record) { best = world.score; try { localStorage.setItem('shooter.best', String(best)); } catch { /* sin storage */ } }
  overlayMsg.textContent = `${record ? '¡Nuevo récord! ' : ''}Puntos: ${world.score} · Oleada ${world.wave} · Récord: ${best}`;
  playBtn.textContent = 'Otra vez';
  setTimeout(() => (overlay.hidden = false), 700);
}
overlayMsg.textContent = best ? `Récord: ${best}` : 'Sobrevive a las oleadas todo lo que puedas.';
playBtn.addEventListener('click', start);
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// ---------- Bucle ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const camTarget = new THREE.Vector3();
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing && !document.hidden) {
    step(world, readInput(), dt);
    for (const ev of world.events) {
      switch (ev.kind) {
        case 'shoot': sfx.shoot(); break;
        case 'enemyShoot': sfx.enemyShoot(); break;
        case 'hit': sfx.hit(); burst(ev.x, ev.z, 0xffffff, 3, 4); break;
        case 'kill': sfx.kill(); burst(ev.x, ev.z, ENEMY_COLOR[ev.type], ev.type === 'tank' ? 26 : 14); shake = Math.max(shake, 0.25); break;
        case 'hurt': sfx.hurt(); shake = 0.6; burst(world.player.x, world.player.z, 0x39f3ff, 12, 6); break;
        case 'pickup': sfx.pickup(); banner(ev.type === 'health' ? '+1 VIDA' : '¡DISPARO RÁPIDO!'); break;
        case 'wave': sfx.wave(); banner(`OLEADA ${ev.wave}`); break;
        case 'gameover': sfx.gameover(); burst(world.player.x, world.player.z, 0x39f3ff, 40, 10); gameOver(); break;
      }
    }
    hud();
  }

  const p = world.player;
  player.position.set(p.x, 0, p.z);
  player.rotation.y = p.angle;
  player.visible = !world.over && (p.invuln <= 0 || Math.floor(now / 80) % 2 === 0);

  sync(enemyMeshes, world.enemies, makeEnemy, (m, e) => {
    m.position.x = e.x; m.position.z = e.z;
    m.rotation.y += dt * (e.type === 'chaser' ? 6 : 1.5);
    if (e.type === 'gunner') m.rotation.y = Math.atan2(p.x - e.x, p.z - e.z);
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.emissive.setHex(e.flash > 0 ? 0xffffff : ENEMY_COLOR[e.type]);
    if (e.type === 'tank') m.scale.setScalar(0.75 + 0.25 * (e.hp / e.maxHp));
  });
  sync(bulletMeshes, world.bullets, makeBullet, (m, b) => m.position.set(b.x, 0.7, b.z));
  sync(pickupMeshes, world.pickups, makePickup, (m, k) => {
    m.position.set(k.x, 0.8 + Math.sin(now / 200 + k.id) * 0.2, k.z);
    m.rotation.y = now / 400;
    m.visible = k.life > 2.5 || Math.floor(now / 120) % 2 === 0; // parpadea antes de desaparecer
  });

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    if (s.life <= 0) { scene.remove(s.m); sparks.splice(i, 1); continue; }
    s.vy -= 18 * dt;
    s.m.position.x += s.vx * dt; s.m.position.y = Math.max(0.05, s.m.position.y + s.vy * dt); s.m.position.z += s.vz * dt;
    s.m.scale.setScalar(s.life / s.max);
  }

  // Cámara que sigue al jugador (más alta en vertical para ver más arena)
  const portrait = camera.aspect < 1;
  camTarget.set(p.x * 0.8, 0, p.z * 0.8);
  const h = portrait ? 34 : 24, back = portrait ? 14 : 15;
  camera.position.lerp(new THREE.Vector3(camTarget.x, h, camTarget.z + back), 1 - Math.exp(-dt * 6));
  shake = Math.max(0, shake - dt * 2);
  if (shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, 0, (Math.random() - 0.5) * shake));
  camera.lookAt(camera.position.x, 0, camera.position.z - back);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Para pruebas automatizadas
Object.assign(window, { __world: () => world });
