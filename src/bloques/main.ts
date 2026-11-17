// Bloques: oleadas de robots en primera persona, con mundo de bloques.
// Usa la misma simulación (src/shooter/sim.ts) y el mismo servidor que Shooter 2027, con sus reglas de Bloques
// (puños, palo y martillo; monedas por el mapa) y su propia lista de servidores.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  newWorld, step, buy, cannotBuy, owns, nextWave, selectWeapon, getPlayer, shopFor, CHARACTERS, isCharacter, MAP_COIN_VALUE,
  WEAPONS, WEAPON_ORDER, type World, type Input, type Player, type EnemyType, type WeaponId, type ShopItem, type ShopKind, type CharacterId,
} from '../shooter/sim.ts';
import type { RoomInfo } from '../shooter/protocol.ts';
import { sfx, unlock, isMuted, setMuted } from '../shooter/audio.ts';
import { NetSession } from '../shooter/net.ts';
import { normalizeForFilter } from '../shooter/moderation.ts';
import { Effects } from '../shooter/fx.ts';
import { makeLabel } from '../shooter/models.ts';
import { settings, type Quality } from '../shooter/settings.ts';
import { icon, ITEM_ICON, hydrateIcons } from '../ui/icons.ts';
import { blockMat, setAnisotropy } from './textures.ts';
import { makePerson, animatePerson, showHeld, heldModel, makeBot, animateBot, makeObstacle, makeCoin, makeHealth, makeRapid, makeBullet, BOT_TOP, type Person, type Bot } from './models.ts';
import { fpInput, applyLook } from './controls.ts';
import { buildTerrain } from './terrain.ts';
import '../ui/pwa.ts';

const GAME = 'bloques' as const;
/** Versión publicada como Artifact de claude.ai: un jugador, sin servidor ni enlaces a otras páginas. */
const ARTEFACTO = import.meta.env.VITE_ARTEFACTO === '1';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (isTouch) document.body.classList.add('touch');
if (ARTEFACTO) {
  document.body.classList.add('artefacto');
  for (const el of document.querySelectorAll<HTMLElement>('#multiBtn, a[href="./creditos.html"], a[href="./juegos.html"], #settings .links')) { el.hidden = true; el.style.display = 'none'; }
  const credits = document.createElement('p');
  credits.className = 'help';
  credits.textContent = 'Versión de un jugador. Hecho con Three.js (MIT), iconos Lucide (ISC) y fuentes Oswald e Inter (SIL OFL 1.1).';
  $('help').after(credits);
  document.querySelector('.tagline')!.textContent = 'Recoge monedas, compra armas y aguanta las oleadas de robots.';
}
hydrateIcons();
$('help').textContent = isTouch
  ? 'Pulgar izquierdo: moverte · Arrastra a la derecha: mirar · Botón dorado: atacar.'
  : 'WASD: moverte · Ratón: mirar · Clic: atacar · 1-9 o rueda: cambiar de arma · Esc: pausa.';

/** Personajes de Bloques (los dos de la portada). */
const BLOQUES_CHARS: CharacterId[] = ['coloso', 'halcon'];
const BLOQUES_NAME: Partial<Record<CharacterId, string>> = { coloso: 'Grande', halcon: 'Rápido' };

const readStr = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const writeStr = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const readNum = (k: string) => Number(readStr(k)) || 0;

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const maxDpr = isTouch ? 1.6 : 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xbfdcf0);
scene.background = HORIZON;
scene.fog = new THREE.Fog(HORIZON, 30, 95);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Cielo: degradado, sol y halo
const SUN_DIR = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x2f7fd6) }, bottom: { value: HORIZON }, sun: { value: SUN_DIR } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vDir;
    void main(){ float h = clamp(vDir.y * 1.4, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.6));
    float s = max(dot(vDir, sun), 0.0); c += vec3(1.0, 0.9, 0.7) * (smoothstep(0.9985, 0.9992, s) * 2.5 + pow(s, 12.0) * 0.35);
    gl_FragColor = vec4(c, 1.0); }`,
}));
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xd8ecff, 0x55603a, 1.0);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);

// Postproceso (estilo "shaders"): resplandor en luces y metales, y un toque de color cinematográfico con viñeta
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.88);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.04);                      // un poco más de color
      c.rgb = (c.rgb - 0.5) * 1.05 + 0.5;                     // un poco más de contraste
      c.rgb *= vec3(1.03, 1.0, 0.96);                          // tono cálido
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
      gl_FragColor = c; }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

// ---------- Escenario fijo: suelo, borde del campo, colinas y nubes ----------
const ARENA = 30;
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), blockMat('grass', { repeat: 220 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // Borde del campo: muro bajo de piedra (los robots y tú no pasáis de aquí)
  const wallGeo = new THREE.BoxGeometry(1, 1, 1), cobble = blockMat('cobble'), stone = blockMat('stone');
  const ring: THREE.Matrix4[] = [];
  for (let i = -ARENA - 1; i <= ARENA; i++) for (const [x, z] of [[i + 0.5, -ARENA - 0.5], [i + 0.5, ARENA + 0.5], [-ARENA - 0.5, i + 0.5], [ARENA + 0.5, i + 0.5]]) {
    ring.push(new THREE.Matrix4().makeTranslation(x, 0.5, z));
    if ((i & 3) === 0) ring.push(new THREE.Matrix4().makeTranslation(x, 1.5, z));
  }
  const wall = new THREE.InstancedMesh(wallGeo, cobble, ring.length);
  ring.forEach((m, i) => wall.setMatrixAt(i, m));
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);
  // Colinas de bloques fuera del campo: una malla con solo las caras visibles
  const t = buildTerrain(72, ARENA);
  for (const [f, mat] of [[t.grass, blockMat('grass')], [t.side, blockMat('grassSide')], [t.dirt, blockMat('dirt')]] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(f.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2));
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
  }
  void stone;
}
const clouds = new THREE.Group();
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xf6f9fc, transparent: true, opacity: 0.6, fog: false });
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(18 + (i % 4) * 8, 4, 12 + (i % 3) * 6), mat);
    c.position.set((i * 37) % 220 - 110, 120 + (i % 3) * 8, (i * 53) % 220 - 110);
    c.castShadow = false;
    clouds.add(c);
  }
  scene.add(clouds);
}

// ---------- Mano en primera persona ----------
const view = new THREE.Group();
camera.add(view);
const viewArm = new THREE.Group();
viewArm.scale.setScalar(0.62);
view.add(viewArm);
let viewHeld: WeaponId | null = null, viewChar: CharacterId | null = null, viewSwing = 0, viewRecoil = 0, bobT = 0;
function setViewModel(id: WeaponId, character: CharacterId) {
  if (viewHeld === id && viewChar === character) return;
  viewHeld = id; viewChar = character;
  viewArm.clear();
  const person = makePerson(character);
  const skin = (person.armR.children[0] as THREE.Mesh).material as THREE.Material;
  // Antebrazo que entra desde abajo a la derecha hacia el centro de la pantalla
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.4), skin);
  arm.position.set(0, 0, 0.16);
  viewArm.add(arm);
  if (id === 'puno') {
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.12), skin);
    fist.position.set(0, 0.01, -0.13);
    viewArm.add(fist);
  } else {
    const item = heldModel(id);
    item.rotation.y = Math.PI; // la cámara mira hacia -z
    item.scale.setScalar(0.55);
    item.position.set(0, 0.02, -0.06);
    if (id === 'palo' || id === 'martillo') { item.rotation.x = -0.5; item.position.set(0, 0.03, -0.08); }
    viewArm.add(item);
  }
  view.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}

// ---------- Estado ----------
let world: World = newWorld(Math.random, true, [{ id: 'p1', name: 'Tú', character: savedChar() }], GAME);
let mode: 'solo' | 'multi' = 'solo';
let myId = 'p1';
const net = new NetSession();
const me = (): Player => getPlayer(world, myId);
const names = new Map<string, string>();
const blocked = new Set<string>((() => { try { return JSON.parse(readStr('shooter.bloqueados') || '[]') as string[]; } catch { return []; } })());
const isBlocked = (name: string) => blocked.has(normalizeForFilter(name));
const shownName = (q: Player) => (isBlocked(q.name) ? 'Jugador bloqueado' : q.name);
const fx = new Effects(scene);
let yaw = Math.PI, pitch = 0;
let playing = false, paused = false, shake = 0;
let best = readNum('bloques.best'), bestWave = readNum('bloques.bestWave');
const run = { kills: 0, coins: 0 };

// ---------- Entrada ----------
const keys = new Set<string>();
const mouse = { down: false };
let sens = Number(readStr('bloques.sensibilidad')) || 1;
interface Stick { id: number; ox: number; oy: number; dx: number; dy: number }
let moveStick: Stick | null = null, lookId: number | null = null, lookX = 0, lookY = 0, fireTouch: number | null = null;
const stickEl = $('stickL'), fireBtn = $('fireBtn');
const STICK_R = 50;
const locked = () => document.pointerLockElement === canvas;

addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (shopEl.hidden) setPaused(!paused); return; }
  if (paused || !shopEl.hidden) return;
  keys.add(e.code);
  const n = Number(e.key);
  if (n >= 1 && n <= 9) { const own = WEAPON_ORDER.filter((w) => me().owned.includes(w)); if (own[n - 1]) pickWeapon(own[n - 1]); }
  if (e.code === 'KeyQ') cycleWeapon(-1);
  if (e.code === 'KeyE') cycleWeapon(1);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = false; });
addEventListener('wheel', (e) => { if (playing && !paused && shopEl.hidden) cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (!playing || paused || !shopEl.hidden) return;
  if (e.pointerType === 'mouse') {
    if (!locked()) { lockPointer(); lockTried = true; }
    if (e.button === 0) mouse.down = true;
    return;
  }
  if (e.clientX < innerWidth * 0.45 && !moveStick) {
    moveStick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`; stickEl.style.top = `${e.clientY}px`;
    stickEl.classList.add('on');
  } else if (lookId === null) { lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; }
  try { canvas.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!playing || paused) return;
  if (e.pointerType === 'mouse') {
    // Con el ratón capturado se mira moviéndolo; si el navegador no deja capturarlo, arrastrando con el botón pulsado.
    if (locked() || mouse.down) [yaw, pitch] = applyLook(yaw, pitch, e.movementX, e.movementY, 0.0024 * sens);
    return;
  }
  if (moveStick && e.pointerId === moveStick.id) {
    let dx = e.clientX - moveStick.ox, dy = e.clientY - moveStick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    moveStick.dx = dx / STICK_R; moveStick.dy = dy / STICK_R;
    (stickEl.firstElementChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === lookId) {
    [yaw, pitch] = applyLook(yaw, pitch, e.clientX - lookX, e.clientY - lookY, 0.006 * sens);
    lookX = e.clientX; lookY = e.clientY;
  }
});
function releaseTouches() {
  moveStick = null; lookId = null; fireTouch = null;
  stickEl.classList.remove('on'); (stickEl.firstElementChild as HTMLElement).style.transform = '';
  fireBtn.classList.remove('on');
  mouse.down = false;
}
function endPointer(e: PointerEvent) {
  if (e.pointerType === 'mouse') { mouse.down = false; return; }
  if (moveStick?.id === e.pointerId) { moveStick = null; stickEl.classList.remove('on'); (stickEl.firstElementChild as HTMLElement).style.transform = ''; }
  if (lookId === e.pointerId) lookId = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); fireTouch = e.pointerId; fireBtn.classList.add('on'); try { fireBtn.setPointerCapture(e.pointerId); } catch { /* */ } });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
  fireBtn.addEventListener(ev, (e) => { if ((e as PointerEvent).pointerId === fireTouch) { fireTouch = null; fireBtn.classList.remove('on'); } });
fireBtn.addEventListener('contextmenu', (e) => e.preventDefault());

let lockTried = false;
/** Captura el ratón. Algunos navegadores o marcos lo niegan: entonces se mira arrastrando con el botón pulsado. */
function lockPointer() {
  try { const r = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined; r?.catch?.(() => { /* sin captura: se mira arrastrando */ }); } catch { /* sin captura */ }
}
document.addEventListener('pointerlockchange', () => {
  // Al soltar el ratón (Esc) en plena partida, se abre la pausa.
  if (!locked() && playing && !paused && world.phase === 'fight' && !world.over && shopEl.hidden && gameoverEl.hidden) setPaused(true);
});

// Mandos
let padPrev: boolean[] = [];
function padState(): Gamepad | null { return [...(navigator.getGamepads?.() ?? [])].find((g): g is Gamepad => !!g && g.connected) ?? null; }
const DZ = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);

function readInput(dt: number): Input {
  let sx = 0, sy = 0;
  if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) sy += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) sy -= 1;
  if (moveStick) { sx = moveStick.dx; sy = moveStick.dy; }
  let fire = mouse.down || fireTouch !== null || keys.has('Space');
  const g = padState();
  if (g) {
    const lx = DZ(g.axes[0] ?? 0), ly = DZ(g.axes[1] ?? 0);
    if (lx || ly) { sx = lx; sy = ly; }
    const rx = DZ(g.axes[2] ?? 0), ry = DZ(g.axes[3] ?? 0);
    if (rx || ry) [yaw, pitch] = applyLook(yaw, pitch, rx * 900 * dt, ry * 600 * dt, 0.0035 * sens);
    if ((g.buttons[7]?.value ?? 0) > 0.3) fire = true;
  }
  return fpInput(yaw, sx, sy, fire);
}
function pollPad() {
  const g = padState();
  if (!g) return;
  const hit = (i: number) => !!g.buttons[i]?.pressed && !padPrev[i];
  if (playing && hit(9) && shopEl.hidden) setPaused(!paused);
  else if (playing && paused && (hit(0) || hit(1))) setPaused(false);
  else if (playing && !paused) { if (hit(4)) cycleWeapon(-1); if (hit(5)) cycleWeapon(1); }
  else if (!playing && !overlay.hidden && hit(0)) playBtn.click();
  padPrev = g.buttons.map((b) => b.pressed);
}

// ---------- HUD ----------
const hpEl = $('hp'), hpFill = $('hpFill'), hpVal = $('hpVal'), waveN = $('waveN'), enemiesN = $('enemiesN'), coinsEl = $('coins'), coinsN = $('coinsN'),
  scoreN = $('scoreN'), bannerEl = $('banner'), rapidEl = $('rapid'), toastEl = $('toast'), weaponNameEl = $('weaponName'), weaponsEl = $('weapons');
const overlay = $('overlay'), playBtn = $<HTMLButtonElement>('play'), muteBtn = $('mute'), gameoverEl = $('gameover'), shopEl = $('shop');
const bossBarEl = $('bossBar'), bossFill = $('bossFill'), lockHint = $('lockHint'), crosshair = $('crosshair'), hurtFlash = $('hurtFlash');
const roomChip = $('roomChip'), playersHud = $('playersHud');
let hudKey = '', prevCoins = 0;
function hud() {
  const p = me();
  if (!p) return;
  rapidEl.hidden = p.rapid <= 0;
  if (mode === 'multi') renderPlayers();
  const left = world.toSpawn + world.enemies.length;
  const key = [p.hp, p.maxHp, world.score, world.wave, left, p.coins, p.weapon, p.owned.join(), p.alive].join('|');
  if (key === hudKey) return;
  hudKey = key;
  hpEl.style.setProperty('--n', String(p.maxHp));
  hpFill.style.transform = `scaleX(${Math.max(0, p.hp) / p.maxHp})`;
  hpVal.textContent = `${Math.max(0, p.hp)}/${p.maxHp}`;
  hpEl.classList.toggle('low', p.hp > 0 && p.hp <= 2);
  hpEl.setAttribute('aria-valuenow', String(p.hp)); hpEl.setAttribute('aria-valuemax', String(p.maxHp));
  scoreN.textContent = world.score.toLocaleString('es-ES');
  waveN.textContent = String(Math.max(1, world.wave));
  enemiesN.textContent = String(left);
  weaponNameEl.textContent = WEAPONS[p.weapon].name;
  coinsN.textContent = String(p.coins);
  if (!shopEl.hidden && mode === 'multi') renderShop();
  if (p.coins > prevCoins) { coinsEl.classList.add('pulse'); setTimeout(() => coinsEl.classList.remove('pulse'), 150); }
  prevCoins = p.coins;
  weaponsEl.innerHTML = '';
  const own = WEAPON_ORDER.filter((id) => p.owned.includes(id));
  own.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = `wbtn${p.weapon === id ? ' on' : ''}`;
    b.innerHTML = `${isTouch ? '' : `<small>${i + 1}</small>`}${icon(ITEM_ICON[id])}`;
    b.title = WEAPONS[id].name;
    b.setAttribute('aria-label', WEAPONS[id].name);
    b.setAttribute('aria-pressed', String(p.weapon === id));
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); pickWeapon(id); });
    weaponsEl.appendChild(b);
  });
  weaponsEl.hidden = own.length < 2;
}
function pickWeapon(id: WeaponId) {
  selectWeapon(world, id, myId);
  if (mode === 'multi') net.send({ t: 'weapon', id });
  hud();
}
function cycleWeapon(dir: 1 | -1) {
  const p = me(), own = WEAPON_ORDER.filter((w) => p.owned.includes(w));
  if (own.length < 2) return;
  pickWeapon(own[(own.indexOf(p.weapon) + own.length + dir) % own.length]);
}
let bannerTimer = 0, toastTimer = 0;
function banner(title: string, kicker = '', sub = '') {
  $('bannerTitle').textContent = title; $('bannerKicker').textContent = kicker; $('bannerSub').textContent = sub;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), 1800);
}
function toast(text: string) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1300);
}
function renderMute() {
  muteBtn.innerHTML = icon(isMuted() ? 'volumeOff' : 'volumeOn');
  muteBtn.setAttribute('aria-label', isMuted() ? 'Activar sonido' : 'Silenciar');
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
}
renderMute();
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); renderMute(); renderSettings(); });

// ---------- Tienda ----------
const SECTIONS: { kind: ShopKind; title: string }[] = [{ kind: 'arma', title: 'Armas' }, { kind: 'mejora', title: 'Mejoras' }];
function card(item: ShopItem) {
  const reason = cannotBuy(world, item.id, myId), n = owns(world, item.id, myId);
  const lvl = item.max ? `<div class="lvl">Nivel ${n}/${item.max}</div>` : '';
  const el = document.createElement('div');
  el.className = `card${n ? ' owned' : ''}`;
  el.innerHTML = `<div class="art">${icon(ITEM_ICON[item.id])}</div><div class="info"><div class="t"></div><div class="d"></div>${lvl}</div>`;
  el.querySelector('.t')!.textContent = item.name;
  el.querySelector('.d')!.textContent = item.desc;
  const b = document.createElement('button');
  if (reason && reason !== 'Faltan monedas') b.textContent = reason;
  else { b.innerHTML = `${icon('coins')}<span>${item.price}</span>`; b.setAttribute('aria-label', `Comprar ${item.name} por ${item.price} monedas`); }
  b.disabled = !!reason;
  b.addEventListener('click', () => {
    if (mode === 'multi') { net.send({ t: 'buy', id: item.id }); sfx.pickup(); b.disabled = true; return; }
    if (buy(world, item.id, myId)) { sfx.pickup(); renderShop(); hud(); }
  });
  el.appendChild(b);
  return el;
}
function renderShop() {
  $('shopCoins').textContent = String(me().coins);
  const body = $('shopBody');
  const scroll = body.scrollTop;
  body.innerHTML = '';
  for (const sec of SECTIONS) {
    const h = document.createElement('h3'); h.textContent = sec.title;
    const grid = document.createElement('div'); grid.className = 'grid';
    for (const item of shopFor(GAME)) if (item.kind === sec.kind) grid.appendChild(card(item));
    body.append(h, grid);
  }
  body.scrollTop = scroll;
}
let shopOpenedFor = -1;
function openShop(bonus: number) {
  releaseTouches(); keys.clear();
  if (locked()) document.exitPointerLock();
  $('shopTitle').textContent = `Oleada ${world.wave} superada`;
  $('shopSub').textContent = bonus ? `Vida completa · +${bonus} monedas` : 'Prepárate para la siguiente oleada';
  renderShop();
  const nb = $<HTMLButtonElement>('nextWave');
  nb.disabled = false;
  nb.innerHTML = mode === 'multi' ? `${icon('check')} Estoy listo` : `Siguiente oleada ${icon('chevronRight')}`;
  $('shopTimer').hidden = mode !== 'multi';
  setTimeout(() => { if (world.phase === 'shop') { shopEl.hidden = false; $('shopBody').scrollTop = 0; } }, 900);
}
$('nextWave').addEventListener('click', () => {
  if (mode === 'multi') {
    net.send({ t: 'ready' });
    const nb = $<HTMLButtonElement>('nextWave');
    nb.disabled = true; nb.textContent = 'Esperando a los demás';
    return;
  }
  shopEl.hidden = true; nextWave(world); flushEvents();
  if (!isTouch) lockPointer();
});

// ---------- Objetos en la escena ----------
const persons = new Map<string, Person>();
const bots = new Map<number, Bot & { bar: Bar }>();
const objs = { bullets: new Map<number, THREE.Object3D>(), pickups: new Map<number, THREE.Object3D>(), obstacles: new Map<number, THREE.Object3D>() };
interface Bar { g: THREE.Group; fg: THREE.Mesh }
const barGeo = new THREE.PlaneGeometry(1, 0.12);
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
function personFor(q: Player): Person {
  let p = persons.get(q.id);
  if (!p) { p = makePerson(q.character); p.px = q.x; p.pz = q.z; persons.set(q.id, p); scene.add(p.root); }
  const text = shownName(q);
  if (q.id !== myId && p.labelText !== text) {
    if (p.label) scene.remove(p.label);
    p.label = makeLabel(text, q.color, isBlocked(q.name)); p.labelText = text;
    p.label.scale.multiplyScalar(0.6);
    scene.add(p.label);
  }
  return p;
}
function removePerson(id: string) {
  const p = persons.get(id);
  if (!p) return;
  scene.remove(p.root); if (p.label) scene.remove(p.label);
  persons.delete(id);
}
function clearScene() {
  for (const map of Object.values(objs)) sync(map, [], () => new THREE.Object3D(), () => {});
  for (const b of bots.values()) scene.remove(b.root, b.bar.g);
  bots.clear();
  for (const id of [...persons.keys()]) removePerson(id);
  fx.clear();
}

// ---------- Partida ----------
function savedChar(): CharacterId {
  const v = readStr('bloques.personaje');
  return isCharacter(v) && BLOQUES_CHARS.includes(v) ? v : 'coloso';
}
function start() {
  unlock();
  leaveMulti();
  clearScene();
  mode = 'solo'; myId = 'p1';
  document.body.classList.remove('multi');
  world = newWorld(Math.random, true, [{ id: 'p1', name: 'Tú', character: savedChar() }], GAME);
  beginPlaying();
}
function beginPlaying() {
  $('lobby').hidden = true; overlay.hidden = true; shopEl.hidden = true; gameoverEl.hidden = true;
  hudKey = ''; prevCoins = me()?.coins ?? 0; run.kills = 0; run.coins = 0;
  yaw = Math.PI; pitch = 0;
  document.body.classList.add('playing');
  playing = true;
  setPaused(false);
  last = performance.now();
  if (!isTouch) lockPointer();
  hud();
}
function gameOver() {
  const fmt = (n: number) => n.toLocaleString('es-ES');
  if (locked()) document.exitPointerLock();
  const record = world.score > best;
  if (record) { best = world.score; writeStr('bloques.best', String(best)); }
  if (world.wave > bestWave) { bestWave = world.wave; writeStr('bloques.bestWave', String(bestWave)); }
  $('goWave').textContent = String(world.wave);
  $('goScore').textContent = fmt(world.score);
  $('goKills').textContent = fmt(mode === 'multi' ? me().kills : run.kills);
  $('goCoins').textContent = fmt(run.coins);
  if (mode === 'multi') {
    setPaused(false);
    $('goBest').textContent = [...world.players].sort((a, b) => b.score - a.score).map((q) => shownName(q))[0] ?? '';
    $('goBestLabel').textContent = 'Mejor del equipo';
    $('goRecord').hidden = true; $('retry').hidden = true; $('goAuto').hidden = false;
    setTimeout(() => { gameoverEl.hidden = false; }, 1200);
    return;
  }
  playing = false;
  $('goBestLabel').textContent = 'Récord';
  $('goBest').textContent = fmt(best);
  $('goRecord').hidden = !record || world.score === 0;
  $('retry').hidden = false; $('goAuto').hidden = true;
  setTimeout(() => { document.body.classList.remove('playing'); gameoverEl.hidden = false; $('retry').focus(); }, 1200);
}
function toTitle() {
  leaveMulti();
  mode = 'solo';
  playersHud.hidden = true;
  playing = false;
  if (locked()) document.exitPointerLock();
  document.body.classList.remove('playing');
  shopEl.hidden = true; gameoverEl.hidden = true;
  clearScene();
  renderRecords();
  overlay.hidden = false;
}
function renderRecords() {
  $('bestScore').textContent = best.toLocaleString('es-ES');
  $('bestWave').textContent = String(bestWave);
  $('records').hidden = best === 0;
}
renderRecords();
$('visits').remove(); // el contador de jugadores es de Shooter 2027

/** Jugar: con conexión, la partida es un servidor público al que otros pueden unirse. Sin conexión, se juega solo. */
let hosting = false, netClosing = false;
async function play() {
  unlock();
  if (ARTEFACTO) { start(); return; }
  playBtn.disabled = true;
  const online = await connectQuick();
  playBtn.disabled = false;
  if (!online) { start(); return; }
  hosting = true;
  net.send({ t: 'host', character: savedChar(), game: GAME });
}
async function connectQuick(): Promise<boolean> {
  if (net.connected) return true;
  let timer = 0;
  const ok = await Promise.race([
    net.connect().then(() => true, () => false),
    new Promise<boolean>((r) => { timer = window.setTimeout(() => r(false), 3500); }),
  ]);
  clearTimeout(timer);
  if (!ok) { netClosing = true; net.close(); netClosing = false; }
  return ok;
}
playBtn.addEventListener('click', () => openCharSelect(() => void play()));
$('retry').addEventListener('click', () => void play());
$('goMenu').addEventListener('click', toTitle);

// ---------- Pausa ----------
// En línea la partida solo se detiene de verdad si todos los jugadores están en pausa.
// Si solo pausas tú, los demás siguen y a ti no te atacan mientras estás en el menú.
const pauseEl = $('pause'), pauseBtn = $('pauseBtn');
const pauseHelpSolo = isTouch ? 'El juego se pausa solo si cambias de app.' : 'Esc o P para pausar y continuar.';
function setPaused(v: boolean) {
  if (v && !playing) return;
  paused = v;
  pauseEl.hidden = !v;
  const shared = mode === 'multi' && world.players.length > 1;
  if (mode === 'multi') net.send({ t: 'pause', v });
  $('pauseKicker').textContent = shared ? 'La partida sigue en marcha' : 'Partida en pausa';
  $('pauseTitle').textContent = shared ? 'Menú' : 'Pausa';
  $('pausePlayers').hidden = mode !== 'multi';
  $('pauseHelp').textContent = shared
    ? 'Los demás siguen jugando. Mientras estás en este menú, los robots no te atacan. Si todos pausáis, la partida se detiene.'
    : pauseHelpSolo;
  if (v && mode === 'multi') renderTeam();
  pauseBtn.innerHTML = icon(v ? 'play' : 'pause');
  pauseBtn.setAttribute('aria-label', v ? 'Continuar' : 'Pausar');
  releaseTouches(); keys.clear();
  if (v && locked()) document.exitPointerLock();
  if (v) $('resume').focus({ preventScroll: true });
  last = performance.now();
}
pauseBtn.innerHTML = icon('pause');
pauseBtn.addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', () => { setPaused(false); if (!isTouch) lockPointer(); });
$('quit').addEventListener('click', () => { setPaused(false); toTitle(); });
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  if (mode === 'multi') {
    if (document.hidden) { net.send({ t: 'in', i: [0, 0, 0, 0, 0] }); net.send({ t: 'pause', v: true }); }
    else if (playing && !paused) setPaused(true);
    return;
  }
  if (document.hidden && playing && world.phase === 'fight') setPaused(true);
});

// ---------- Eventos de la simulación ----------
const ENEMY_COLOR: Record<EnemyType, number> = { chaser: 0xd9534f, tank: 0x6b7280, gunner: 0x8a6fb5, kamikaze: 0x3a3a3a, dron: 0x4a8ab5, jefe: 0x4b4f58,
  enjambre: 0xc9a227, escudero: 0x5f8aa8, tirador: 0x5d7a3e, reparador: 0x3f9a6a };
let hitMarkT = 0;
function flushEvents() {
  const self = me();
  const at = (pid: string) => world.players.find((q) => q.id === pid) ?? self;
  const nameOf = (pid: string) => { const q = world.players.find((x) => x.id === pid); return q ? shownName(q) : names.get(pid) ?? 'Un jugador'; };
  for (const ev of world.events) {
    const mine = !('pid' in ev) || ev.pid === myId;
    const p = 'pid' in ev && ev.pid ? at(ev.pid) : self;
    switch (ev.kind) {
      case 'shoot': {
        const melee = WEAPONS[ev.weapon].kind === 'golpe';
        if (mine) {
          if (melee) { viewSwing = 1; sfx.hit(); } else { viewRecoil = 1; sfx.shoot(); }
          if (ev.weapon === 'francotirador' || ev.weapon === 'cohetes') shake = Math.max(shake, 0.15);
        } else {
          const ps = persons.get(ev.pid);
          if (ps) ps.swing = melee ? 1 : 0.3;
        }
        break;
      }
      case 'enemyShoot': sfx.enemyShoot(); break;
      case 'hit': sfx.hit(); fx.sparks(ev.x, 1.1, ev.z, 0xffe7a0, 4, 4); hitMarkT = 0.15; break;
      case 'kill': {
        const byMe = ev.pid === myId || (ev.pid === null && mode === 'solo');
        sfx.kill();
        if (byMe) { run.kills++; run.coins += ev.coins; hitMarkT = 0.2; }
        const big = ev.type === 'tank' || ev.type === 'jefe';
        fx.debris(ev.x, 1, ev.z, ENEMY_COLOR[ev.type], big ? 18 : 10, big ? 9 : 7, big ? 0.32 : 0.22);
        fx.debris(ev.x, 1, ev.z, 0x34383c, big ? 8 : 4, 6, 0.18);
        fx.sparks(ev.x, 1, ev.z, 0xffc56a, 10, 8);
        if (byMe) fx.text(ev.x, 2.2, ev.z, `+${ev.coins}`, '#ffd54a', 'coin');
        if (ev.type === 'jefe') { fx.explosion(ev.x, ev.z, 4); shake = Math.max(shake, 0.6); banner('Jefe derribado', `Oleada ${world.wave}`, 'Recoge el botín'); }
        break;
      }
      case 'hurt': if (mine) { sfx.hurt(); shake = Math.max(shake, 0.35); hurtFlash.classList.add('on'); setTimeout(() => hurtFlash.classList.remove('on'), 80); } break;
      case 'pickup':
        if (!mine) break;
        sfx.pickup();
        if (ev.type === 'coins') { run.coins += MAP_COIN_VALUE; fx.text(p.x, 1.4, p.z, `+${MAP_COIN_VALUE}`, '#ffd54a', 'coin'); }
        else if (ev.type === 'health') toast('+1 de vida');
        else toast('Ataque rápido');
        break;
      case 'wave': sfx.wave(); banner(`Oleada ${ev.wave}`, ev.wave === 1 ? 'Empieza la invasión' : 'Llegan más robots', `${world.toSpawn} robots`); break;
      case 'boss': sfx.wave(); shake = Math.max(shake, 0.4); banner('Llega el jefe', `Oleada ${ev.wave}`, 'Un robot gigante entra por el norte'); break;
      case 'explosion': sfx.kill(); fx.explosion(ev.x, ev.z, ev.r); fx.debris(ev.x, 0.4, ev.z, 0x7a5a3c, 8, 6, 0.2); shake = Math.max(shake, 0.12 + ev.r * 0.06); break;
      case 'crate': sfx.hit(); fx.debris(ev.x, 0.6, ev.z, 0xa7783f, 14, 6, 0.22); break;
      case 'blocked': fx.sparks(ev.x, 1.1, ev.z, 0xbfe3ff, 4, 3); break;
      case 'guardBroken': sfx.kill(); fx.debris(ev.x, 1.2, ev.z, 0x9fb3c4, 14, 7, 0.22); fx.text(ev.x, 2.6, ev.z, 'Escudo roto', '#9fd8ff'); break;
      case 'repair': fx.sparks(ev.x, 1.4, ev.z, 0x6dff8a, 6, 3); break;
      case 'armorBlock': if (mine) { sfx.hit(); toast('Golpe bloqueado'); } break;
      case 'chain': fx.lightning(ev.points, 1.2); break;
      case 'regen': if (mine) toast('+1 de vida'); break;
      case 'waveCleared':
        sfx.wave(); run.coins += ev.bonus;
        banner('Oleada superada', `Oleada ${world.wave}`, `Vida completa · +${ev.bonus} monedas`);
        shopOpenedFor = world.wave; openShop(ev.bonus);
        break;
      case 'gameover': sfx.gameover(); gameOver(); break;
      case 'down':
        fx.debris(p.x, 1, p.z, p.color, 10, 5);
        if (mode === 'solo' || world.players.every((q) => !q.alive)) break;
        if (ev.pid === myId) { sfx.hurt(); banner('Has caído', 'Fuera de combate', 'Vuelves al terminar la oleada si tu equipo resiste'); }
        else toast(`${nameOf(ev.pid)} ha caído`);
        break;
      case 'join': if (ev.pid !== myId && mode === 'multi') toast(`${nameOf(ev.pid)} se ha unido`); break;
      case 'leave': if (mode === 'multi') toast(`${nameOf(ev.pid)} ha salido`); break;
    }
  }
  world.events.length = 0;
}

// ---------- Multijugador ----------
// Lista de servidores públicos de Bloques: al tocar uno entras directo a esa partida, desde cualquier dispositivo.
const lobbyEl = $('lobby'), lobbyStatus = $('lobbyStatus');
let joinedRoom: { name: string } | null = null, waitingFirstSnap = false, listTimer = 0;
function setLobbyStatus(text: string, error = false) { lobbyStatus.textContent = text; lobbyStatus.classList.toggle('error', error); }
async function ensureConnected(): Promise<boolean> {
  if (net.connected) return true;
  setLobbyStatus('Conectando');
  try { await net.connect(); setLobbyStatus(''); return true; } catch {
    setLobbyStatus('No se puede conectar con los servidores ahora. Comprueba tu conexión a internet e inténtalo de nuevo.', true);
    renderRooms(null);
    return false;
  }
}
const STATE_TEXT = (r: RoomInfo) => r.players >= r.max ? 'Lleno' : ({
  vacio: 'Vacío', empezando: 'Empezando la partida', batalla: `En batalla · Oleada ${r.wave}`, tienda: `En la tienda · Oleada ${r.wave}`, reiniciando: 'Empezando otra partida',
} as const)[r.state];
function renderRooms(rooms: RoomInfo[] | null) {
  const list = $('roomsList');
  const message = (iconName: 'wifiOff' | 'users', text: string) => {
    list.innerHTML = '';
    const li = document.createElement('li'); li.className = 'empty';
    li.innerHTML = `${icon(iconName)}<span></span>`;
    li.querySelector('span')!.textContent = text;
    list.appendChild(li);
  };
  if (!rooms) { message('wifiOff', 'Sin conexión con los servidores'); return; }
  rooms = rooms.filter((r) => (r.game ?? 'shooter') === GAME);
  if (!rooms.length) { message('users', 'Ahora no hay nadie jugando. Pulsa Jugar y tu partida aparecerá aquí para los demás.'); return; }
  list.querySelector('.empty')?.remove();
  const ids = new Set(rooms.map((r) => r.id));
  for (const old of list.querySelectorAll<HTMLButtonElement>('.server')) if (!ids.has(old.dataset.id!)) old.parentElement!.remove();
  for (const r of rooms) {
    let b = list.querySelector<HTMLButtonElement>(`.server[data-id="${r.id}"]`);
    if (!b) {
      b = document.createElement('button');
      b.className = 'server'; b.dataset.id = r.id;
      b.innerHTML = `<span class="sv-ic">${icon('blocks')}</span><span class="sv-txt"><span class="sv-name"></span><span class="sv-state"></span></span>`
        + '<span class="sv-count"><span class="sv-dots"></span><span class="sv-n"></span></span>';
      b.querySelector('.sv-name')!.textContent = r.name;
      const id = r.id, name = r.name;
      b.addEventListener('click', () => void joinServer(id, name));
      const li = document.createElement('li'); li.appendChild(b); list.appendChild(li);
    }
    const full = r.players >= r.max, state = STATE_TEXT(r);
    b.classList.toggle('full', full); b.classList.toggle('busy', r.players > 0);
    b.disabled = full;
    b.querySelector('.sv-state')!.textContent = `Servidor público · ${state}`;
    b.querySelector('.sv-n')!.textContent = `${r.players}/${r.max}`;
    b.querySelector('.sv-dots')!.innerHTML = Array.from({ length: r.max }, (_, k) => `<i class="${k < r.players ? 'on' : ''}"></i>`).join('');
    b.setAttribute('aria-label', `${r.name}, servidor público: ${r.players} de ${r.max} jugadores. ${state}`);
  }
}
async function openLobby(message = '') {
  unlock();
  lobbyEl.hidden = false;
  setLobbyStatus(message, !!message);
  if (await ensureConnected()) {
    net.send({ t: 'list', game: GAME });
    if (message) setLobbyStatus(message, true);
    clearInterval(listTimer);
    listTimer = window.setInterval(() => { if (lobbyEl.hidden || !net.connected) clearInterval(listTimer); else net.send({ t: 'list', game: GAME }); }, 2000);
  }
  ($('roomsList').querySelector('button:not([disabled])') as HTMLElement | null)?.focus({ preventScroll: true });
}
function closeLobby() {
  lobbyEl.hidden = true;
  clearInterval(listTimer);
  if (mode !== 'multi') { netClosing = true; net.close(); netClosing = false; }
  $('multiBtn').focus();
}
async function joinServer(id: string, name: string) {
  if (!(await ensureConnected())) return;
  setLobbyStatus(`Entrando en ${name}`);
  net.send({ t: 'join', room: id, character: savedChar(), game: GAME });
}
$('multiBtn').addEventListener('click', () => openCharSelect(() => void openLobby(), 'Para jugar en línea'));
$('lobbyClose').addEventListener('click', closeLobby);
net.onRooms = (r) => renderRooms(r);
net.onError = (msg) => {
  if (hosting && mode !== 'multi') { hosting = false; start(); return; }
  if (!lobbyEl.hidden) setLobbyStatus(msg, true); else toast(msg);
};
net.onNotice = (msg) => toast(msg);
net.onJoined = (room) => { joinedRoom = room; myId = net.you; waitingFirstSnap = true; };
net.onKicked = (msg) => { toTitle(); void openLobby(msg); };
net.onClose = () => {
  if (netClosing || mode !== 'multi') return;
  toTitle();
  void openLobby('Se ha perdido la conexión con el servidor.');
};
function beginMulti() {
  waitingFirstSnap = false;
  clearScene();
  mode = 'multi';
  world = net.world!;
  for (const q of world.players) names.set(q.id, q.name);
  document.body.classList.add('multi');
  teamKey = '';
  shopOpenedFor = world.phase === 'shop' ? -1 : world.wave;
  beginPlaying();
  const r = joinedRoom!;
  roomChip.hidden = false;
  roomChip.innerHTML = `${icon('globe')}<span></span>`;
  roomChip.querySelector('span')!.textContent = r.name;
  roomChip.setAttribute('aria-label', r.name);
  playersHud.hidden = false;
  banner(r.name, 'Servidor público', hosting ? 'Otros jugadores pueden unirse a tu partida' : `Juegas como ${me()?.name ?? ''}`);
  hosting = false;
}
function leaveMulti() {
  const was = mode === 'multi' || net.connected;
  waitingFirstSnap = false;
  if (net.connected) { netClosing = true; net.send({ t: 'leave' }); net.close(); netClosing = false; }
  if (!was) return;
  mode = 'solo'; myId = 'p1'; joinedRoom = null;
  document.body.classList.remove('multi');
  roomChip.hidden = true; playersHud.hidden = true;
  clearScene();
  world = newWorld(Math.random, true, [{ id: 'p1', name: 'Tú', character: savedChar() }], GAME);
}
const IDLE_INPUT: Input = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false };
function multiFrame(dt: number) {
  if (waitingFirstSnap && net.world) beginMulti();
  if (!net.world || mode !== 'multi') return;
  const active = playing && !paused && !document.hidden && net.world.phase === 'fight' && !net.world.over;
  world = net.world;
  const mine = world.players.find((q) => q.id === myId);
  if (!mine) return;
  net.update(dt, active && mine.alive ? readInput(dt) : { ...IDLE_INPUT, aimX: Math.sin(yaw), aimZ: Math.cos(yaw) });
  mine.angle = yaw;
  for (const q of world.players) names.set(q.id, q.name);
  world.events = net.events.splice(0);
  flushEvents();
  const snap = net.snap!;
  if (world.phase === 'shop') {
    if (shopOpenedFor !== world.wave && shopEl.hidden) { shopOpenedFor = world.wave; openShop(0); }
    const ready = snap.P.filter((q) => q.ready).length;
    $('shopTimer').textContent = `La oleada empieza en ${snap.shopLeft} s · ${ready}/${snap.P.length} listos`;
  } else if (!shopEl.hidden) {
    shopEl.hidden = true;
    if (!isTouch && playing && !paused) lockHint.hidden = false;
  }
  if (world.over) $('goAuto').textContent = `Nueva partida en ${snap.restartLeft} s`;
  else if (!gameoverEl.hidden) { gameoverEl.hidden = true; run.kills = 0; run.coins = 0; }
}
let teamKey = '';
function renderPlayers() {
  const key = world.players.map((q) => `${q.id}:${q.hp}:${q.maxHp}:${q.alive}:${q.away}:${isBlocked(q.name)}`).join('|');
  if (key === teamKey) return;
  teamKey = key;
  playersHud.innerHTML = '';
  for (const q of world.players) {
    const li = document.createElement('li');
    li.className = q.alive ? '' : 'down';
    li.style.setProperty('--pc', `#${q.color.toString(16).padStart(6, '0')}`);
    li.innerHTML = '<span class="dot"></span><span class="pn"></span><span class="ph"></span>';
    li.querySelector('.pn')!.textContent = q.id === myId ? `${q.name} (tú)` : shownName(q);
    li.querySelector('.ph')!.textContent = !q.alive ? 'Caído' : q.away ? 'En pausa' : `${q.hp}/${q.maxHp}`;
    playersHud.appendChild(li);
  }
  if (!pauseEl.hidden) renderTeam();
}
let reportPid = '';
function renderTeam() {
  const list = $('playersList');
  list.innerHTML = '';
  const others = world.players.filter((q) => q.id !== myId);
  if (!others.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = `Estás solo en ${joinedRoom?.name ?? 'el servidor'} por ahora.`;
    list.appendChild(li);
    return;
  }
  for (const q of others) {
    const li = document.createElement('li');
    li.style.setProperty('--pc', `#${q.color.toString(16).padStart(6, '0')}`);
    li.innerHTML = '<span class="dot"></span><span class="pn"></span>';
    li.querySelector('.pn')!.textContent = shownName(q);
    const isB = isBlocked(q.name);
    const bb = document.createElement('button');
    bb.className = 'ghost small';
    bb.innerHTML = `${icon('ban')} ${isB ? 'Desbloquear' : 'Bloquear'}`;
    bb.setAttribute('aria-label', `${isB ? 'Desbloquear' : 'Bloquear'} a ${shownName(q)}`);
    bb.addEventListener('click', () => {
      const k = normalizeForFilter(q.name);
      if (blocked.has(k)) blocked.delete(k); else blocked.add(k);
      writeStr('shooter.bloqueados', JSON.stringify([...blocked]));
      toast(blocked.has(k) ? 'Jugador bloqueado. Ya no verás su nombre.' : 'Jugador desbloqueado');
      teamKey = ''; renderTeam();
    });
    const rb = document.createElement('button');
    rb.className = 'ghost small';
    rb.innerHTML = `${icon('flag')} Denunciar`;
    rb.setAttribute('aria-label', `Denunciar a ${shownName(q)}`);
    rb.addEventListener('click', () => {
      reportPid = q.id;
      $('reportName').textContent = shownName(q);
      $('reportDlg').hidden = false;
      $('reportCancel').focus();
    });
    li.append(bb, rb);
    list.appendChild(li);
  }
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#reportDlg [data-reason]'))
  b.addEventListener('click', () => {
    if (reportPid) net.send({ t: 'report', pid: reportPid, reason: 'conducta' });
    reportPid = '';
    $('reportDlg').hidden = true;
  });
$('reportCancel').addEventListener('click', () => { reportPid = ''; $('reportDlg').hidden = true; });

// ---------- Elegir personaje ----------
const charSelEl = $('charSelect');
let csSel: CharacterId = savedChar(), csDone: () => void = () => {}, csLabel = 'Tu personaje';
let portraits: Partial<Record<CharacterId, string>> = {};
function makePortraits() {
  if (Object.keys(portraits).length) return;
  try {
    const W = 240, H = 280;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(W, H, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xfff4e0, 0x3a4a2a, 1.6));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.6); key.position.set(2.5, 4, 3.5); sc.add(key);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    cam.position.set(1.4, 1.6, 4.4); cam.lookAt(0, 1.05, 0);
    for (const c of BLOQUES_CHARS) {
      const p = makePerson(c);
      showHeld(p, c === 'coloso' ? 'martillo' : 'palo');
      p.root.rotation.y = 0.4;
      p.armR.rotation.x = -0.5;
      sc.add(p.root);
      r.render(sc, cam);
      portraits[c] = r.domElement.toDataURL('image/png');
      sc.remove(p.root);
    }
    r.dispose(); r.forceContextLoss();
  } catch { portraits = {}; }
}
function statBar(label: string, k: number) {
  return `<div class="cs-stat"><span>${label}</span><div class="track"><div class="fill" style="transform: scaleX(${Math.max(0.08, Math.min(1, k))})"></div></div></div>`;
}
function renderCharSelect() {
  $('csKicker').textContent = csLabel;
  const grid = $('csGrid');
  grid.innerHTML = '';
  for (const c of BLOQUES_CHARS) {
    const ch = CHARACTERS[c], name = BLOQUES_NAME[c]!;
    const b = document.createElement('button');
    b.className = 'cs-card';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(c === csSel));
    b.innerHTML = `<div class="cs-art">${portraits[c] ? `<img src="${portraits[c]}" alt="" />` : icon('userRound')}</div>`
      + `<div class="cs-info"><span class="cs-role">${ch.role}</span><span class="cs-name">${name}</span><p>${ch.perk}</p>`
      + statBar('Vida', (5 + ch.hp) / 7) + statBar('Velocidad', ch.speed / 1.2) + '</div>';
    b.setAttribute('aria-label', `${name}, ${ch.role}. ${ch.perk}`);
    b.addEventListener('click', () => { csSel = c; renderCharSelect(); });
    b.addEventListener('dblclick', () => $('csGo').click());
    grid.appendChild(b);
  }
}
function openCharSelect(done: () => void, label = 'Tu personaje') {
  unlock();
  csLabel = label; csSel = savedChar(); csDone = done;
  charSelEl.hidden = false;
  makePortraits();
  renderCharSelect();
  ($('csGrid').querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
}
$('csGo').addEventListener('click', () => { writeStr('bloques.personaje', csSel); charSelEl.hidden = true; csDone(); });
$('csBack').addEventListener('click', () => { charSelEl.hidden = true; });
charSelEl.addEventListener('keydown', (e) => {
  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    csSel = BLOQUES_CHARS[(BLOQUES_CHARS.indexOf(csSel) + 1) % BLOQUES_CHARS.length];
    renderCharSelect();
    ($('csGrid').querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  if (e.key === 'Escape') $('csBack').click();
});

// ---------- Calidad y ajustes ----------
let perfFrames = 0, perfTime = 0, perfDone = settings.quality !== 'auto', lowQuality = false;
function adaptQuality(dt: number) {
  if (perfDone) return;
  perfFrames++; perfTime += dt;
  if (perfFrames < 150 && perfTime < 2.5) return;
  perfDone = true;
  if (perfFrames / perfTime < 40) applyQuality(true);
}
function applyQuality(low: boolean) {
  if (low === lowQuality) return;
  lowQuality = low;
  renderer.shadowMap.enabled = !low;
  sun.castShadow = !low;
  renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, maxDpr));
  scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  resize();
}
function setQuality(q: Quality) {
  settings.quality = q;
  if (q === 'auto') { perfDone = false; perfFrames = 0; perfTime = 0; applyQuality(false); } else { perfDone = true; applyQuality(q === 'baja'); }
}
if (settings.quality === 'baja') applyQuality(true);
const settingsEl = $('settings'), sensEl = $<HTMLInputElement>('setSens');
function renderSettings() {
  $('setSound').setAttribute('aria-checked', String(!isMuted()));
  $('setShake').setAttribute('aria-checked', String(settings.shake));
  sensEl.value = String(sens);
  for (const b of settingsEl.querySelectorAll<HTMLButtonElement>('[data-quality]')) b.setAttribute('aria-checked', String(b.dataset.quality === settings.quality));
}
function openSettings() { renderSettings(); settingsEl.hidden = false; $('settingsClose').focus(); }
$('setSound').addEventListener('click', () => { setMuted(!isMuted()); renderMute(); renderSettings(); });
$('setShake').addEventListener('click', () => { settings.shake = !settings.shake; renderSettings(); });
sensEl.addEventListener('input', () => { sens = Number(sensEl.value) || 1; writeStr('bloques.sensibilidad', String(sens)); });
for (const b of settingsEl.querySelectorAll<HTMLButtonElement>('[data-quality]'))
  b.addEventListener('click', () => { setQuality(b.dataset.quality as Quality); renderSettings(); });
$('settingsClose').addEventListener('click', () => { settingsEl.hidden = true; });
$('menuSettings').addEventListener('click', openSettings);
$('pauseSettings').addEventListener('click', openSettings);

// ---------- Bucle ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 82 : 72; // en vertical se abre un poco el ángulo
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now(), loaded = false;
const tmp = new THREE.Vector3();
function frame(now: number) {
  const rawDt = (now - last) / 1000;
  last = now;
  const sharedRun = mode === 'multi' && world.players.length > 1;
  const dt = paused && !sharedRun ? 0 : Math.min(0.05, rawDt);
  const t = now / 1000;
  if (playing && !document.hidden && rawDt < 1) adaptQuality(rawDt);
  pollPad();
  if (mode === 'multi' || waitingFirstSnap) multiFrame(paused && !sharedRun ? 0 : Math.min(0.25, rawDt));
  else if (playing && !paused && !document.hidden && world.phase === 'fight') {
    step(world, readInput(dt), dt);
    flushEvents();
  }
  hud();
  lockHint.hidden = isTouch || !playing || paused || locked() || world.phase !== 'fight' || !gameoverEl.hidden || !lockTried;

  // Jugadores: los demás se ven como personajes; yo, solo la mano
  const self = me();
  const present = new Set<string>();
  for (const q of world.players) {
    present.add(q.id);
    if (q.id === myId && q.alive && playing) { removePerson(q.id); continue; }
    const p = personFor(q);
    const speed = dt > 0 ? Math.hypot(q.x - p.px, q.z - p.pz) / dt : 0;
    p.px = q.x; p.pz = q.z;
    showHeld(p, q.weapon);
    p.root.position.set(q.x, 0, q.z);
    p.root.rotation.y = q.angle;
    p.root.visible = !world.over;
    animatePerson(p, speed, dt, t, !q.alive, reduceMotion.matches);
    if (p.label) { p.label.position.set(q.x, 2.35, q.z); p.label.visible = q.alive && !world.over; }
  }
  for (const id of [...persons.keys()]) if (!present.has(id)) removePerson(id);

  // Robots
  const alive = new Set<number>();
  for (const e of world.enemies) {
    alive.add(e.id);
    let b = bots.get(e.id);
    if (!b) { b = Object.assign(makeBot(e.type), { bar: makeBar() }); b.px = e.x; b.pz = e.z; bots.set(e.id, b); scene.add(b.root, b.bar.g); }
    const speed = dt > 0 ? Math.hypot(e.x - b.px, e.z - b.pz) / dt : 0;
    b.px = e.x; b.pz = e.z;
    b.root.position.set(e.x, 0, e.z);
    b.root.rotation.y = e.face;
    animateBot(b, speed, dt, t, e.flash > 0, e.stun > 0, reduceMotion.matches);
    if (e.type === 'escudero') b.root.getObjectByName('shield')!.visible = e.guard > 0;
    if (e.type === 'tirador') {
      const laser = b.root.getObjectByName('laser')!;
      laser.visible = e.charge > 0 && Math.floor(t * 12) % 3 !== 0;
      if (laser.visible) { const len = Math.hypot(self.x - e.x, self.z - e.z); laser.scale.z = len; laser.position.z = len / 2; }
    }
    if (e.type === 'kamikaze') { const core = b.root.getObjectByName('core') as THREE.Mesh | undefined; if (core) core.visible = Math.floor(t * (6 + (e.speed > 0 ? 6 : 0))) % 2 === 0; }
    const k = e.hp / e.maxHp;
    b.bar.g.visible = k < 1;
    if (k < 1) {
      b.bar.g.position.set(e.x, BOT_TOP[e.type], e.z);
      b.bar.g.quaternion.copy(camera.quaternion);
      b.bar.fg.scale.x = Math.max(0.001, k); b.bar.fg.position.x = -(1 - k) / 2;
    }
  }
  for (const [id, b] of bots) if (!alive.has(id)) { scene.remove(b.root, b.bar.g); bots.delete(id); }
  const boss = world.enemies.find((e) => e.type === 'jefe');
  bossBarEl.hidden = !boss || !playing;
  document.body.classList.toggle('boss', !bossBarEl.hidden);
  if (boss) { const k = Math.max(0, boss.hp / boss.maxHp); bossFill.style.transform = `scaleX(${k})`; bossBarEl.setAttribute('aria-valuenow', String(Math.round(k * 100))); }

  sync(objs.obstacles, world.obstacles, (o) => makeObstacle(o.kind, o.r, o.rot, o.id), (m, o) => {
    m.position.set(o.x, 0, o.z);
    if (o.kind === 'crate') m.scale.setScalar(0.85 + 0.15 * (o.hp / 4));
  });
  sync(objs.pickups, world.pickups, (k) => (k.type === 'coins' ? makeCoin() : k.type === 'health' ? makeHealth() : makeRapid()), (m, k) => {
    m.position.set(k.x, 0.7 + Math.sin(now / 260 + k.id) * 0.15, k.z);
    m.rotation.y = now / 380 + k.id;
    m.visible = k.life > 2.5 || Math.floor(now / 120) % 2 === 0;
  });
  sync(objs.bullets, world.bullets, (b) => makeBullet(b.kind), (m, b) => {
    let y = 1.3;
    if (b.kind === 'granada') y = 1.2 + Math.sin(Math.PI * (1 - b.life / b.maxLife)) * 2.2;
    if (b.kind === 'enemiga') y = 1.25;
    m.position.set(b.x, y, b.z);
    m.rotation.y = Math.atan2(b.vx, b.vz);
  });
  fx.update(dt);
  for (const c of clouds.children) { c.position.x += dt * 1.5; if (c.position.x > 100) c.position.x = -100; }

  // Cámara en primera persona (o mirando a un compañero si has caído)
  const moving = self.alive && self.moving && playing && !paused;
  if (moving && !reduceMotion.matches) bobT += dt * 9; else bobT *= 0.9;
  const bob = settings.shake ? Math.sin(bobT) * 0.045 : 0;
  shake = Math.max(0, shake - dt * 2.2);
  const sk = settings.shake ? shake * 0.12 : 0;
  if (self.alive || !playing) {
    camera.position.set(self.x, 1.62 + Math.abs(bob), self.z);
    camera.rotation.set(pitch + (Math.random() - 0.5) * sk, yaw + Math.PI + (Math.random() - 0.5) * sk, 0);
  } else {
    const mate = world.players.find((q) => q.alive) ?? self;
    tmp.set(mate.x - Math.sin(t * 0.3) * 7, 5.5, mate.z - Math.cos(t * 0.3) * 7);
    camera.position.lerp(tmp, Math.min(1, dt * 3));
    camera.lookAt(mate.x, 1, mate.z);
  }
  // Mano: balanceo al andar, golpe en arco y retroceso de las armas
  view.visible = playing && self.alive && !world.over;
  if (view.visible) {
    setViewModel(self.weapon, self.character);
    viewSwing = Math.max(0, viewSwing - dt * 4.2);
    viewRecoil = Math.max(0, viewRecoil - dt * 9);
    const sw = viewSwing > 0 ? Math.sin((1 - viewSwing) * Math.PI) : 0;
    viewArm.position.set(0.26 + Math.cos(bobT * 0.5) * 0.008 - sw * 0.1, -0.24 + bob * 0.4 + sw * 0.05, -0.62 + viewRecoil * 0.05 - sw * 0.1);
    viewArm.rotation.set(0.12 - sw * 1.2 + viewRecoil * 0.18, 0.18 + sw * 0.6, -sw * 0.5);
  }
  hitMarkT = Math.max(0, hitMarkT - dt);
  crosshair.classList.toggle('hit', hitMarkT > 0);

  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60);
  sky.position.copy(camera.position);

  if (lowQuality) renderer.render(scene, camera);
  else composer.render();
  if (!loaded) { loaded = true; const l = $('loading'); l.classList.add('done'); setTimeout(() => l.remove(), 450); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Para pruebas automatizadas
Object.assign(window, { __world: () => world, __paused: () => paused, __tick: () => net.snap?.tick ?? -1, __snapP: () => net.snap?.P.map((p) => [p.id.slice(0, 4), p.away, p.alive]), __mode: () => mode, __me: () => myId, __look: (y: number) => { yaw = y; }, __lowQuality: () => lowQuality });
