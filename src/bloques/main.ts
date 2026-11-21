// Bloques: supervivencia en un mundo de bloques, en primera persona. Minar con su tiempo, craftear,
// cuevas con minerales, día y noche con criaturas, 10 corazones. Solo o en mundos compartidos con amigos
// (el servidor manda: aquí solo se envía la entrada y se dibuja lo que dice el servidor).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { World, generate, spawnPoint, raycast, moveBody, BLOCKS, B, USABLE, lightOf, heightOf, unkey, CHUNK, type Tex, type Body } from './voxel.ts';
import { step, place, craft, selectSlot, moveSlot, respawn, lookDir, sunLight, isNight, dayPhase, stationsNear, verityCommand, boxMove, getBox, FURNACE, type Box,
  WALK, DAY_SECONDS, MAX_HP, EYE, REACH, type Game, type GEvent, type Look, type MobKind, type VerityCmd } from './game.ts';
import { verity } from './verity.ts';
import { ITEMS, RECIPES, HOTBAR, SLOTS, count, cannotCraft, itemName, toolId, SMELT, FUEL, SMELT_SECONDS, type Slot, type Station, type Recipe } from './items.ts';
import type { IconName } from '../ui/icons.ts';
import { MOB_KINDS, type NetP, type WorldInfo } from './protocol.ts';
import { WorldNet } from './net.ts';
import { meshChunk, type MeshData } from './mesher.ts';
import MeshWorker from './mesh.worker.ts?worker&inline';
import type { MeshResult, Packed } from './mesh.worker.ts';
import { buildAtlas, setAnisotropy, type TexName } from './textures.ts';
import { itemIcon, itemModel } from './itemart.ts';
import { makePerson, animatePerson, type Person } from './models.ts';
import { makeCreature, animateCreature, setFriend, type Creature } from './criaturas.ts';
import { worldName, newCard, startWorld, saveGame, loadGame, parseCards, MAX_WORLDS, type WorldCard } from './save.ts';
import { fpInput, applyLook } from './controls.ts';
import { sfx, unlock, isMuted, setMuted } from '../shooter/audio.ts';
import { normalizeForFilter } from '../shooter/moderation.ts';
import { Effects } from '../shooter/fx.ts';
import { makeLabel } from '../shooter/models.ts';
import { settings, type Quality } from '../shooter/settings.ts';
import { icon, hydrateIcons } from '../ui/icons.ts';
import '../ui/pwa.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (isTouch) document.body.classList.add('touch');
hydrateIcons();
$('help').textContent = isTouch
  ? 'Pulgar izquierdo: moverte · Arrastra a la derecha: mirar · Botón dorado: romper (mantén) · Botón blanco: colocar, o usar mesa, horno y cofre.'
  : 'WASD: moverte · Espacio: saltar · Clic izquierdo (mantener): romper · Clic derecho: colocar o usar mesa, horno y cofre · E: inventario · T: Verity.';
const readStr = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const writeStr = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
/** Versión publicada como Artifact de claude.ai: solo un jugador (allí no se puede conectar con el servidor). */
const ARTEFACTO = import.meta.env.VITE_ARTEFACTO === '1';
if (ARTEFACTO) {
  for (const el of document.querySelectorAll<HTMLElement>('#multiBtn, #openRow, a[href="./creditos.html"], #settings .links')) { el.hidden = true; el.style.display = 'none'; }
  const credits = document.createElement('span');
  credits.className = 'credits';
  credits.textContent = 'Versión de un jugador. Hecho con Three.js (MIT), iconos Lucide (ISC) y fuentes Oswald e Inter (SIL OFL 1.1).';
  $('help').append(credits);
}
const invitedWorld = ARTEFACTO ? null : new URLSearchParams(location.search).get('mundo');
if (invitedWorld) $('invited').hidden = false;

// ---------- Render ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const maxDpr = isTouch ? 1.5 : 2;
renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0x2c8ff0), NIGHT_SKY = new THREE.Color(0x060a18), DAY_FOG = new THREE.Color(0xc4e6fb), NIGHT_FOG = new THREE.Color(0x0b1020), DUSK = new THREE.Color(0xf0a070);
const fogColor = DAY_FOG.clone();
scene.background = fogColor;
scene.fog = new THREE.Fog(fogColor, 50, 95);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);
const skyU = { top: { value: DAY_SKY.clone() }, bottom: { value: fogColor }, sun: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; uniform float night; varying vec3 vDir;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
    void main(){ float y = clamp(vDir.y * 1.4, 0.0, 1.0); vec3 c = mix(bottom, top, pow(y, 0.6));
      float s = max(dot(vDir, sun), 0.0); c += vec3(1.0, 0.9, 0.7) * (smoothstep(0.9985, 0.9992, s) * 2.5 + pow(s, 12.0) * 0.3) * (1.0 - night);
      float m = max(dot(vDir, -sun), 0.0); c += vec3(0.85, 0.9, 1.0) * smoothstep(0.9990, 0.9994, m) * night * 1.4;
      vec3 q = floor(vDir * 180.0); c += vec3(step(0.9975, h(q))) * night * smoothstep(0.0, 0.3, vDir.y);
      gl_FragColor = vec4(c, 1.0); }`,
}));
scene.add(sky);
const hemi = new THREE.HemisphereLight(0xd8ecff, 0x55603a, 1.0);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 160 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
scene.add(hemi, sun, sun.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.45, 0.88);
composer.addPass(bloom);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.06); c.rgb = (c.rgb - 0.5) * 1.05 + 0.5; c.rgb *= vec3(1.03, 1.0, 0.96);
      float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d); gl_FragColor = c; }`,
}));
composer.addPass(new OutputPass());

// ---------- Atlas y materiales del mundo ----------
const TEXS = [...new Set(BLOCKS.flatMap((b) => b.tex))] as TexName[];
const atlas = buildAtlas(TEXS);
const uvOf = (t: Tex) => atlas.uv(t as TexName);
/** Visión nocturna: se ve con los colores de verdad en cuevas y de noche (no en verde). Activada siempre salvo que se quite en Ajustes. */
let nightVision = readStr('bloques.vision') !== '0';
const nvU = { value: 0 };
const nvAmbient = new THREE.AmbientLight(0xffffff, 0);
scene.add(nvAmbient);
function worldMat(see: boolean) {
  const m = new THREE.MeshStandardMaterial({ map: atlas.map, normalMap: atlas.normal, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 0.92,
    alphaTest: see ? 0.5 : 0, side: see ? THREE.DoubleSide : THREE.FrontSide });
  // Las antorchas dan luz propia: brillan también de noche (atributo "glow" de cada vértice)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNV = nvU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow; uniform float uNV;')
      // Color de la textura antes de la sombra de la cueva: con visión nocturna, nunca se ve más oscuro que esto
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec3 nvBase = diffuseColor.rgb;')
      .replace('#include <opaque_fragment>', 'outgoingLight = max(outgoingLight, nvBase * uNV * (0.62 + 0.38 * clamp(normal.z, 0.0, 1.0)));\n#include <opaque_fragment>')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.82, 0.55) * vGlow * 0.9;');
  };
  return m;
}
const solidMat = worldMat(false), seeMat = worldMat(true);

// ---------- Mundo y trozos ----------
let world: World = generate(1);
const chunks = new Map<string, THREE.Mesh[]>();
const dirty = new Set<string>();
function geometryOf(d: MeshData | Packed) {
  const g = new THREE.BufferGeometry();
  const f = (v: number[] | Float32Array) => (v instanceof Float32Array ? v : new Float32Array(v));
  g.setAttribute('position', new THREE.BufferAttribute(f(d.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(f(d.nrm), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(f(d.uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(f(d.col), 3));
  g.setAttribute('glow', new THREE.BufferAttribute(f(d.glow), 1));
  g.setIndex(new THREE.BufferAttribute(d.idx instanceof Uint32Array ? d.idx : new Uint32Array(d.idx), 1));
  g.computeBoundingSphere();
  return g;
}
/** Pone (o cambia) las mallas de un trozo. */
function setChunkMeshes(cx: number, cz: number, solid: MeshData | Packed, see: MeshData | Packed) {
  const key = `${cx},${cz}`;
  for (const m of chunks.get(key) ?? []) { scene.remove(m); m.geometry.dispose(); }
  const list: THREE.Mesh[] = [];
  for (const [d, mat] of [[solid, solidMat], [see, seeMat]] as const) {
    if (!d.idx.length) continue;
    const m = new THREE.Mesh(geometryOf(d), mat);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); list.push(m);
  }
  chunks.set(key, list);
}
// Las mallas se construyen en segundo plano (worker) para que el juego no se pare al caminar
let mesher: Worker | null = null;
const meshPending = new Map<string, number>(); // trozo -> número de petición (la última manda)
let meshSeq = 0;
try {
  mesher = new MeshWorker();
  const uv: Record<string, [number, number, number, number]> = {};
  for (const t of TEXS) uv[t] = atlas.uv(t);
  mesher.postMessage({ uv });
  mesher.onmessage = (e: MessageEvent<MeshResult>) => {
    const r = e.data, key = `${r.cx},${r.cz}`;
    if (meshPending.get(key) !== r.id) return; // ya se pidió otra más nueva (o se descartó)
    meshPending.delete(key);
    if (r.solid.idx.length + r.see.idx.length === 0 && !chunks.has(key)) { chunks.set(key, []); return; }
    setChunkMeshes(r.cx, r.cz, r.solid, r.see);
  };
  mesher.onerror = () => { mesher = null; };
} catch { mesher = null; }
function buildChunk(cx: number, cz: number) {
  const key = `${cx},${cz}`;
  if (!mesher) { const { solid, see } = meshChunk(world, cx, cz, uvOf); setChunkMeshes(cx, cz, solid, see); return; }
  const near: Uint8Array[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(world.chunkData(cx + dx, cz + dz).slice());
  const id = ++meshSeq;
  meshPending.set(key, id);
  mesher.postMessage({ job: { id, cx, cz, seed: world.seed, near } }, near.map((n) => n.buffer));
}
function markDirty(x: number, z: number, radius = 1) {
  for (let cx = Math.floor((x - radius) / CHUNK); cx <= Math.floor((x + radius) / CHUNK); cx++)
    for (let cz = Math.floor((z - radius) / CHUNK); cz <= Math.floor((z + radius) / CHUNK); cz++)
      if (chunks.has(`${cx},${cz}`)) dirty.add(`${cx},${cz}`); // solo los que se están viendo
}
function applyChange(i: number, b: number) {
  const [x, y, z] = unkey(i);
  const was = world.get(x, y, z);
  world.set(x, y, z, b);
  markDirty(x, z, lightOf(was) || lightOf(b) ? 9 : 1); // la luz de una antorcha o un horno llega lejos
}
/** Cambia de mundo: quita las mallas del anterior; los trozos del nuevo se van cargando alrededor del jugador. */
function loadWorld(w: World) {
  world = w;
  for (const list of chunks.values()) for (const m of list) { scene.remove(m); m.geometry.dispose(); }
  chunks.clear(); dirty.clear(); meshPending.clear();
}
/** Distancia de visión en trozos (6 = 96 bloques; menos con calidad baja). */
const viewChunks = () => (lowQuality ? 4 : 6);
let unloadT = 0;
/** Carga los trozos que faltan cerca de (x, z), los más cercanos primero, sin pasarse de unos milisegundos por fotograma. */
function streamChunks(x: number, z: number, dt: number) {
  const R = viewChunks(), ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
  const t0 = performance.now();
  for (let r = 0; r <= R && performance.now() - t0 < 10; r++)
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || dx * dx + dz * dz > R * R + 1) continue;
      const k = `${ccx + dx},${ccz + dz}`;
      if (chunks.has(k) || meshPending.has(k)) continue;
      if ((performance.now() - t0 >= 10 && chunks.size) || (mesher && meshPending.size >= 3)) return;
      buildChunk(ccx + dx, ccz + dz);
    }
  // Quitar las mallas lejanas y, de vez en cuando, los datos de trozos muy lejanos (sus cambios se guardan)
  for (const [k, list] of chunks) {
    const [cx, cz] = k.split(',').map(Number);
    if (Math.abs(cx - ccx) > R + 2 || Math.abs(cz - ccz) > R + 2) { for (const m of list) { scene.remove(m); m.geometry.dispose(); } chunks.delete(k); meshPending.delete(k); }
  }
  if ((unloadT -= dt) <= 0) { unloadT = 5; world.unloadFar(x, z, R + 6); }
}

// ---------- Estado de la partida ----------
let mode: 'solo' | 'multi' = 'solo';
let game: Game | null = null; // solo: la partida entera corre aquí
const net = new WorldNet();
let myId = 'p1';
let yaw = Math.PI, pitch = 0;
let playing = false, paused = false;
/** Mi estado (en solo, el de la partida; en línea, mi predicción local y lo que dice el servidor). */
let me: { body: Body; hp: number; alive: boolean; inv: Slot[]; sel: number; mine: [number, number, number, number] | null } =
  { body: { x: 48, y: 40, z: 48, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: 40 }, hp: MAX_HP, alive: true, inv: [], sel: 0, mine: null };
let others: NetP[] = [];
let mobs: { id: number; kind: MobKind; x: number; y: number; z: number; yaw: number; hit: boolean; pet: boolean }[] = [];
let arrows: number[] = [];
let time = 0;
const names = new Map<string, string>();
const blocked = new Set<string>((() => { try { return JSON.parse(readStr('shooter.bloqueados') || '[]') as string[]; } catch { return []; } })());
const isBlocked = (name: string) => blocked.has(normalizeForFilter(name));
const shownName = (p: { name: string }) => (isBlocked(p.name) ? 'Jugador bloqueado' : p.name);
const fx = new Effects(scene);

// ---------- Entrada ----------
const keys = new Set<string>();
const mouse = { down: false };
let sens = Number(readStr('bloques.sensibilidad')) || 1;
let moveStick: { id: number; ox: number; oy: number; dx: number; dy: number } | null = null, lookId: number | null = null, lookX = 0, lookY = 0;
let breakTouch: number | null = null, jumpHold = 0;
const stickEl = $('stickL'), breakBtn = $('breakBtn');
const STICK_R = 50;
const locked = () => document.pointerLockElement === canvas;
let lockTried = false;
function lockPointer() {
  if (isTouch) return;
  lockTried = true;
  try { const r = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined; r?.catch?.(() => { /* sin captura: se mira arrastrando */ }); } catch { /* sin captura */ }
}
const inMenu = () => !$('inventory').hidden || !$('death').hidden || !$('verity').hidden || !$('box').hidden || paused;

addEventListener('keydown', (e) => {
  if (!playing) return;
  if (!$('verity').hidden) { if (e.code === 'Escape') closeVerity(); return; } // se está escribiendo a Verity
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (!$('inventory').hidden) { closeInventory(); return; }
    if (!$('box').hidden) { closeBox(); return; }
    if ($('death').hidden) setPaused(!paused);
    return;
  }
  if (e.code === 'KeyE' || e.code === 'KeyI') { if (!paused && $('death').hidden) toggleInventory(); return; }
  if ((e.code === 'KeyT' || e.code === 'Enter') && !inMenu()) { e.preventDefault(); openVerity(); return; }
  if (inMenu()) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  const n = Number(e.key);
  if (n >= 1 && n <= 9) chooseSlot(n - 1);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.down = false; });
addEventListener('wheel', (e) => { if (playing && !inMenu()) chooseSlot((me.sel + (e.deltaY > 0 ? 1 : HOTBAR - 1)) % HOTBAR); }, { passive: true });

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (!playing || inMenu()) return;
  if (e.pointerType === 'mouse') {
    if (!locked()) lockPointer();
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) doPlace();
    return;
  }
  if (e.clientX < innerWidth * 0.42 && !moveStick) {
    moveStick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    stickEl.style.left = `${e.clientX}px`; stickEl.style.top = `${e.clientY}px`;
    stickEl.classList.add('on');
  } else if (lookId === null) { lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; }
  try { canvas.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!playing || inMenu()) return;
  if (e.pointerType === 'mouse') {
    if (locked() || mouse.down) [yaw, pitch] = applyLook(yaw, pitch, e.movementX, e.movementY, 0.0024 * sens, 1.55);
    return;
  }
  if (moveStick && e.pointerId === moveStick.id) {
    let dx = e.clientX - moveStick.ox, dy = e.clientY - moveStick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    moveStick.dx = dx / STICK_R; moveStick.dy = dy / STICK_R;
    (stickEl.firstElementChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === lookId) {
    [yaw, pitch] = applyLook(yaw, pitch, e.clientX - lookX, e.clientY - lookY, 0.006 * sens, 1.55);
    lookX = e.clientX; lookY = e.clientY;
  }
});
function releaseTouches() {
  moveStick = null; lookId = null; breakTouch = null; mouse.down = false;
  stickEl.classList.remove('on'); (stickEl.firstElementChild as HTMLElement).style.transform = '';
  breakBtn.classList.remove('on');
}
function endPointer(e: PointerEvent) {
  if (e.pointerType === 'mouse') { if (e.button === 0) mouse.down = false; return; }
  if (moveStick?.id === e.pointerId) { moveStick = null; stickEl.classList.remove('on'); (stickEl.firstElementChild as HTMLElement).style.transform = ''; }
  if (lookId === e.pointerId) lookId = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
breakBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); breakTouch = e.pointerId; breakBtn.classList.add('on'); try { breakBtn.setPointerCapture(e.pointerId); } catch { /* */ } });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
  breakBtn.addEventListener(ev, (e) => { if ((e as PointerEvent).pointerId === breakTouch) { breakTouch = null; breakBtn.classList.remove('on'); } });
$('placeBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); doPlace(); });
$('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); jumpHold = 0.25; });
for (const b of ['breakBtn', 'placeBtn', 'jumpBtn']) $(b).addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  if (!locked() && playing && !inMenu()) setPaused(true); // al soltar el ratón con Esc se abre la pausa
});

let padPrev: boolean[] = [];
const padState = (): Gamepad | null => [...(navigator.getGamepads?.() ?? [])].find((g): g is Gamepad => !!g && g.connected) ?? null;
const DZ = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
let padPlace = false;
interface Inp { mx: number; mz: number; jump: boolean; attack: boolean; yaw: number; pitch: number }
function readInput(dt: number): Inp {
  let sx = 0, sy = 0;
  if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) sy += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) sy -= 1;
  if (moveStick) { sx = moveStick.dx; sy = moveStick.dy; }
  let attack = mouse.down || breakTouch !== null;
  jumpHold = Math.max(0, jumpHold - dt);
  let jump = keys.has('Space') || jumpHold > 0;
  const g = padState();
  if (g) {
    const lx = DZ(g.axes[0] ?? 0), ly = DZ(g.axes[1] ?? 0);
    if (lx || ly) { sx = lx; sy = ly; }
    const rx = DZ(g.axes[2] ?? 0), ry = DZ(g.axes[3] ?? 0);
    if (rx || ry) [yaw, pitch] = applyLook(yaw, pitch, rx * 900 * dt, ry * 600 * dt, 0.0035 * sens, 1.55);
    if ((g.buttons[7]?.value ?? 0) > 0.3) attack = true;
    if (g.buttons[0]?.pressed) jump = true;
  }
  const f = fpInput(yaw, sx, sy, false);
  return { mx: f.moveX, mz: f.moveZ, jump, attack, yaw, pitch };
}
function pollPad() {
  const g = padState();
  if (!g) return;
  const hit = (i: number) => !!g.buttons[i]?.pressed && !padPrev[i];
  if (playing && hit(9) && $('death').hidden) setPaused(!paused);
  else if (playing && hit(3) && !paused) toggleInventory();
  else if (playing && !inMenu()) {
    if (hit(4)) chooseSlot((me.sel + HOTBAR - 1) % HOTBAR);
    if (hit(5)) chooseSlot((me.sel + 1) % HOTBAR);
    const lt = (g.buttons[6]?.value ?? 0) > 0.3;
    if (lt && !padPlace) doPlace();
    padPlace = lt;
  } else if (!playing && !$('overlay').hidden && hit(0)) (document.querySelector<HTMLElement>('#worldList .w-play') ?? $('newWorldBtn')).click();
  padPrev = g.buttons.map((b) => b.pressed);
}

// ---------- Acciones ----------
let lastSlotChange = 0, placeSwing = 0;
function chooseSlot(i: number) {
  me.sel = i;
  lastSlotChange = performance.now();
  if (mode === 'solo' && game) selectSlot(game, myId, i);
  else net.send({ t: 'mslot', s: i });
  hudKey = '';
  showHeldName();
}
/** Bloque usable (mesa, horno, cofre) que tienes delante, mirado con el mundo propio. */
function usableAhead(): { what: 'mesa' | 'horno' | 'cofre'; x: number; y: number; z: number } | null {
  const d = lookDir(yaw, pitch);
  const hit = raycast(world, me.body.x, me.body.y + EYE, me.body.z, d[0], d[1], d[2], REACH);
  if (!hit) return null;
  const b = world.get(hit.x, hit.y, hit.z);
  if (!USABLE.has(b)) return null;
  return { what: b === B.Mesa ? 'mesa' : b === B.Cofre ? 'cofre' : 'horno', x: hit.x, y: hit.y, z: hit.z };
}
function doPlace() {
  if (!playing || inMenu() || !me.alive) return;
  // Usar una mesa, un horno o un cofre en vez de colocar algo
  const use = usableAhead();
  if (use) { placeSwing = 1; sfx.pickup(); if (use.what === 'mesa') openInventory(true); else openBox(use.what, use.x, use.y, use.z); return; }
  if (mode === 'solo' && game) {
    const p = game.players[0];
    p.input = { ...p.input, yaw, pitch };
    if (place(game, myId)) { sfx.hit(); placeSwing = 1; }
  } else {
    net.send({ t: 'min', i: [0, 0, 0, 0, Math.round(yaw * 100) / 100, Math.round(pitch * 100) / 100] });
    net.send({ t: 'mplace' });
    placeSwing = 1;
  }
}
function doCraft(r: Recipe) {
  if (mode === 'solo' && game) { if (craft(game, myId, r.id)) flushEvents(game.events.splice(0)); }
  else net.send({ t: 'mcraft', r: r.id });
}
function doSwap(a: number, b: number) {
  if (mode === 'solo' && game) moveSlot(game, myId, a, b);
  else { const s = me.inv[a]; me.inv[a] = me.inv[b]; me.inv[b] = s; net.send({ t: 'mswap', a, b }); }
  renderInventory(); hudKey = '';
}

// ---------- HUD ----------
const toastEl = $('toast'), bannerEl = $('banner'), lockHint = $('lockHint'), crosshair = $('crosshair'), hurtFlash = $('hurtFlash');
const heartsEl = $('hearts'), hotbarEl = $('hotbar'), heldNameEl = $('heldName');
let toastTimer = 0, bannerTimer = 0, heldTimer = 0;
function toast(text: string) {
  toastEl.textContent = text; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1600);
}
function banner(title: string, kicker = '', sub = '') {
  $('bannerTitle').textContent = title; $('bannerKicker').textContent = kicker; $('bannerSub').textContent = sub;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), 2600);
}
function showHeldName() {
  const s = me.inv[me.sel];
  heldNameEl.textContent = s ? itemName(s.id) : '';
  heldNameEl.classList.toggle('show', !!s);
  clearTimeout(heldTimer); heldTimer = window.setTimeout(() => heldNameEl.classList.remove('show'), 1600);
}
const heartSvg = icon('heart');
for (let i = 0; i < MAX_HP / 2; i++) {
  const h = document.createElement('span'); h.className = 'h';
  h.innerHTML = heartSvg + heartSvg.replace('class="ic"', 'class="ic full"');
  heartsEl.appendChild(h);
}
function slotHtml(s: Slot, key?: number) {
  return (key !== undefined && !isTouch ? `<span class="k">${key}</span>` : '') + (s ? `<img src="${itemIcon(s.id, atlas)}" alt="" />${s.n > 1 ? `<span class="n">${s.n}</span>` : ''}` : '');
}
let hudKey = '';
function hud() {
  const key = `${me.hp}|${me.sel}|${me.inv.map((s) => (s ? `${s.id}:${s.n}` : '')).join(',')}`;
  if (key === hudKey) return;
  hudKey = key;
  [...heartsEl.children].forEach((h, i) => {
    const v = me.hp - i * 2;
    h.className = `h${v >= 2 ? '' : v === 1 ? ' half' : ' empty'}`;
  });
  heartsEl.classList.toggle('low', me.hp > 0 && me.hp <= 6);
  heartsEl.setAttribute('aria-valuenow', String(me.hp));
  heartsEl.setAttribute('aria-label', `Vida: ${me.hp / 2} de 10 corazones`);
  hotbarEl.innerHTML = '';
  for (let i = 0; i < HOTBAR; i++) {
    const s = me.inv[i] ?? null, b = document.createElement('button');
    b.className = `slot${i === me.sel ? ' on' : ''}`;
    b.innerHTML = slotHtml(s, i + 1);
    b.setAttribute('aria-label', `Casilla ${i + 1}: ${s ? `${itemName(s.id)}${s.n > 1 ? `, ${s.n}` : ''}` : 'vacía'}`);
    b.setAttribute('aria-pressed', String(i === me.sel));
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); chooseSlot(i); });
    hotbarEl.appendChild(b);
  }
  if (!$('inventory').hidden) renderInventory();
}
const clockText = $('clockText'), clockIc = $('clockIc');
let clockKey = '';
function renderClock() {
  const night = isNight({ time });
  const k = night ? 'n' : 'd';
  if (k === clockKey) return;
  const changed = clockKey !== '';
  clockKey = k;
  clockIc.innerHTML = icon(night ? 'moon' : 'sun');
  clockText.textContent = night ? 'Noche' : 'Día';
  if (playing && changed) {
    if (night) banner('Cae la noche', 'Cuidado', 'Salen las criaturas. Refúgiate o enciende antorchas.');
    else banner('Amanece', 'Nuevo día', 'Con el sol, pedruscos y espinos se deshacen.');
  }
}
function renderMute() {
  const b = $('mute');
  b.innerHTML = icon(isMuted() ? 'volumeOff' : 'volumeOn');
  b.setAttribute('aria-label', isMuted() ? 'Activar sonido' : 'Silenciar');
  b.setAttribute('aria-pressed', String(isMuted()));
}
renderMute();
$('mute').addEventListener('click', () => { setMuted(!isMuted()); renderMute(); renderSettings(); });
$('invBtn').innerHTML = icon('backpack');
$('invBtn').addEventListener('click', () => toggleInventory());
$('placeBtn').setAttribute('aria-label', 'Colocar bloque o usar mesa, horno y cofre');
$('inviteBtn').innerHTML = icon('userPlus');
$('inviteBtn').addEventListener('click', () => { setPaused(true); $<HTMLInputElement>('inviteLink').select(); });

// ---------- Inventario y crafteo ----------
let picked: number | null = null;
function nearStations(): Set<Station> {
  if (mode === 'solo' && game) return stationsNear(game, game.players[0]);
  // En línea se calcula igual con el mundo y la posición propios (el servidor lo vuelve a comprobar)
  return stationsNear({ world } as unknown as Game, { body: me.body } as unknown as Parameters<typeof stationsNear>[1]);
}
function renderInventory() {
  const grid = $('invGrid'), hot = $('invHotbar');
  grid.innerHTML = ''; hot.innerHTML = '';
  for (let i = 0; i < SLOTS; i++) {
    const s = me.inv[i] ?? null, b = document.createElement('button');
    b.className = `slot${picked === i ? ' pick' : ''}${i === me.sel ? ' on' : ''}`;
    b.innerHTML = slotHtml(s);
    b.setAttribute('aria-label', `${i < HOTBAR ? `Barra rápida ${i + 1}` : `Mochila ${i - HOTBAR + 1}`}: ${s ? `${itemName(s.id)}${s.n > 1 ? `, ${s.n}` : ''}` : 'vacía'}`);
    b.addEventListener('click', () => {
      if (picked === null) { if (s) { picked = i; renderInventory(); } return; }
      const a = picked; picked = null;
      if (a !== i) doSwap(a, i); else renderInventory();
    });
    (i < HOTBAR ? hot : grid).appendChild(b);
  }
  const near = nearStations();
  $('stations').innerHTML = `Cerca: ${near.has('mesa') ? '<b>mesa de crafteo</b>' : 'sin mesa de crafteo'} · ${near.has('horno') ? '<b>horno</b>' : 'sin horno'}`;
  const list = $('recipes');
  list.innerHTML = '';
  const sorted = [...RECIPES].sort((a, b) => Number(!!cannotCraft(me.inv, a, near)) - Number(!!cannotCraft(me.inv, b, near)));
  for (const r of sorted) {
    const why = cannotCraft(me.inv, r, near);
    const el = document.createElement('div');
    el.className = `recipe${why ? ' off' : ''}`;
    const needs = r.needs.map(([id, n]) => `<span class="${count(me.inv, id) < n ? 'miss' : ''}"><img src="${itemIcon(id, atlas)}" alt="" />${n} ${itemName(id)}</span>`).join('');
    el.innerHTML = `<img src="${itemIcon(r.out, atlas)}" alt="" /><div><div class="t"></div><div class="needs">${needs}</div>${why ? '<div class="why"></div>' : ''}</div>`;
    el.querySelector('.t')!.textContent = `${itemName(r.out)}${r.n > 1 ? ` x${r.n}` : ''}`;
    if (why) el.querySelector('.why')!.textContent = why;
    const b = document.createElement('button');
    b.textContent = 'Fabricar';
    b.disabled = !!why;
    b.setAttribute('aria-label', `Fabricar ${itemName(r.out)}`);
    b.addEventListener('click', () => doCraft(r));
    el.appendChild(b);
    list.appendChild(el);
  }
}
function toggleInventory() { if ($('inventory').hidden) openInventory(); else closeInventory(); }
let atTable = false;
function openInventory(table = false) {
  if (!playing || !me.alive) return;
  atTable = table;
  $('invKicker').textContent = table ? 'Usando' : 'Mochila';
  $('invTitle').textContent = table ? 'Mesa de crafteo' : 'Inventario';
  picked = null;
  releaseTouches(); keys.clear();
  if (locked()) document.exitPointerLock();
  $('inventory').hidden = false;
  renderInventory();
  $('invClose').focus({ preventScroll: true });
}
function closeInventory() { $('inventory').hidden = true; picked = null; lockPointer(); }
$('invClose').addEventListener('click', closeInventory);

// ---------- Escena: personajes, criaturas, púas, selección ----------
const persons = new Map<string, Person & { heldId: number | null }>();
const mobViews = new Map<number, { c: Creature; px: number; pz: number }>();
const arrowGroup = new THREE.Group(); scene.add(arrowGroup);
// Púas que lanza el espino
const arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.5), arrowMat = new THREE.MeshStandardMaterial({ color: 0xe8e2c4, roughness: 0.6 });
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
outline.visible = false; scene.add(outline);
// Grietas al romper: 10 dibujos que se van abriendo
const crackTex = Array.from({ length: 10 }, (_, k) => {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d')!;
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(0,0,0,0.75)';
  for (let i = 0; i < (k + 1) * 9; i++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16); if (Math.hypot(x - 7.5, y - 7.5) < 2 + k * 0.8) g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
});
const cracks: THREE.Mesh[] = [];
function crackAt(i: number) {
  while (cracks.length <= i) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ map: crackTex[0], transparent: true, depthWrite: false }));
    scene.add(m); cracks.push(m);
  }
  return cracks[i];
}
function personFor(p: NetP) {
  let v = persons.get(p.id);
  if (!v) { v = Object.assign(makePerson(p.look), { heldId: null as number | null }); v.root.position.set(p.x, p.y, p.z); scene.add(v.root); persons.set(p.id, v); v.px = p.x; v.pz = p.z; }
  const text = shownName(p);
  if (v.labelText !== text) {
    if (v.label) scene.remove(v.label);
    v.label = makeLabel(text, 0x5d7a3e, isBlocked(p.name)); v.labelText = text;
    v.label.scale.multiplyScalar(0.55);
    scene.add(v.label);
  }
  if (v.heldId !== p.held) {
    v.heldId = p.held;
    v.hand.clear();
    if (p.held !== null) { const m = itemModel(p.held, atlas); m.scale.setScalar(0.45); m.position.set(0, -0.05, 0.18); v.hand.add(m); }
  }
  return v;
}
function removePerson(id: string) {
  const v = persons.get(id);
  if (!v) return;
  scene.remove(v.root); if (v.label) scene.remove(v.label);
  persons.delete(id);
}
function mobFor(id: number, kind: MobKind, x: number, y: number, z: number) {
  let v = mobViews.get(id);
  if (!v) {
    v = { c: makeCreature(kind), px: x, pz: z };
    v.c.root.position.set(x, y, z);
    scene.add(v.c.root);
    mobViews.set(id, v);
  }
  return v;
}
function clearScene() {
  for (const id of [...persons.keys()]) removePerson(id);
  for (const v of mobViews.values()) scene.remove(v.c.root);
  mobViews.clear();
  arrowGroup.clear();
  for (const c of cracks) c.visible = false;
  fx.clear();
}

// ---------- Mano en primera persona ----------
const view = new THREE.Group(); camera.add(view);
const viewArm = new THREE.Group(); viewArm.scale.setScalar(0.62); view.add(viewArm);
let viewItem: number | null | undefined, viewLook: Look | null = null, swingT = 0, bobT = 0;
const myLook: Look = 'coloso';
function setViewModel(item: number | null) {
  if (viewItem === item && viewLook === myLook) return;
  viewItem = item; viewLook = myLook;
  viewArm.clear();
  const skin = (makePerson(myLook).armR.children[0] as THREE.Mesh).material as THREE.Material;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.4), skin);
  arm.position.set(0, 0, 0.16);
  viewArm.add(arm);
  if (item !== null) {
    const m = itemModel(item, atlas);
    const isBlock = ITEMS.get(item)?.block !== undefined;
    m.scale.setScalar(isBlock ? 0.16 : 0.3);
    m.position.set(isBlock ? 0 : 0.02, isBlock ? 0.06 : 0.1, isBlock ? -0.1 : -0.12);
    if (!isBlock) m.rotation.set(0, -Math.PI / 2, 0.6); else m.rotation.set(0.3, 0.6, 0);
    viewArm.add(m);
  } else {
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.12), skin);
    fist.position.set(0, 0.01, -0.13);
    viewArm.add(fist);
  }
  view.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}

// ---------- Eventos ----------
const BLOCK_COLOR: Partial<Record<number, number>> = { [B.Hierba]: 0x66ac3e, [B.Tierra]: 0x946440, [B.Piedra]: 0x94989e, [B.Adoquin]: 0x7c7e80, [B.Tronco]: 0x6b4c2e,
  [B.Hojas]: 0x3f7a2e, [B.Tablas]: 0xa8834e, [B.Arena]: 0xdccb98, [B.Grava]: 0x7a7470, [B.Carbon]: 0x3a3a3c, [B.Hierro]: 0xd8a880, [B.Oro]: 0xfcde50, [B.Diamante]: 0x60e8e2,
  [B.Mesa]: 0x9a6a3a, [B.Antorcha]: 0xffc85a, [B.Horno]: 0x6a6a6c, [B.HornoEncendido]: 0x6a6a6c, [B.Cofre]: 0x8a6236,
  [B.LosaTablas]: 0xa8834e, [B.LosaPiedra]: 0x7c7e80,
  [B.HierbaAlta]: 0x6cb440, [B.FlorSol]: 0xffce3e, [B.FlorFuego]: 0xe84a38, [B.ArbustoBayas]: 0x3c8232 };
let shake = 0;
function flushEvents(evs: GEvent[]) {
  for (const ev of evs) {
    const mine = 'pid' in ev && ev.pid === myId;
    switch (ev.kind) {
      case 'break':
        fx.debris(ev.x + 0.5, ev.y + 0.5, ev.z + 0.5, BLOCK_COLOR[ev.b] ?? 0x888888, 10, 3.5, 0.12);
        if (mine) sfx.kill(); else sfx.hit();
        break;
      case 'place': if (!mine) sfx.hit(); break;
      case 'pickup':
        if (mine) {
          sfx.pickup();
          if (ev.item === 109 && readStr('bloques.pistaBayas') !== '1') { writeStr('bloques.pistaBayas', '1'); toast('Bayas: dáselas de día a un brincón y será tu amigo'); }
          else if (ev.item >= 100) toast(`+${ev.n} ${itemName(ev.item)}`);
        }
        break;
      case 'craft': if (mine) { sfx.wave(); toast(`Has fabricado: ${itemName(ev.item)}`); renderInventory(); } break;
      case 'hurt':
        if (mine) { sfx.hurt(); hurtFlash.classList.add('on'); setTimeout(() => hurtFlash.classList.remove('on'), 90); shake = Math.max(shake, 0.25); }
        break;
      case 'death':
        if (mine) { sfx.gameover(); showDeath(); }
        else toast(`${names.get(ev.pid) ?? 'Un jugador'} ha muerto`);
        break;
      case 'respawn': if (mine) { $('death').hidden = true; lockPointer(); } break;
      case 'swing': { const v = persons.get(ev.pid); if (v) v.swing = 1; break; }
      case 'mobHurt': sfx.hit(); break;
      case 'mobDie': fx.debris(ev.x, ev.y + 0.8, ev.z, ev.mob === 'pedrusco' ? 0x8a8c8e : ev.mob === 'espino' ? 0x3f8a3a : 0x7a4fd0, 12, 5, 0.18); fx.smoke(ev.x, ev.y + 0.5, ev.z, 4, 0x6b6b6b, 0.9, 1); sfx.kill(); break;
      case 'shoot': sfx.enemyShoot(); break;
      case 'smelt': if (Math.hypot(ev.x - me.body.x, ev.z - me.body.z) < 8) sfx.pickup(); if (!$('box').hidden) renderBox(); break;
      case 'tame':
        fx.debris(ev.x, ev.y + 0.9, ev.z, 0xff6f9c, 14, 3, 0.1);
        if (mine) { sfx.wave(); banner('Brincón amigo', 'Nuevo compañero', 'Te sigue y te defiende de las criaturas de la noche.'); }
        break;
      case 'eat': if (mine) { sfx.pickup(); toast(`Te has comido: ${itemName(ev.item).toLowerCase()}`); } break;
      case 'join': if (ev.pid !== myId && mode === 'multi') toast(`${names.get(ev.pid) ?? 'Alguien'} ha entrado en el mundo`); break;
      case 'leave': if (mode === 'multi') toast(`${names.get(ev.pid) ?? 'Alguien'} ha salido`); break;
    }
  }
}
function showDeath() {
  releaseTouches(); keys.clear();
  if (locked()) document.exitPointerLock();
  $('inventory').hidden = true; closeBox(false);
  setTimeout(() => { if (!me.alive && playing) { $('death').hidden = false; $('respawnBtn').focus(); } }, 700);
}
$('respawnBtn').addEventListener('click', () => {
  if (mode === 'solo' && game) { respawn(game, myId); flushEvents(game.events.splice(0)); syncSolo(); }
  else net.send({ t: 'mrespawn' });
  $('death').hidden = true;
  lockPointer();
});
$('deathMenu').addEventListener('click', () => { $('death').hidden = true; toTitle(); });

// ---------- Empezar y salir ----------
const overlay = $('overlay');
function beginPlaying() {
  $('lobby').hidden = true; overlay.hidden = true; $('death').hidden = true; $('inventory').hidden = true;
  document.body.classList.add('playing');
  playing = true;
  hudKey = ''; clockKey = '';
  setPaused(false);
  yaw = Math.PI; pitch = -0.1;
  last = performance.now();
  lockPointer();
  hud(); showHeldName();
}
/** Mundo guardado en el que se juega (un jugador). */
let card: WorldCard | null = null;
const worldKey = (id: string) => `bloques.mundo.${id}`;
let cards: WorldCard[] = parseCards(readStr('bloques.mundos'));
const storeCards = () => writeStr('bloques.mundos', JSON.stringify(cards));
/** Guarda la partida en el dispositivo (al pausar, al salir, al pasar a segundo plano y cada poco). */
function saveNow() {
  if (mode !== 'solo' || !game || !card) return;
  const data = saveGame(game, myId);
  if (!data) return;
  writeStr(worldKey(card.id), JSON.stringify(data));
  card.played = Date.now(); card.days = Math.floor(game.time / DAY_SECONDS);
  storeCards();
}
setInterval(() => { if (playing && !paused) saveNow(); }, 20000);
function startSolo(c: WorldCard, fresh: boolean) {
  leaveMulti();
  clearScene();
  mode = 'solo'; myId = 'p1';
  card = c;
  let saved: unknown = null;
  if (!fresh) { try { saved = JSON.parse(readStr(worldKey(c.id)) || 'null'); } catch { saved = null; } }
  game = fresh ? startWorld(c, myId) : loadGame(c, saved, myId);
  verityLog.innerHTML = '';
  loadWorld(game.world);
  syncSolo();
  beginPlaying();
  if (fresh) saveNow();
  banner(c.name, fresh ? 'Mundo nuevo' : `Día ${Math.floor(game.time / DAY_SECONDS) + 1}`, fresh ? 'Rompe un tronco para empezar. Mantén pulsado: cada bloque tarda su tiempo.' : c.peaceful ? 'Mundo tranquilo: sin criaturas.' : 'Tu mundo sigue como lo dejaste.');
}
/** Copia el estado de la partida local a lo que se dibuja. */
function syncSolo() {
  const g = game!, p = g.players[0];
  me = { body: p.body, hp: p.hp, alive: p.alive, inv: p.inv, sel: p.sel, mine: p.mine && Number.isFinite(p.mine.need) ? [p.mine.x, p.mine.y, p.mine.z, Math.min(1, p.mine.t / p.mine.need)] : null };
  others = [];
  mobs = g.mobs.map((m) => ({ id: m.id, kind: m.kind, x: m.body.x, y: m.body.y, z: m.body.z, yaw: m.yaw, hit: m.flash > 0, pet: !!m.owner }));
  arrows = g.arrows.flatMap((a) => [a.x, a.y, a.z, a.vx, a.vy, a.vz]);
  time = g.time;
}
function toTitle() {
  saveNow();
  leaveMulti();
  game = null; card = null;
  playing = false; paused = false;
  if (locked()) document.exitPointerLock();
  document.body.classList.remove('playing', 'multi');
  $('box').hidden = true; openAt = null;
  closeVerity(false);
  for (const id of ['pause', 'inventory', 'death']) $(id).hidden = true;
  clearScene();
  overlay.hidden = false;
  renderWorlds();
}

// ---------- Multijugador ----------
let hosting = false, netClosing = false, listTimer = 0, joinedWorld: { id: string; name: string } | null = null, firstSnap = false;
async function connectQuick(): Promise<boolean> {
  if (net.connected) return true;
  let timer = 0;
  const ok = await Promise.race([net.connect().then(() => true, () => false), new Promise<boolean>((r) => { timer = window.setTimeout(() => r(false), 3500); })]);
  clearTimeout(timer);
  if (!ok) { netClosing = true; net.close(); netClosing = false; }
  return ok;
}
/** Jugar: con conexión se crea un mundo público (o se entra al de la invitación); sin conexión, se juega solo. */
/** Abre un mundo en línea para jugar con amigos (o entra en el de la invitación). Sin conexión, avisa y no hace nada. */
async function playOnline() {
  unlock();
  const online = await connectQuick();
  if (!online) { toast(invitedWorld ? 'No se puede conectar con el mundo de tu amigo. Inténtalo más tarde.' : 'No hay conexión con el servidor. Crea un mundo para jugar sin conexión.'); return; }
  hosting = !invitedWorld;
  if (invitedWorld) net.send({ t: 'mjoin', world: invitedWorld });
  else net.send({ t: 'mhost' });
}
net.onJoined = () => {
  const w = net.world!;
  clearScene();
  mode = 'multi'; myId = net.you; card = null;
  joinedWorld = { id: w.id, name: w.name };
  game = null;
  verityLog.innerHTML = '';
  const wd = generate(w.seed);
  wd.applyEdits(net.edits);
  loadWorld(wd);
  const [sx, sy, sz] = spawnPoint(wd);
  me = { body: { x: sx, y: sy, z: sz, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: 0 }, hp: MAX_HP, alive: true, inv: [], sel: 0, mine: null };
  firstSnap = true;
  document.body.classList.add('multi');
  $<HTMLInputElement>('inviteLink').value = inviteLink();
  $('inviteBox').hidden = false; $('inviteBtn').hidden = false;
  const chip = $('roomChip');
  chip.hidden = false; chip.innerHTML = `${icon('globe')}<span></span>`; chip.querySelector('span')!.textContent = w.name; chip.setAttribute('aria-label', `Mundo ${w.name}`);
  $('playersHud').hidden = false;
  teamKey = '';
  if (invitedWorld) history.replaceState(null, '', location.pathname); // al recargar no vuelve a entrar sin querer
  beginPlaying();
  banner(w.name, 'Mundo público', hosting ? 'Invita a tus amigos: botón de invitar, copia el enlace y mándaselo' : 'Has entrado en el mundo de tus amigos');
  hosting = false;
};
function inviteLink() { return `${location.origin}${location.pathname}?mundo=${joinedWorld?.id ?? ''}`; }
$('copyLink').addEventListener('click', async () => {
  const input = $<HTMLInputElement>('inviteLink');
  try { await navigator.clipboard.writeText(input.value); toast('Enlace copiado. Pégalo en un mensaje a tus amigos.'); }
  catch { input.focus(); input.select(); toast('Selecciona el enlace y cópialo.'); }
});
net.onError = (msg) => {
  if (mode !== 'multi' && (hosting || invitedWorld) && $('lobby').hidden) { hosting = false; toast(msg); return; }
  if (!$('lobby').hidden) setLobbyStatus(msg, true); else toast(msg);
};
net.onNotice = (msg) => toast(msg);
net.onKicked = (msg) => { toTitle(); void openLobby(msg); };
net.onClose = () => { if (netClosing || mode !== 'multi') return; toTitle(); void openLobby('Se ha perdido la conexión con el servidor.'); };
function leaveMulti() {
  if (net.connected) { netClosing = true; net.send({ t: 'mleave' }); net.close(); netClosing = false; }
  if (mode === 'multi') { mode = 'solo'; myId = 'p1'; joinedWorld = null; }
  $('inviteBox').hidden = true; $('inviteBtn').hidden = true; $('roomChip').hidden = true; $('playersHud').hidden = true;
}
function multiFrame(dt: number, inp: Inp) {
  // Procesar todas las instantáneas recibidas (bloques y eventos no se pueden perder)
  for (const s of net.queue.splice(0)) {
    for (let i = 0; i < s.ch.length; i += 2) applyChange(s.ch[i], s.ch[i + 1]);
    for (const p of s.P) names.set(p.id, p.name);
    flushEvents(s.ev);
  }
  const s = net.snap;
  if (!s) return;
  const mine = s.P.find((p) => p.id === myId);
  if (mine) {
    if (firstSnap || !mine.alive || Math.hypot(mine.x - me.body.x, mine.y - me.body.y, mine.z - me.body.z) > 3) {
      Object.assign(me.body, { x: mine.x, y: mine.y, z: mine.z, vx: 0, vy: 0, vz: 0 }); firstSnap = false;
    }
    me.hp = mine.hp; me.mine = mine.mine;
    if (me.alive && !mine.alive) showDeath();
    if (!me.alive && mine.alive) $('death').hidden = true;
    me.alive = mine.alive;
  }
  me.inv = s.me.inv;
  if (s.me.sel !== me.sel && performance.now() - lastSlotChange > 400) me.sel = s.me.sel;
  others = s.P.filter((p) => p.id !== myId);
  mobs = [];
  for (let i = 0; i < s.M.length; i += 7) mobs.push({ id: s.M[i], kind: MOB_KINDS[s.M[i + 1]], x: s.M[i + 2], y: s.M[i + 3], z: s.M[i + 4], yaw: s.M[i + 5], hit: !!(s.M[i + 6] & 1), pet: !!(s.M[i + 6] & 2) });
  arrows = s.A;
  time = s.time;
  // Mi movimiento: predicción local con la misma física, y corrección suave hacia lo que dice el servidor
  const active = playing && !inMenu() && me.alive && !document.hidden;
  const i = active ? inp : { mx: 0, mz: 0, jump: false, attack: false, yaw, pitch };
  if (me.alive) moveBody(world, me.body, i.mx * WALK, i.mz * WALK, i.jump, dt, 0.3, 1.8);
  if (mine && me.alive) {
    const k = Math.min(1, dt * 1.2);
    me.body.x += (mine.x - me.body.x) * k; me.body.z += (mine.z - me.body.z) * k;
    if (Math.abs(mine.y - me.body.y) > 1.2) me.body.y += (mine.y - me.body.y) * k;
  }
  net.sendInput(i.mx, i.mz, i.jump, i.attack, yaw, pitch);
}

// Lista de mundos públicos
const lobbyEl = $('lobby'), lobbyStatus = $('lobbyStatus');
function setLobbyStatus(text: string, error = false) { lobbyStatus.textContent = text; lobbyStatus.classList.toggle('error', error); }
function renderRooms(rooms: WorldInfo[] | null) {
  const list = $('roomsList');
  const message = (ic: 'wifiOff' | 'users', text: string) => {
    list.innerHTML = '';
    const li = document.createElement('li'); li.className = 'empty';
    li.innerHTML = `${icon(ic)}<span></span>`; li.querySelector('span')!.textContent = text;
    list.appendChild(li);
  };
  if (!rooms) { message('wifiOff', 'Sin conexión con los servidores'); return; }
  if (!rooms.length) { message('users', 'Ahora no hay nadie jugando. Pulsa Jugar: tu mundo aparecerá aquí y podrás invitar a tus amigos con un enlace.'); return; }
  list.querySelector('.empty')?.remove();
  const ids = new Set(rooms.map((r) => r.id));
  for (const old of list.querySelectorAll<HTMLButtonElement>('.server')) if (!ids.has(old.dataset.id!)) old.parentElement!.remove();
  for (const r of rooms) {
    let b = list.querySelector<HTMLButtonElement>(`.server[data-id="${r.id}"]`);
    if (!b) {
      b = document.createElement('button'); b.className = 'server'; b.dataset.id = r.id;
      b.innerHTML = `<span class="sv-ic">${icon('blocks')}</span><span class="sv-txt"><span class="sv-name"></span><span class="sv-state"></span></span><span class="sv-count"><span class="sv-dots"></span><span class="sv-n"></span></span>`;
      b.querySelector('.sv-name')!.textContent = r.name;
      const id = r.id, name = r.name;
      b.addEventListener('click', () => { setLobbyStatus(`Entrando en ${name}`); net.send({ t: 'mjoin', world: id }); });
      const li = document.createElement('li'); li.appendChild(b); list.appendChild(li);
    }
    const full = r.players >= r.max;
    b.disabled = full; b.classList.toggle('full', full); b.classList.toggle('busy', r.players > 0);
    b.querySelector('.sv-state')!.textContent = full ? 'Mundo lleno' : 'Toca para entrar';
    b.querySelector('.sv-n')!.textContent = `${r.players}/${r.max}`;
    b.querySelector('.sv-dots')!.innerHTML = Array.from({ length: r.max }, (_, k) => `<i class="${k < r.players ? 'on' : ''}"></i>`).join('');
    b.setAttribute('aria-label', `${r.name}: ${r.players} de ${r.max} jugadores${full ? ', lleno' : ''}`);
  }
}
async function openLobby(message = '') {
  unlock();
  lobbyEl.hidden = false;
  setLobbyStatus(message || 'Conectando', !!message);
  if (await connectQuick()) {
    if (!message) setLobbyStatus('');
    net.send({ t: 'mlist' });
    clearInterval(listTimer);
    listTimer = window.setInterval(() => { if (lobbyEl.hidden || !net.connected) clearInterval(listTimer); else net.send({ t: 'mlist' }); }, 2000);
  } else { setLobbyStatus('No se puede conectar con los servidores ahora. Comprueba tu conexión a internet.', true); renderRooms(null); }
}
net.onRooms = (r) => renderRooms(r);
$('lobbyClose').addEventListener('click', () => { lobbyEl.hidden = true; clearInterval(listTimer); if (mode !== 'multi') { netClosing = true; net.close(); netClosing = false; } });
$('multiBtn').addEventListener('click', () => void openLobby());

// Equipo, bloquear y denunciar
let teamKey = '', reportPid = '';
function renderPlayers() {
  const all = [{ id: myId, name: names.get(myId) ?? 'Tú', hp: me.hp, alive: me.alive, away: paused }, ...others];
  const key = all.map((q) => `${q.id}:${q.hp}:${q.alive}:${q.away}:${isBlocked(q.name)}`).join('|');
  if (key === teamKey) return;
  teamKey = key;
  const ul = $('playersHud');
  ul.innerHTML = '';
  for (const q of all) {
    const li = document.createElement('li');
    li.className = q.alive ? '' : 'down';
    li.innerHTML = '<span class="dot"></span><span class="pn"></span><span class="ph"></span>';
    li.querySelector('.pn')!.textContent = q.id === myId ? `${q.name} (tú)` : shownName(q);
    li.querySelector('.ph')!.textContent = !q.alive ? 'Muerto' : q.away ? 'En pausa' : `${Math.ceil(q.hp / 2)} corazones`;
    ul.appendChild(li);
  }
  if (!$('pause').hidden) renderTeam();
}
function renderTeam() {
  const list = $('playersList');
  list.innerHTML = '';
  if (!others.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = `Estás solo en ${joinedWorld?.name ?? 'este mundo'}. Invita a tus amigos con el enlace de arriba.`;
    list.appendChild(li);
    return;
  }
  for (const q of others) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="dot"></span><span class="pn"></span>';
    li.querySelector('.pn')!.textContent = shownName(q);
    const isB = isBlocked(q.name);
    const bb = document.createElement('button');
    bb.className = 'ghost small'; bb.innerHTML = `${icon('ban')} ${isB ? 'Desbloquear' : 'Bloquear'}`;
    bb.setAttribute('aria-label', `${isB ? 'Desbloquear' : 'Bloquear'} a ${shownName(q)}`);
    bb.addEventListener('click', () => {
      const k = normalizeForFilter(q.name);
      if (blocked.has(k)) blocked.delete(k); else blocked.add(k);
      writeStr('shooter.bloqueados', JSON.stringify([...blocked]));
      toast(blocked.has(k) ? 'Jugador bloqueado. Ya no verás su nombre.' : 'Jugador desbloqueado');
      teamKey = ''; renderTeam();
    });
    const rb = document.createElement('button');
    rb.className = 'ghost small'; rb.innerHTML = `${icon('flag')} Denunciar`;
    rb.setAttribute('aria-label', `Denunciar a ${shownName(q)}`);
    rb.addEventListener('click', () => { reportPid = q.id; $('reportName').textContent = shownName(q); $('reportDlg').hidden = false; $('reportCancel').focus(); });
    li.append(bb, rb);
    list.appendChild(li);
  }
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#reportDlg [data-reason]'))
  b.addEventListener('click', () => { if (reportPid) net.send({ t: 'mreport', pid: reportPid }); reportPid = ''; $('reportDlg').hidden = true; });
$('reportCancel').addEventListener('click', () => { reportPid = ''; $('reportDlg').hidden = true; });

// ---------- Pausa ----------
// En un mundo compartido, el mundo solo se detiene si todos pausan. Si pausas tú solo, sigue para los demás
// y a ti no te atacan mientras estás en el menú.
function setPaused(v: boolean) {
  if (v && !playing) return;
  paused = v;
  $('pause').hidden = !v;
  const shared = mode === 'multi' && others.length > 0;
  if (mode === 'multi') net.send({ t: 'mpause', v });
  $('pauseKicker').textContent = shared ? 'El mundo sigue en marcha' : 'Partida en pausa';
  $('pauseTitle').textContent = shared ? 'Menú' : 'Pausa';
  $('pausePlayers').hidden = mode !== 'multi';
  $('pauseHelp').textContent = shared ? 'Los demás siguen jugando. Mientras estás en este menú, las criaturas no te atacan. Si todos pausáis, el mundo se detiene.'
    : isTouch ? 'El juego se pausa solo si cambias de app.' : 'Esc o P para pausar y continuar.';
  if (v && mode === 'multi') renderTeam();
  $('pauseBtn').innerHTML = icon(v ? 'play' : 'pause');
  $('pauseBtn').setAttribute('aria-label', v ? 'Continuar' : 'Pausar');
  releaseTouches(); keys.clear();
  if (v && locked()) document.exitPointerLock();
  if (v) $('resume').focus({ preventScroll: true });
  last = performance.now();
}
$('pauseBtn').innerHTML = icon('pause');
$('pauseBtn').addEventListener('click', () => setPaused(!paused));
$('resume').addEventListener('click', () => { setPaused(false); lockPointer(); });
$('quit').addEventListener('click', () => { setPaused(false); toTitle(); });
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  if (mode === 'multi') {
    if (document.hidden) { net.send({ t: 'min', i: [0, 0, 0, 0, yaw, pitch] }); net.send({ t: 'mpause', v: true }); }
    else if (playing && !paused) setPaused(true);
    return;
  }
  if (document.hidden) saveNow();
  if (document.hidden && playing) setPaused(true);
});

// ---------- Pantalla de inicio: tus mundos ----------
// Antes de jugar hay que crear un mundo. Cada mundo tiene nombre automático (nadie escribe nada) y se guarda en el dispositivo.
const fmtDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
let askDelete = '';
function renderWorlds() {
  const list = $('worldList');
  list.innerHTML = '';
  cards.sort((a, b) => b.played - a.played);
  $('worldsEmpty').hidden = cards.length > 0;
  for (const c of cards) {
    const li = document.createElement('li');
    li.className = 'world';
    if (askDelete === c.id) {
      li.classList.add('ask');
      li.innerHTML = `<p class="w-ask"></p><div class="w-actions"><button class="ghost w-no">${icon('x')} No</button><button class="ghost danger w-yes">${icon('trash')} Borrar</button></div>`;
      li.querySelector('.w-ask')!.textContent = `¿Borrar ${c.name}? No se puede deshacer.`;
      li.querySelector('.w-no')!.addEventListener('click', () => { askDelete = ''; renderWorlds(); });
      li.querySelector('.w-yes')!.addEventListener('click', () => {
        cards = cards.filter((x) => x.id !== c.id); storeCards();
        try { localStorage.removeItem(worldKey(c.id)); } catch { /* sin almacenamiento */ }
        askDelete = ''; renderWorlds(); $('newWorldBtn').focus();
      });
    } else {
      li.innerHTML = `<span class="w-ic">${icon(c.peaceful ? 'sun' : 'moon')}</span><span class="w-txt"><strong></strong><span class="w-meta"></span></span>
        <button class="btn w-del" data-icon="trash"></button><button class="primary w-play">${icon('play')} Jugar</button>`;
      li.querySelector('strong')!.textContent = c.name;
      li.querySelector('.w-meta')!.textContent = `Día ${c.days + 1} · ${c.peaceful ? 'tranquilo' : 'con criaturas'} · ${fmtDate.format(c.played)}`;
      const del = li.querySelector<HTMLElement>('.w-del')!;
      del.innerHTML = icon('trash'); del.setAttribute('aria-label', `Borrar ${c.name}`);
      del.addEventListener('click', () => { askDelete = c.id; renderWorlds(); (list.querySelector('.w-no') as HTMLElement | null)?.focus(); });
      const go = li.querySelector<HTMLElement>('.w-play')!;
      go.setAttribute('aria-label', `Jugar en ${c.name}`);
      go.addEventListener('click', () => { unlock(); startSolo(c, false); });
    }
    list.appendChild(li);
  }
  const full = cards.length >= MAX_WORLDS;
  $<HTMLButtonElement>('newWorldBtn').disabled = full;
  $('worldsFull').hidden = !full;
}
let draftName = '', draftPeaceful = false, draftOpen = false;
function renderDraft() {
  $('nwName').textContent = draftName;
  $('nwPeace').setAttribute('aria-checked', String(draftPeaceful));
  $('nwOpen').setAttribute('aria-checked', String(draftOpen));
  $('nwPeaceRow').hidden = draftOpen; // los mundos en línea siempre tienen criaturas
  $('nwNote').textContent = draftOpen ? 'Mundo en línea: aparece en la lista pública y puedes invitar con un enlace. No se guarda en tu lista.'
    : 'Se guarda en este dispositivo y puedes seguir otro día.';
}
function openNewWorld() {
  draftName = worldName(Math.random, cards.map((c) => c.name)); draftPeaceful = false; draftOpen = false;
  $('newWorld').hidden = false;
  renderDraft();
  $('nwGo').focus();
}
$('newWorldBtn').addEventListener('click', openNewWorld);
$('nwReroll').addEventListener('click', () => { draftName = worldName(Math.random, [...cards.map((c) => c.name), draftName]); renderDraft(); });
$('nwPeace').addEventListener('click', () => { draftPeaceful = !draftPeaceful; renderDraft(); });
$('nwOpen').addEventListener('click', () => { draftOpen = !draftOpen; renderDraft(); });
$('nwBack').addEventListener('click', () => { $('newWorld').hidden = true; $('newWorldBtn').focus(); });
$('newWorld').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('nwBack').click(); });
$('nwGo').addEventListener('click', () => {
  $('newWorld').hidden = true;
  if (draftOpen) { void playOnline(); return; }
  unlock();
  const c = newCard(Math.random, draftName, draftPeaceful, Date.now());
  cards.push(c); storeCards();
  startSolo(c, true);
});
$('joinInvite').addEventListener('click', () => void playOnline());
if (invitedWorld) $('joinInvite').hidden = false;
renderWorlds();

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
  renderer.shadowMap.enabled = !low; sun.castShadow = !low;
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
  $('setVision').setAttribute('aria-checked', String(nightVision));
  sensEl.value = String(sens);
  for (const b of settingsEl.querySelectorAll<HTMLButtonElement>('[data-quality]')) b.setAttribute('aria-checked', String(b.dataset.quality === settings.quality));
}
function openSettings() { renderSettings(); settingsEl.hidden = false; $('settingsClose').focus(); }
$('setSound').addEventListener('click', () => { setMuted(!isMuted()); renderMute(); renderSettings(); });
$('setShake').addEventListener('click', () => { settings.shake = !settings.shake; renderSettings(); });
$('setVision').addEventListener('click', () => { nightVision = !nightVision; writeStr('bloques.vision', nightVision ? '1' : '0'); renderSettings(); });
sensEl.addEventListener('input', () => { sens = Number(sensEl.value) || 1; writeStr('bloques.sensibilidad', String(sens)); });
for (const b of settingsEl.querySelectorAll<HTMLButtonElement>('[data-quality]')) b.addEventListener('click', () => { setQuality(b.dataset.quality as Quality); renderSettings(); });
$('settingsClose').addEventListener('click', () => { settingsEl.hidden = true; });
$('menuSettings').addEventListener('click', openSettings);
$('pauseSettings').addEventListener('click', openSettings);

// ---------- Bucle ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 80 : 72;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now(), loaded = false, mineSoundT = 0;
const tmpC = new THREE.Color(), sunDir = new THREE.Vector3();
function frame(now: number) {
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, rawDt);
  if (playing && !document.hidden && rawDt < 1) adaptQuality(rawDt);
  pollPad();
  const inp = readInput(dt);
  const active = playing && !inMenu() && me.alive && !document.hidden;

  if (mode === 'solo' && game && playing) {
    if (!paused && !document.hidden) {
      const p = game.players[0];
      p.input = active ? inp : { mx: 0, mz: 0, jump: false, attack: false, yaw, pitch };
      step(game, dt);
      for (const [i, b] of game.changes.splice(0)) applyChange(i, b);
      flushEvents(game.events.splice(0));
    }
    syncSolo();
  } else if (mode === 'multi') {
    multiFrame(Math.min(0.1, rawDt), inp);
    renderPlayers();
  } else if (!playing) time += dt * 4; // portada: el día pasa deprisa de fondo
  // Reconstruir las mallas que han cambiado (unas pocas por fotograma)
  let n = 0;
  for (const key of dirty) { if (n++ >= 4) break; dirty.delete(key); const [cx, cz] = key.split(',').map(Number); if (chunks.has(key)) buildChunk(cx, cz); }
  if (playing) streamChunks(me.body.x, me.body.z, dt); else streamChunks(titleAt[0], titleAt[2], dt);
  hud();
  renderClock();
  lockHint.hidden = isTouch || !playing || inMenu() || locked() || !lockTried;

  // Día y noche
  const sl = sunLight({ time }), ang = dayPhase({ time }) * Math.PI * 2;
  sunDir.set(Math.cos(ang) * 0.6, Math.sin(ang), 0.45).normalize();
  skyU.sun.value.copy(sunDir); skyU.night.value = 1 - sl;
  const dusk = Math.max(0, 1 - Math.abs(Math.sin(ang)) * 4);
  fogColor.copy(NIGHT_FOG).lerp(DAY_FOG, sl).lerp(DUSK, dusk * 0.3);
  skyU.top.value.copy(NIGHT_SKY).lerp(DAY_SKY, sl);
  nvU.value = nightVision ? 0.78 : 0;
  nvAmbient.intensity = nightVision ? (1 - sl) * 1.6 : 0;
  sun.intensity = 2.7 * sl; hemi.intensity = (0.22 + 0.85 * sl);
  const far = viewChunks() * CHUNK - 4; // la niebla tapa el borde de lo cargado
  (scene.fog as THREE.Fog).near = far * 0.55; (scene.fog as THREE.Fog).far = far;
  (scene.fog as THREE.Fog).color.copy(fogColor); // la niebla guarda su propia copia del color
  sun.color.copy(tmpC.setRGB(1, 0.94 - dusk * 0.2, 0.84 - dusk * 0.35));

  // Otros jugadores
  const present = new Set<string>();
  for (const p of others) {
    present.add(p.id);
    const v = personFor(p);
    const k = Math.min(1, dt * 14);
    v.root.position.x += (p.x - v.root.position.x) * k; v.root.position.y += (p.y - v.root.position.y) * k; v.root.position.z += (p.z - v.root.position.z) * k;
    const speed = Math.hypot(v.root.position.x - v.px, v.root.position.z - v.pz) / Math.max(dt, 1e-3);
    v.px = v.root.position.x; v.pz = v.root.position.z;
    v.root.rotation.y = p.yaw;
    v.head.rotation.x = -p.pitch * 0.6;
    if (p.mine) v.swing = Math.max(v.swing, 0.6); // está rompiendo algo
    animatePerson(v, Math.min(speed, 6), dt, now / 1000, !p.alive, reduceMotion.matches);
    if (v.label) { v.label.position.set(v.root.position.x, v.root.position.y + 2.3, v.root.position.z); v.label.visible = p.alive; }
  }
  for (const id of [...persons.keys()]) if (!present.has(id)) removePerson(id);
  // Monstruos
  const live = new Set<number>();
  for (const m of mobs) {
    live.add(m.id);
    const v = mobFor(m.id, m.kind, m.x, m.y, m.z);
    const root = v.c.root;
    const k = Math.min(1, dt * 14);
    root.position.x += (m.x - root.position.x) * k; root.position.y += (m.y - root.position.y) * k; root.position.z += (m.z - root.position.z) * k;
    const speed = Math.hypot(root.position.x - v.px, root.position.z - v.pz) / Math.max(dt, 1e-3);
    v.px = root.position.x; v.pz = root.position.z;
    root.rotation.y = m.yaw;
    setFriend(v.c, m.pet);
    animateCreature(v.c, Math.min(speed, 6), dt, now / 1000, m.hit, reduceMotion.matches);
  }
  for (const [id, v] of mobViews) if (!live.has(id)) { scene.remove(v.c.root); mobViews.delete(id); }
  // Flechas
  while (arrowGroup.children.length < arrows.length / 6) arrowGroup.add(new THREE.Mesh(arrowGeo, arrowMat));
  arrowGroup.children.forEach((a, i) => {
    a.visible = i < arrows.length / 6;
    if (!a.visible) return;
    const o = i * 6;
    a.position.set(arrows[o], arrows[o + 1], arrows[o + 2]);
    a.lookAt(arrows[o] + arrows[o + 3], arrows[o + 1] + arrows[o + 4], arrows[o + 2] + arrows[o + 5]);
  });
  // Grietas de los bloques que se están rompiendo (los míos y los de los demás)
  const breaking = [me.mine, ...others.map((p) => p.mine)].filter((m): m is [number, number, number, number] => !!m && playing);
  cracks.forEach((c, i) => { c.visible = i < breaking.length; });
  breaking.forEach(([x, y, z, prog], i) => {
    const c = crackAt(i);
    const ch = heightOf(world.get(x, y, z)); c.scale.y = ch;
    c.visible = true; c.position.set(x + 0.5, y + ch / 2, z + 0.5);
    (c.material as THREE.MeshBasicMaterial).map = crackTex[Math.min(9, Math.floor(prog * 10))];
  });
  if (me.mine && playing && (mineSoundT -= dt) <= 0) { mineSoundT = 0.24; sfx.hit(); }

  // Cámara en primera persona
  const moving = me.alive && Math.hypot(me.body.vx, me.body.vz) > 0.5 && me.body.onGround;
  if (moving && !reduceMotion.matches && settings.shake) bobT += dt * 10; else bobT *= 0.85;
  const bob = Math.sin(bobT) * 0.04;
  shake = Math.max(0, shake - dt * 2);
  const sk = settings.shake ? shake * 0.05 : 0;
  if (playing) {
    camera.position.set(me.body.x, me.body.y + EYE + Math.abs(bob), me.body.z);
    camera.rotation.set(pitch + (Math.random() - 0.5) * sk, yaw + Math.PI, 0);
  } else {
    // Portada: la cámara gira despacio sobre el mundo
    const a = now / 30000;
    camera.position.set(titleAt[0] + Math.cos(a) * 34, titleAt[1] + 22, titleAt[2] + Math.sin(a) * 34);
    camera.lookAt(titleAt[0], titleAt[1], titleAt[2]);
  }
  // Bloque al que miras
  const d = lookDir(yaw, pitch);
  const hit = playing && me.alive ? raycast(world, me.body.x, me.body.y + EYE, me.body.z, d[0], d[1], d[2], REACH) : null;
  outline.visible = !!hit && !inMenu();
  if (hit) { const hh = heightOf(world.get(hit.x, hit.y, hit.z)); outline.scale.y = hh; outline.position.set(hit.x + 0.5, hit.y + hh / 2, hit.z + 0.5); }
  // Mano: golpea en bucle mientras rompes, y un golpe corto al colocar
  view.visible = playing && me.alive;
  if (view.visible) {
    setViewModel(me.inv[me.sel]?.id ?? null);
    if (inp.attack && active) swingT = (swingT + dt * 3.2) % 1; else swingT = Math.max(0, swingT - dt * 4);
    placeSwing = Math.max(0, placeSwing - dt * 5);
    const sw = Math.sin(swingT * Math.PI) + Math.sin(placeSwing * Math.PI) * 0.6;
    viewArm.position.set(0.26 + Math.cos(bobT * 0.5) * 0.008 - sw * 0.08, -0.24 + bob * 0.4 + sw * 0.04, -0.62 - sw * 0.1);
    viewArm.rotation.set(0.12 - sw * 1.0, 0.18 + sw * 0.5, -sw * 0.4);
  }
  crosshair.classList.toggle('hit', !!hit);
  if (!$('box').hidden) { boxRefreshT -= dt; if (boxRefreshT <= 0) { boxRefreshT = 0.25; renderBox(); } }
  const usable = !!hit && USABLE.has(world.get(hit.x, hit.y, hit.z));
  if (usable !== placeShowsUse) { placeShowsUse = usable; $('placeBtn').innerHTML = icon(usable ? 'pointer' : 'box'); }
  fx.update(dt);

  const cx = playing ? me.body.x : titleAt[0], cz = playing ? me.body.z : titleAt[2];
  sun.target.position.set(cx, playing ? me.body.y : titleAt[1], cz);
  sun.position.copy(sun.target.position).addScaledVector(sunDir.y > 0 ? sunDir : tmpV.copy(sunDir).negate(), 80);
  sky.position.copy(camera.position);
  if (lowQuality) renderer.render(scene, camera); else composer.render();
  if (!loaded) { loaded = true; const l = $('loading'); l.classList.add('done'); setTimeout(() => l.remove(), 450); }
  requestAnimationFrame(frame);
}
const tmpV = new THREE.Vector3();

// Mundo de fondo para la portada
loadWorld(generate(20271));
const titleAt = spawnPoint(world);
time = 600 * 0.08;
requestAnimationFrame(frame);

// Para pruebas automatizadas
Object.assign(window, {
  __mode: () => mode, __me: () => me, __game: () => game, __world: () => world, __look: (y: number, p: number) => { yaw = y; pitch = p; },
  __paused: () => paused, __net: () => net, __use: () => doPlace(), __ahead: () => usableAhead(), __inMenu: () => inMenu(), __playing: () => playing, __others: () => others, __joined: () => joinedWorld, __time: () => time, __mobs: () => mobs,
});


// ---------- Verity ----------
// Entiende lo que le pides en el propio dispositivo. En la versión Artifact, lo que no entiende se lo pregunta a Claude
// (con permiso de quien juega). Al servidor solo llega la orden ("dar 10 tablas"), nunca el texto escrito.
const verityLog = $('verityLog'), verityInput = $<HTMLInputElement>('verityInput');
$('verityBtn').innerHTML = icon('sparkles');
$('verityBtn').addEventListener('click', () => openVerity());
function sayVerity(text: string, who: 'v' | 'u' | 'think' = 'v') {
  const li = document.createElement('li');
  li.className = who === 'think' ? 'v think' : who;
  li.textContent = text;
  verityLog.appendChild(li);
  verityLog.scrollTop = verityLog.scrollHeight;
  return li;
}
function openVerity() {
  if (!playing || !me.alive) return;
  releaseTouches(); keys.clear();
  if (locked()) document.exitPointerLock();
  $('verity').hidden = false;
  if (!verityLog.children.length) sayVerity('Hola, soy Verity. Pídeme cosas o pregúntame. Por ejemplo: dame 10 tablas, ¿dónde hay hierro?, hazlo de día.');
  verityInput.focus();
}
function closeVerity(relock = true) { $('verity').hidden = true; if (relock && playing) lockPointer(); }
$('verityClose').addEventListener('click', () => closeVerity());
function runCmd(c: VerityCmd) {
  if (mode === 'solo' && game) { verityCommand(game, myId, c); flushEvents(game.events.splice(0)); syncSolo(); hudKey = ''; }
  else net.send({ t: 'mcmd', c });
}
/** Comprueba una orden que llega de Claude antes de usarla (nunca confiar en lo que llega de fuera). */
function safeCmd(c: unknown): VerityCmd | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  if (o.k === 'dar' && ITEMS.has(Number(o.id))) return { k: 'dar', id: Number(o.id), n: Math.max(1, Math.min(64, Math.floor(Number(o.n)) || 1)) };
  if (o.k === 'curar' || o.k === 'dia' || o.k === 'noche' || o.k === 'superficie') return { k: o.k };
  return undefined;
}
type Sample = { json: <T>(input: string | { role: 'user' | 'assistant'; content: string }[], o?: object) => Promise<T> };
let samplePromise: Promise<Sample | null> | null = null;
const getSample = () => (samplePromise ??= (async () => {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!ARTEFACTO || !c?.use) return null;
  try { return (await c.use('sample')) as Sample | null; } catch { return null; }
})());
const aiTurns: { role: 'user' | 'assistant'; content: string }[] = [];
async function askClaude(text: string) {
  const sample = await getSample();
  if (!sample) return false;
  const thinking = sayVerity('Pensando…', 'think');
  const items = [...ITEMS.values()].map((d) => `${d.id}=${d.name}`).join(', ');
  const rules = `Eres Verity, un personaje dentro de "Bloques", un juego de supervivencia de bloques en primera persona para niños.
Hablas en español, con frases cortas y amables.
Puedes responder cualquier pregunta apta para niños y puedes hacer UNA acción del juego si el jugador la pide.
Estado: ${me.hp / 2} corazones, ${isNight({ time }) ? 'es de noche' : 'es de día'}.
Objetos (id=nombre): ${items}.
Responde SOLO con JSON: {"texto": "tu respuesta", "accion": null o una de {"k":"dar","id":número,"n":1-64} {"k":"curar"} {"k":"dia"} {"k":"noche"} {"k":"superficie"}}`;
  aiTurns.push({ role: 'user', content: text });
  while (aiTurns.length > 8) aiTurns.shift();
  try {
    const r = await sample.json<{ texto?: unknown; accion?: unknown }>([{ role: 'user', content: rules }, ...aiTurns], { modelTier: 'quick', cache: false });
    const reply = typeof r?.texto === 'string' && r.texto.trim() ? r.texto.trim().slice(0, 600) : 'No sé qué decir.';
    thinking.className = 'v'; thinking.textContent = reply;
    aiTurns.push({ role: 'assistant', content: reply });
    const c = safeCmd(r?.accion);
    if (c) runCmd(c);
  } catch (e) {
    const code = (e as { code?: string }).code;
    thinking.className = 'v';
    thinking.textContent = code === 'not_granted' ? 'Para responder a cualquier pregunta necesito tu permiso. Mientras, puedo ayudarte con cosas del juego: escribe ayuda.'
      : code === 'rate_limited' ? 'Ahora mismo no puedo pensar más. Prueba dentro de un rato.' : 'No he podido responder. Prueba otra vez.';
    aiTurns.pop();
  }
  return true;
}
$('verityForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = verityInput.value.trim();
  if (!text) return;
  verityInput.value = '';
  sayVerity(text, 'u');
  const r = verity(text, { world, x: me.body.x, y: me.body.y, z: me.body.z, yaw, time });
  if (r.understood) { sayVerity(r.text); if (r.cmd) runCmd(r.cmd); return; }
  void askClaude(text).then((done) => { if (!done) sayVerity(r.text); });
});

// ---------- Horno y cofre ----------
let openAt: { what: 'horno' | 'cofre'; x: number; y: number; z: number } | null = null;
let boxRefreshT = 0, placeShowsUse = false, boxOpenedAt = 0;
/** Lo que hay dentro del horno o cofre abierto (en solo, de la partida; en línea, lo que manda el servidor). */
function openBoxData(): Box | null {
  if (!openAt) return null;
  if (mode === 'solo' && game) return getBox(game, openAt.x, openAt.y, openAt.z);
  const b = net.snap?.box;
  return b && b.x === openAt.x && b.y === openAt.y && b.z === openAt.z ? b : null;
}
function openBox(what: 'horno' | 'cofre', x: number, y: number, z: number) {
  openAt = { what, x, y, z };
  boxOpenedAt = performance.now();
  releaseTouches(); keys.clear();
  if (locked()) document.exitPointerLock();
  if (mode === 'multi') net.send({ t: 'mopen', x, y, z });
  $('boxKicker').textContent = 'Usando';
  $('boxTitle').textContent = what === 'horno' ? 'Horno' : 'Cofre';
  $('boxHelp').textContent = what === 'horno'
    ? 'Pon arriba lo que quieras fundir (mineral de hierro u oro, adoquín, troncos, carne) y abajo combustible (carbón o madera). Funde solo, aunque cierres.'
    : 'Guarda aquí lo que no quieras llevar encima. Lo ven todos los del mundo.';
  $('furnaceUi').hidden = what !== 'horno';
  $('chestUi').hidden = what !== 'cofre';
  $('box').hidden = false;
  renderBox();
  $('boxClose').focus({ preventScroll: true });
}
function closeBox(relock = true) {
  if ($('box').hidden) return;
  $('box').hidden = true;
  if (mode === 'multi') net.send({ t: 'mclose' });
  openAt = null;
  if (relock && playing) lockPointer();
}
$('boxClose').addEventListener('click', () => closeBox());
function moveBox(op: 'put' | 'take', i: number) {
  if (!openAt) return;
  const { x, y, z } = openAt;
  if (mode === 'solo' && game) { if (boxMove(game, myId, x, y, z, op, i)) { sfx.pickup(); hudKey = ''; } else sfx.hit(); renderBox(); return; }
  net.send({ t: 'mbox', x, y, z, op, i });
  sfx.pickup();
}
function slotButton(s: Slot, label: string, onClick: () => void, dim = false) {
  const b = document.createElement('button');
  b.className = `slot${dim ? ' dim' : ''}`;
  b.innerHTML = slotHtml(s);
  b.setAttribute('aria-label', `${label}: ${s ? `${itemName(s.id)}${s.n > 1 ? `, ${s.n}` : ''}` : 'vacía'}`);
  b.addEventListener('click', onClick);
  return b;
}
function renderBox() {
  const box = openBoxData();
  if (!openAt) return;
  if (!box) {
    // En línea, lo de dentro tarda un momento en llegar del servidor; si no llega, es que alguien lo ha roto
    if (mode === 'solo' || performance.now() - boxOpenedAt > 2000) { closeBox(); toast('Ya no está'); }
    return;
  }
  if (box.kind === 'horno') {
    const put = (host: string, i: number, label: string) => { const h = $(host); h.innerHTML = ''; h.appendChild(slotButton(box.slots[i], label, () => moveBox('take', i))); };
    put('fIn', FURNACE.IN, 'Entrada'); put('fFuel', FURNACE.FUEL, 'Combustible'); put('fOut', FURNACE.OUT, 'Resultado');
    const burn = box.burnMax ? box.burn / box.burnMax : 0, prog = box.prog / SMELT_SECONDS;
    $('fBurn').style.transform = `scaleX(${burn})`; $('fProg').style.transform = `scaleX(${prog})`;
    $('fBurn').parentElement!.parentElement!.setAttribute('aria-valuenow', String(Math.round(burn * 100)));
    $('fProg').parentElement!.parentElement!.setAttribute('aria-valuenow', String(Math.round(prog * 100)));
  } else {
    const g = $('chestUi'); g.innerHTML = '';
    box.slots.forEach((s, i) => g.appendChild(slotButton(s, `Cofre ${i + 1}`, () => moveBox('take', i))));
  }
  const inv = $('boxInv'), hot = $('boxHot');
  inv.innerHTML = ''; hot.innerHTML = '';
  for (let i = 0; i < SLOTS; i++) {
    const s = me.inv[i] ?? null;
    // En el horno, lo que no se funde ni arde se ve apagado
    const dim = box.kind === 'horno' && !!s && SMELT[s.id] === undefined && FUEL[s.id] === undefined;
    (i < HOTBAR ? hot : inv).appendChild(slotButton(s, i < HOTBAR ? `Barra rápida ${i + 1}` : `Mochila ${i - HOTBAR + 1}`, () => { if (s && !dim) moveBox('put', i); else if (dim) toast('Eso no se funde ni sirve de combustible'); }, dim));
  }
}
