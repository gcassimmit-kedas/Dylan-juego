// Supermercado: escena 3D, interfaz y bucle del juego. Las reglas están en sim.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  newGame, tick, comprarPedido, costePedido, reponer, empezarTurno, siguienteDia, clienteEnCaja, CAMBIO, esMoneda, esRara, disponibles,
  abrirCaja, mejorar, cambioDebido, detrasDe, escanear, darCambio, cobrarTarjeta, MEJORAS, MEJORA_IDS, type MejoraId, type Jugador,
  horaTienda, exportar, importar,
  PRODUCTS, PRODUCT_IDS, DISPLAYS, LAYOUT, SHIFT_SECONDS,
  type GameState, type ProductId, type Customer,
} from './sim.ts';
import * as M from './models.ts';
import * as T from './textures.ts';
import { Till, tillScreenPoints } from './checkout.ts';
import { Player } from './player.ts';
import { Session, getRoom, listServers, readSkin, SERVERS, type ServerInfo, type EndReason, type Skin } from './multi.ts';
import { aplicarAccion, type Accion } from './sync.ts';
import { codigoPartida, leerCodigo } from './codigo.ts';
import { sfx, unlock, isMuted, setMuted } from './audio.ts';
import { icon, hydrateIcons } from '../ui/icons.ts';
import '../ui/pwa.ts';

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const isTouch = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = (n: number) => `RD$${n}`;
hydrateIcons();

// ---------- Partida guardada (solo en este dispositivo) ----------
const SAVE_KEY = 'super.partida';
function loadSave(): GameState | null {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? importar(JSON.parse(raw)) : null; } catch { return null; }
}
function writeSave(data: ReturnType<typeof exportar>) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* sin almacenamiento: se juega igual, sin guardar */ }
}
const save = () => { if (!isGuest() && state.fase === 'preparacion') writeSave(exportar(state)); };
let hasSave = loadSave() !== null;
let state: GameState = loadSave() ?? newGame((Math.random() * 2 ** 32) >>> 0);

// ---------- Multijugador (solo en la página publicada en claude.ai) ----------
/** Partida de dos en curso, si la hay. */
let session: Session | null = null;
/** Qué jugador soy: 0 (anfitrión o solo, caja 1) o 1 (invitado, caja 2). */
let ME: 0 | 1 = 0;
const isGuest = () => session?.role === 'guest';
/** Aspecto elegido (solo en este dispositivo): [ropa, tono de piel]. */
const SKIN_KEY = 'super.aspecto';
let mySkin: Skin = (() => { try { return readSkin(JSON.parse(localStorage.getItem(SKIN_KEY) ?? 'null')); } catch { return [0, 0] as Skin; } })();
const yo = (): Jugador => state.jugadores[ME];
const escanearSim = (p: ProductId, k: number) => escanear(state, p, k);
const darCambioSim = (v: number, k: number) => darCambio(state, v, k);
/** Invitado: el escaneo se refleja al momento y se manda al anfitrión. El billete lo elige el anfitrión. */
function guestScan(p: ProductId): ReturnType<typeof escanear> {
  const c = clienteEnCaja(state, 1);
  if (!c || c.pago) return null;
  const l = c.cesta.find((x) => x.product === p);
  if (!l || (c.pasados[p] ?? 0) >= l.qty) return null;
  c.pasados[p] = (c.pasados[p] ?? 0) + 1;
  c.escaneados++;
  session!.send({ t: 'escanear', p } as Omit<Accion, 'n'>);
  sfx.scan();
  return { escaneado: p };
}
/** Invitado: pago con tarjeta; el anfitrión lo confirma. */
function guestCard(): ReturnType<typeof darCambio> {
  const c = clienteEnCaja(state, 1);
  if (!c || !c.pago || !c.tarjeta) return null;
  session!.send({ t: 'tarjeta' } as Omit<Accion, 'n'>);
  return { ok: true, sobra: 0, propina: 0 };
}
/** Invitado: se comprueba el cambio aquí para responder al momento; el anfitrión lo confirma. */
function guestChange(v: number): ReturnType<typeof darCambio> {
  const c = clienteEnCaja(state, 1);
  if (!c || !c.pago || !Number.isInteger(v) || v < 0) return null;
  const debido = cambioDebido(c);
  if (v < debido) return { ok: false, falta: debido - v };
  if (v > c.pago) return null;
  session!.send({ t: 'cambio', v } as Omit<Accion, 'n'>);
  return { ok: true, sobra: v - debido, propina: 0 };
}

// ---------- Render ----------
const canvas = $<HTMLCanvasElement>('scene');
/** Sin WebGL 2 no hay juego: se explica en pantalla en lugar de dejarla en negro. */
function webgl2(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}
if (!webgl2()) {
  $('loading').remove();
  $('title').hidden = true;
  $('nogl').hidden = false;
  throw new Error('WebGL 2 no disponible');
}
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Si el sistema libera la GPU (app en segundo plano), se permite recuperarla al volver.
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Calidad gráfica (se adapta sola a cada dispositivo) ----------
let worldReady = false;
type Quality = 'auto' | 'alta' | 'baja';
const QUALITY_KEY = 'super.calidad';
let quality: Quality = (() => { try { const q = localStorage.getItem(QUALITY_KEY); return q === 'alta' || q === 'baja' ? q : 'auto'; } catch { return 'auto'; } })();
/** Nivel real: 2 alto, 1 medio (menos resolución), 0 bajo (sin sombras). En automático empieza alto y baja si va lento. */
let level = quality === 'baja' ? 0 : 2;
function applyLevel() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(level === 2 ? Math.min(dpr, isTouch ? 1.75 : 2) : level === 1 ? Math.min(dpr, 1.25) : Math.min(dpr, 1));
  const shadows = level > 0;
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    scene?.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
  }
  if (worldReady) fitCamera();
}
// Medición de fluidez: media de los últimos fotogramas.
let fpsTime = 0, fpsFrames = 0, fpsChecks = 0;
function watchFps(raw: number) {
  if (quality !== 'auto' || level === 0 || document.hidden || raw > 1) return; // un salto de más de 1 s es una pausa, no lentitud
  fpsTime += raw; fpsFrames++;
  if (fpsTime < 2.5) return;
  const fps = fpsFrames / fpsTime;
  fpsTime = 0; fpsFrames = 0; fpsChecks++;
  if (fpsChecks > 1 && fps < 38) { level--; applyLevel(); }
}
T.setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c9);
scene.fog = new THREE.Fog(0x9fb8c9, 40, 90);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
applyLevel();
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minPolarAngle = 0.28;
controls.maxPolarAngle = 1.18;
controls.minDistance = 6;
controls.maxDistance = 38;
controls.screenSpacePanning = false;
controls.target.set(0, 0, 0.8);
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.autoRotateSpeed = 0.35;

scene.add(new THREE.HemisphereLight(0xfffaf0, 0x6f6758, 0.8));
// "Luz de techo": una luz direccional casi vertical que da sombras suaves a muebles y clientes.
const sun = new THREE.DirectionalLight(0xfff4e2, 2.6);
sun.position.set(6, 15, 9);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 40 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun);

function fitCamera() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Distancia para que quepa la tienda entera a lo ancho (en vertical, el móvil se aleja más).
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  // En vertical se encuadra el centro de la tienda (los lados se ven girando o arrastrando con dos dedos).
  const half = camera.aspect < 1 ? 8 : 11;
  const d = THREE.MathUtils.clamp(half / Math.tan(hfov / 2), 15, 34);
  applyViewOffset();
  return d;
}
/** En modo caja el panel de abajo tapa parte de la pantalla: se centra la imagen en lo que queda visible. */
function applyViewOffset() {
  const w = innerWidth, h = innerHeight;
  const panel = till?.active ? $('till').getBoundingClientRect().height : 0;
  // Se desplaza la ventana sin cambiar el zoom: el centro de la escena queda en el centro de la zona libre.
  if (panel > 0) camera.setViewOffset(w, h, 0, panel / 2, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
function placeCamera() {
  const d = fitCamera();
  const polar = 0.82, az = 0.12;
  camera.position.set(Math.sin(polar) * Math.sin(az) * d, Math.cos(polar) * d, Math.sin(polar) * Math.cos(az) * d + controls.target.z);
  controls.update();
}
addEventListener('resize', () => { fitCamera(); till?.resize(); });

// ---------- Mundo ----------
interface DisplayView { model: M.DisplayModel; badge: THREE.Sprite; tex: THREE.CanvasTexture; shown: number }
const displays = new Map<ProductId, DisplayView>();
const hitTargets: THREE.Object3D[] = [];
let build: M.Building;
let cashier: M.Person;
let reg: M.Checkout;
/** Las dos cajas (reg es la 1). */
let regs: M.Checkout[] = [];
let tills: Till[] = [];
/** Avatar del otro jugador. */
let partner: M.Person;
let partnerLabel: THREE.Sprite;
let pcScreen: THREE.Mesh;
let store: ReturnType<typeof M.storage>;
let doors: { left: THREE.Mesh; right: THREE.Mesh; x: number; w: number };
let thumbs: Record<ProductId, string>;
let till: Till;
let ceilingGroup: THREE.Group;
/** Cámara "virtual" para la caja: en primera persona no se usan los controles orbitales. */
const tillView = { target: new THREE.Vector3(), enabled: false, autoRotate: false };

function buildWorld() {
  build = M.building();
  scene.add(build.group);
  doors = build.group.userData.doors;
  scene.add(M.ceilingDecor());
  for (const d of DISPLAYS) {
    const model = M.displayModel(d);
    scene.add(model.group);
    const tex = T.stockBadge(null, 0, 1, '');
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    badge.renderOrder = 10;
    badge.scale.set(1.1, 0.34, 1);
    badge.position.set(THREE.MathUtils.lerp(d.x, d.pick.x, 0.55), model.badgeY, THREE.MathUtils.lerp(d.z, d.pick.z, 0.55));
    badge.userData.product = d.product;
    scene.add(badge);
    displays.set(d.product, { model, badge, tex, shown: -1 });
    hitTargets.push(model.hit, badge);
  }
  regs = LAYOUT.registers.map((r, k) => {
    const m = M.checkout(r.x, r.z);
    m.hit.userData.action = 'cobrar';
    m.hit.userData.caja = k;
    scene.add(m.group); hitTargets.push(m.hit);
    return m;
  });
  reg = regs[0];
  const off = M.office(LAYOUT.computer.x, LAYOUT.computer.z);
  off.hit.userData.action = 'ordenador';
  pcScreen = off.screen;
  scene.add(off.group); hitTargets.push(off.hit);
  store = M.storage(LAYOUT.storage.x, LAYOUT.storage.z);
  store.hit.userData.action = 'almacen';
  scene.add(store.group); hitTargets.push(store.hit);
  const baskets = M.basketStack(); baskets.position.set(7.6, 0, 6.6); scene.add(baskets);
  cashier = M.playerModel(mySkin[0], mySkin[1]);
  cashier.group.position.set(LAYOUT.cashier.x, 0, LAYOUT.cashier.z);
  cashier.group.rotation.y = Math.PI;
  scene.add(cashier.group);
  ceilingGroup = M.ceiling();
  scene.add(ceilingGroup);
  tills = regs.map((r, k) => new Till({
    scene, camera, controls: tillView as unknown as OrbitControls, canvas, register: r.group, scanner: r.scanner, belt: r.belt, cashier: cashier.group,
    state: () => state, toast, onChange: () => { if (inStore) renderTill(); },
    pinpadScreen: r.pinpadScreen,
    freeHeight: () => {
      const h = innerHeight, hud = $('hud').getBoundingClientRect().bottom;
      const panel = $('till').hidden ? 170 : $('till').getBoundingClientRect().height;
      return (h - hud - panel) / h;
    },
    caja: k,
    ops: {
      // Como invitado, el escaneo y el cambio se comprueban aquí para responder al momento,
      // y se mandan al anfitrión, que es quien decide (y quien elige con qué billete se paga).
      escanear: (p) => (isGuest() ? guestScan(p) : escanearSim(p, k)),
      darCambio: (v) => (isGuest() ? guestChange(v) : darCambioSim(v, k)),
      tarjeta: () => (isGuest() ? guestCard() : cobrarTarjeta(state, k)),
    },
  }));
  till = tills[0];
  partner = M.person(919191, true);
  partner.group.visible = false;
  scene.add(partner.group);
  partnerLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('Compañero'), transparent: true }));
  partnerLabel.scale.set(0.9, 0.22, 1); partnerLabel.position.y = 2.3; // por encima de gorros y sombreros
  partner.group.add(partnerLabel);
}

/** Etiqueta flotante sobre el avatar del otro jugador. */
function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(22,28,17,0.88)'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#ffc83d'; g.fillRect(0, 58, 256, 6);
  g.fillStyle = '#f4f1e4'; g.font = "600 34px 'Oswald', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Miniaturas de los productos para el ordenador: se renderizan una vez con los mismos modelos 3D. */
function makeThumbs(): Record<ProductId, string> {
  const size = 128;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(size, size, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  sc.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.4));
  const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(2, 4, 3); sc.add(l);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  const out = {} as Record<ProductId, string>;
  const layout: Record<ProductId, [number, number][]> = {
    cereales: [[-0.07, -0.04], [0.07, 0.04]], galletas: [[-0.1, 0], [0, 0.05], [0.1, 0]], refresco: [[-0.06, 0], [0.06, 0], [0, 0.07]],
    agua: [[-0.06, 0], [0.06, 0], [0, 0.07]], leche: [[-0.05, 0], [0.05, 0], [0, 0.07]], yogur: [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]],
    queso: [[0, 0]], pan: [[0, -0.04], [0.03, 0.08]], manzanas: [[-0.05, 0], [0.05, 0], [0, 0.08], [-0.1, 0.08], [0.1, 0.08]],
    guineos: [[0, 0]], fresas: [[-0.04, -0.03], [0.05, 0.05]], uvas: [[-0.03, 0], [0.04, 0.03]],
  };
  for (const p of PRODUCT_IDS) {
    const g = new THREE.Group();
    layout[p].forEach(([x, z], i) => { const m = M.itemMesh(p); m.position.set(x, 0, z); m.rotation.y = (i - 1) * 0.15 + (p === 'pan' ? 0.4 : 0); g.add(m); });
    if (p === 'queso') { const m = M.itemMesh(p); m.position.set(0.03, 0.078, 0.02); m.rotation.y = 0.5; g.add(m); }
    sc.add(g);
    const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).length();
    const dist = s / (2 * Math.tan(THREE.MathUtils.degToRad(15))) * 0.95;
    cam.position.set(c.x + dist * 0.35, c.y + dist * 0.45, c.z + dist * 0.82); cam.lookAt(c);
    r.render(sc, cam);
    out[p] = r.domElement.toDataURL('image/png');
    sc.remove(g);
  }
  pm.dispose(); r.dispose(); r.forceContextLoss();
  return out;
}

// ---------- Clientes en escena ----------
interface CustomerView {
  p: M.Person; phase: number; bar: THREE.Sprite; barTex: THREE.CanvasTexture; barF: number;
  items: number; bag: THREE.Mesh; inBasket: THREE.Object3D[];
}
const views = new Map<number, CustomerView>();
const bagGeo = new THREE.BoxGeometry(0.3, 0.36, 0.18);
const bagMat = new THREE.MeshStandardMaterial({ color: 0xc8a272, roughness: 0.9 });

function customerView(c: Customer): CustomerView {
  const p = M.person(c.look);
  p.group.position.set(c.x, 0, c.z);
  scene.add(p.group);
  const barTex = T.patienceBar(null, 1);
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTex, transparent: true }));
  bar.scale.set(0.62, 0.12, 1); bar.position.y = 2.1; bar.renderOrder = 11; bar.visible = false;
  p.group.add(bar);
  const bag = new THREE.Mesh(bagGeo, bagMat); bag.position.set(0.3, 0.72, 0.05); bag.visible = false; bag.castShadow = true;
  p.group.add(bag);
  return { p, phase: Math.random() * 6, bar, barTex, barF: 1, items: 0, bag, inBasket: [] };
}

function addToBasket(v: CustomerView, product: ProductId, qty: number) {
  for (let i = 0; i < qty && v.inBasket.length < 8; i++) {
    const m = M.itemMesh(product);
    const k = v.inBasket.length;
    m.scale.setScalar(product === 'queso' ? 0.7 : 0.8);
    m.position.set(((k % 3) - 1) * 0.11, 0.02 + Math.floor(k / 3) * 0.06, ((Math.floor(k / 3) % 2) - 0.5) * 0.08);
    m.rotation.y = k * 0.7;
    if (product === 'pan' || product === 'refresco' || product === 'agua' || product === 'cereales') { m.rotation.z = Math.PI / 2; m.position.y += 0.05; }
    v.p.basketItems.add(m);
    v.inBasket.push(m);
  }
}

function syncCustomers(dt: number, t: number) {
  const alive = new Set<number>();
  for (const c of state.clientes) {
    alive.add(c.id);
    let v = views.get(c.id);
    if (!v) { v = customerView(c); views.set(c.id, v); }
    const g = v.p.group;
    if (isGuest()) {
      // Las fotos del anfitrión llegan unas 10 veces por segundo: se suaviza el movimiento entre ellas.
      const k = Math.min(1, dt * 12);
      if (Math.hypot(c.x - g.position.x, c.z - g.position.z) > 3) { g.position.x = c.x; g.position.z = c.z; }
      else { g.position.x += (c.x - g.position.x) * k; g.position.z += (c.z - g.position.z) * k; }
    } else { g.position.x = c.x; g.position.z = c.z; }
    // Gira suave hacia donde camina
    let dr = c.dir - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * Math.min(1, dt * 10);
    // Andar
    const walking = c.andando && c.path.length > 0;
    if (walking) v.phase += dt * 9;
    const swing = walking ? Math.sin(v.phase) * 0.55 : 0;
    v.p.legL.rotation.x = THREE.MathUtils.lerp(v.p.legL.rotation.x, swing, 0.4);
    v.p.legR.rotation.x = THREE.MathUtils.lerp(v.p.legR.rotation.x, -swing, 0.4);
    v.p.armL.rotation.x = THREE.MathUtils.lerp(v.p.armL.rotation.x, -swing * 0.8, 0.4);
    const reach = c.estado === 'cogiendo' ? -1.35 : 0;
    v.p.armR.rotation.x = THREE.MathUtils.lerp(v.p.armR.rotation.x, reach || swing * 0.3, 0.3);
    g.position.y = walking ? Math.abs(Math.sin(v.phase)) * 0.035 : 0;
    // Cesta mientras compra, bolsa al pagar
    v.p.basket.visible = c.estado !== 'entrando' && !v.bag.visible && !(till.active && c.id === state.cajas[ME].cola[0] && c.path.length === 0);
    // Paciencia en la cola
    const inQueue = c.estado === 'cola';
    v.bar.visible = inQueue;
    if (inQueue) {
      const f = c.paciencia / c.pacienciaMax;
      if (Math.abs(f - v.barF) > 0.02) { T.patienceBar(v.barTex, f); v.barF = f; }
      v.bar.position.y = 2.1 + (f < 0.25 && !reducedMotion ? Math.sin(t * 12) * 0.03 : 0);
    }
  }
  for (const [id, v] of views) if (!alive.has(id)) { scene.remove(v.p.group); v.barTex.dispose(); (v.bar.material as THREE.Material).dispose(); views.delete(id); }
}

// ---------- Efectos ----------
interface Fly { obj: THREE.Object3D; t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3; kind: 'item' | 'text' }
const flies: Fly[] = [];
function floatText(text: string, color: string, at: THREE.Vector3) {
  const [w, h] = [256, 72];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.font = "700 54px 'Oswald', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(10,12,8,0.85)'; g.strokeText(text, w / 2, h / 2);
  g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.3, 0.37, 1); s.renderOrder = 12; s.position.copy(at);
  scene.add(s);
  flies.push({ obj: s, t: 0, dur: 1.2, from: at.clone(), to: at.clone().add(new THREE.Vector3(0, 0.9, 0)), kind: 'text' });
}
function updateFlies(dt: number) {
  for (let i = flies.length - 1; i >= 0; i--) {
    const f = flies[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    if (f.kind === 'text') {
      f.obj.position.lerpVectors(f.from, f.to, 1 - (1 - k) ** 2);
      ((f.obj as THREE.Sprite).material).opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    } else {
      f.obj.position.lerpVectors(f.from, f.to, k);
      f.obj.position.y += Math.sin(k * Math.PI) * 0.25;
      f.obj.scale.setScalar(1 - k * 0.5);
    }
    if (k >= 1) {
      scene.remove(f.obj);
      if (f.kind === 'text') { const mat = (f.obj as THREE.Sprite).material; mat.map?.dispose(); mat.dispose(); }
      flies.splice(i, 1);
    }
  }
}

// ---------- Interfaz ----------
const hudMoney = $('moneyN'), hudMoneyEl = $('money'), hudRep = $('repN'), hudRepEl = $('rep'), dayN = $('dayN'), phaseChip = $('phaseChip');
const clockEl = $('clock'), clockFill = $('clockFill'), clockVal = $('clockVal');
const startBtn = $<HTMLButtonElement>('startBtn'), scanBtn = $<HTMLButtonElement>('scanBtn'), scanLbl = $('scanLbl'), queueN = $('queueN');
const shelvesBtn = $('shelvesBtn'), pcBtn = $('pcBtn');
const bannerEl = $('banner'), toastEl = $('toast');
const titleEl = $('title'), pauseEl = $('pause');
let bannerTimer = 0, toastTimer = 0, toastLock = 0;

function banner(kicker: string, title: string, sub = '', ms = 2400) {
  $('bannerKicker').textContent = kicker; $('bannerTitle').textContent = title; $('bannerSub').textContent = sub;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), ms);
}
function toast(text: string, kind: '' | 'ok' | 'bad' = '', ms = 1800) {
  toastEl.textContent = text;
  toastEl.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), ms);
}
function pulse(el: HTMLElement, cls: 'pulse' | 'spend') {
  el.classList.remove('pulse', 'spend'); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 220);
}

let shownMoney = -1;
function renderHud() {
  if (yo().dinero !== shownMoney) { hudMoney.textContent = String(yo().dinero); shownMoney = yo().dinero; }
  hudRep.textContent = String(Math.round(state.reputacion));
  hudRepEl.classList.toggle('low', state.reputacion < 30);
  hudRepEl.setAttribute('aria-label', `Reputación ${Math.round(state.reputacion)} de 100`);
  dayN.textContent = String(state.dia);
  const f = state.fase === 'turno' ? Math.min(1, state.reloj / SHIFT_SECONDS) : 0;
  clockFill.style.transform = `scaleX(${f})`;
  const { h, m } = horaTienda(state);
  clockVal.textContent = `${String(h).padStart(2, '0')}:${String(m - (m % 5)).padStart(2, '0')}`;
  clockEl.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  const closing = state.fase === 'turno' && state.reloj >= SHIFT_SECONDS;
  clockEl.classList.toggle('closing', closing);
  phaseChip.textContent = (state.fase === 'preparacion' ? 'Preparación' : state.fase === 'resumen' ? 'Cerrado' : closing ? 'Cerrando' : 'Abierto')
    + (session ? ` · Caja ${ME + 1}${session.partner ? '' : ' · esperando'}` : '');
  phaseChip.classList.toggle('open', state.fase === 'turno' && !closing);
  const turno = state.fase === 'turno';
  startBtn.hidden = state.fase !== 'preparacion'; scanBtn.hidden = !turno;
  if (turno) {
    const c = clienteEnCaja(state, ME);
    scanBtn.classList.toggle('ready', !!c);
    scanLbl.textContent = c ? 'Atender cliente' : 'Ir a la caja';
    queueN.textContent = String(state.cajas[ME].cola.length);
    queueN.hidden = state.cajas[ME].cola.length === 0;
  }
  const needs = PRODUCT_IDS.some((p) => state.estantes[p] <= PRODUCTS[p].capacidad * 0.25 && state.almacen[p] > 0);
  shelvesBtn.classList.toggle('warn', needs);
}

const shownRegister: string[] = ['', ''];
function updateWorldState() {
  for (const [p, v] of displays) {
    const n = state.estantes[p];
    if (n !== v.shown) {
      v.model.stock.show(n);
      T.stockBadge(v.tex, n, PRODUCTS[p].capacidad, PRODUCTS[p].nombre);
      v.shown = n;
    }
  }
  let boxes = 0;
  for (const p of PRODUCT_IDS) boxes += Math.ceil(state.almacen[p] / PRODUCTS[p].caja);
  store.boxes.count = Math.min(store.max, boxes);
  regs.forEach((r, k) => {
    const c = clienteEnCaja(state, k);
    let total = 0, items = 0;
    if (c) {
      for (const l of c.cesta) { const n = Math.min(l.qty, c.pasados[l.product] ?? 0); total += n * PRODUCTS[l.product].precio; items += n; }
    }
    const key = `${total}/${items}`;
    if (key !== shownRegister[k]) { T.drawRegister(r.screen, total, items); shownRegister[k] = key; }
    // Caja cerrada y mejoras a la vista
    r.closed.visible = !state.cajas[k].abierta;
    r.speaker.visible = state.cajas[k].musica;
    r.tipJar.visible = state.cajas[k].propinas;
  });
}

// ---------- Ordenador ----------
const cart: Record<ProductId, number> = Object.fromEntries(PRODUCT_IDS.map((p) => [p, 0])) as Record<ProductId, number>;
const pcRows = new Map<ProductId, { card: HTMLElement; qty: HTMLOutputElement; minus: HTMLButtonElement; plus: HTMLButtonElement; stock: HTMLElement }>();
function buildPc() {
  const body = $('pcBody');
  const mejoras = $('pcMejoras');
  body.innerHTML = '';
  for (const p of PRODUCT_IDS) {
    const d = PRODUCTS[p];
    const card = document.createElement('article');
    card.className = 'prod';
    card.innerHTML = `<img alt="" src="${thumbs[p]}" /><h3>${d.nombre}</h3>
      <div class="meta">${esRara(p) ? '<span class="tag">Difícil de conseguir</span><br />' : ''}Caja de <b>${d.caja}</b> uds. · Venta <b>${money(d.precio)}</b>/ud.<br /><span class="st"></span></div>
      <div class="row"><span class="price">${icon('coins')}${money(d.costoCaja)}<small class="help">&nbsp;/ caja</small></span>
      <div class="stepper"><button class="m" aria-label="Quitar una caja de ${d.nombre}">${icon('minus')}</button><output aria-live="polite">0</output><button class="p" aria-label="Añadir una caja de ${d.nombre}">${icon('plus')}</button></div></div>`;
    const minus = card.querySelector<HTMLButtonElement>('.m')!, plus = card.querySelector<HTMLButtonElement>('.p')!;
    minus.addEventListener('click', () => { cart[p] = Math.max(0, cart[p] - 1); sfx.click(); renderPc(); });
    plus.addEventListener('click', () => { cart[p] = Math.min(99, disponibles(state, p), cart[p] + 1); sfx.click(); renderPc(); });
    body.append(card);
    pcRows.set(p, { card, qty: card.querySelector('output')!, minus, plus, stock: card.querySelector('.st')! });
  }
  // Las mejoras van en la misma lista, debajo de los productos.
  body.append(mejoras);
}
function renderPc() {
  const total = costePedido(cart);
  for (const [p, r] of pcRows) {
    r.qty.value = String(cart[p]);
    r.minus.disabled = cart[p] === 0;
    r.card.classList.toggle('sel', cart[p] > 0);
    const disp = disponibles(state, p);
    if (cart[p] > disp) cart[p] = disp;
    r.plus.disabled = cart[p] >= disp;
    r.stock.innerHTML = `Almacén <b>${state.almacen[p]}</b> · Estante <b>${state.estantes[p]}/${PRODUCTS[p].capacidad}</b>`
      + (esRara(p) ? `<br />${disp > 0 ? `Hoy el proveedor tiene <b>${disp}</b> ${disp === 1 ? 'caja' : 'cajas'}` : 'Hoy no hay: prueba otro día'}` : '');
    r.qty.value = String(cart[p]);
  }
  const dinero = yo().dinero;
  $('pcMoney').textContent = String(dinero);
  $('pcTotal').textContent = money(total);
  const after = $('pcAfter');
  after.textContent = total === 0 ? 'Añade cajas al pedido' : total > dinero ? `Faltan ${money(total - dinero)}` : `Te quedarán ${money(dinero - total)}`;
  after.classList.toggle('bad', total > dinero);
  $<HTMLButtonElement>('pcPay').disabled = total === 0 || total > dinero;
  renderMejoras();
  $<HTMLButtonElement>('pcClear').disabled = total === 0;
}
$('pcClear').addEventListener('click', () => { for (const p of PRODUCT_IDS) cart[p] = 0; renderPc(); });
$('pcPay').addEventListener('click', () => {
  const pedido = { ...cart };
  const r = comprarPedido(state, pedido, ME);
  if (r.ok && isGuest()) session!.send({ t: 'comprar', pedido } as Omit<Accion, 'n'>);
  if (!r.ok) { sfx.error(); toast(r.motivo === 'dinero' ? 'No hay dinero suficiente' : r.motivo === 'agotado' ? 'El proveedor no tiene tantas cajas hoy' : 'El pedido está vacío', 'bad'); return; }
  for (const p of PRODUCT_IDS) cart[p] = 0;
  sfx.buy();
  pulse(hudMoneyEl, 'spend');
  toast(`Pedido pagado (${money(r.coste)}): ya está en el almacén`, 'ok', 2400);
  save();
  renderPc(); renderShelves();
});

// ---------- Estanterías ----------
const shRows = new Map<ProductId, { bar: HTMLElement; barEl: HTMLElement; txt: HTMLElement; btn: HTMLButtonElement }>();
function buildShelves() {
  const body = $('shBody');
  body.innerHTML = '';
  for (const p of PRODUCT_IDS) {
    const d = PRODUCTS[p];
    const el = document.createElement('article');
    el.className = 'prod shelf';
    el.innerHTML = `<img alt="" src="${thumbs[p]}" /><h3>${d.nombre}</h3><div class="meta"><span class="t"></span><div class="bar"><span></span></div></div>
      <div class="row"><span class="help">Venta ${money(d.precio)}/ud.</span><button class="ghost">${icon('packagePlus')}Reponer</button></div>`;
    const btn = el.querySelector<HTMLButtonElement>('button')!;
    btn.addEventListener('click', () => restock(p));
    body.append(el);
    shRows.set(p, { barEl: el.querySelector('.bar')!, bar: el.querySelector('.bar span')!, txt: el.querySelector('.t')!, btn });
  }
}
function renderShelves() {
  for (const [p, r] of shRows) {
    const d = PRODUCTS[p], n = state.estantes[p], a = state.almacen[p];
    r.txt.innerHTML = `Estante <b>${n}/${d.capacidad}</b> · Almacén <b>${a}</b>`;
    r.bar.style.transform = `scaleX(${n / d.capacidad})`;
    r.barEl.classList.toggle('low', n <= d.capacidad * 0.25);
    r.btn.disabled = n >= d.capacidad || a === 0;
    r.btn.lastChild!.textContent = n >= d.capacidad ? 'Lleno' : a === 0 ? 'Sin género' : 'Reponer';
  }
}
function restock(p: ProductId, fromScene = false): number {
  const d = PRODUCTS[p];
  const n = reponer(state, p);
  if (n > 0 && isGuest()) session!.send({ t: 'reponer', p } as Omit<Accion, 'n'>);
  if (n > 0) {
    sfx.stock();
    const v = displays.get(p)!;
    floatText(`+${n}`, '#7bd36b', v.badge.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
    if (fromScene) toast(`${d.nombre}: +${n} en la estantería`, 'ok');
    save();
  } else if (fromScene) {
    sfx.error();
    if (state.estantes[p] >= d.capacidad) toast(`${d.nombre}: la estantería ya está llena`);
    else toast(`No queda ${d.nombre.toLowerCase()} en el almacén: pídelo en el ordenador`, 'bad', 2600);
  }
  renderShelves();
  return n;
}
$('shAll').addEventListener('click', () => {
  let total = 0;
  for (const p of PRODUCT_IDS) { const n = reponer(state, p); total += n; if (n > 0 && isGuest()) session!.send({ t: 'reponer', p } as Omit<Accion, 'n'>); }
  if (total) { sfx.stock(); toast(`Repuestas ${total} unidades`, 'ok'); save(); }
  else { sfx.error(); toast('No hay nada que reponer', 'bad'); }
  renderShelves();
});

// ---------- Ventanas ----------
let openModal: HTMLElement | null = null, opener: HTMLElement | null = null;
function open(id: 'pc' | 'shelves' | 'help' | 'confirm' | 'mp' | 'skins' | 'transfer') {
  if (openModal) close();
  player?.unlock(); player?.release();
  const el = $(id);
  opener = document.activeElement as HTMLElement | null;
  if (id === 'pc') renderPc();
  if (id === 'shelves') renderShelves();
  el.hidden = false;
  openModal = el;
  el.querySelector<HTMLElement>('button:not([disabled])')?.focus();
}
function close() {
  if (!openModal) return;
  openModal.hidden = true;
  openModal = null;
  opener?.focus?.();
}
document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => b.addEventListener('click', close));
for (const id of ['pc', 'shelves', 'help', 'confirm', 'mp', 'skins', 'transfer']) $(id).addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) close(); });
pcBtn.addEventListener('click', () => open('pc'));
shelvesBtn.addEventListener('click', () => open('shelves'));

// ---------- Flujo de partida ----------
let inStore = false, paused = false, pausedByPartner = false, pauseSeen = false, lastFase = state.fase;

/** Cambios de fase que llegan por la simulación o por el otro jugador. */
function watchPhase() {
  if (!inStore) { lastFase = state.fase; return; }
  if (state.fase === lastFase) return;
  const prev = lastFase;
  lastFase = state.fase;
  if (state.fase === 'turno') {
    sfx.open();
    banner(`Día ${state.dia}`, '¡Abrimos!', session ? `Tú cobras en la caja ${ME + 1}` : 'Cobra a los clientes y vigila las estanterías');
  } else if (state.fase === 'resumen') {
    for (const t of tills) if (t.active) t.exit();
    setTimeout(showSummary, 600);
  } else if (state.fase === 'preparacion' && prev === 'resumen') {
    $('summary').hidden = true;
    save();
    prepBanner();
    startBtn.focus();
  }
}

// ---------- Mejoras de las cajas (en el ordenador) ----------
let mejorasKey = '';
function renderMejoras() {
  const el = $('pcMejoras');
  const targets = session && session.partner ? [ME, 1 - ME] : [ME];
  const key = `${targets.join()}|${state.cajas.map((k) => `${k.musica}${k.propinas}`).join()}|${yo().dinero}`;
  if (key === mejorasKey) return;
  mejorasKey = key;
  el.innerHTML = `<h3 class="pc-sub">Mejoras de las cajas</h3>` + targets.flatMap((k) => MEJORA_IDS.map((m) => {
    const d = MEJORAS[m], tiene = state.cajas[k][m];
    const para = k === ME ? 'Para tu caja' : 'Para la caja de tu compañero';
    return `<article class="prod mejora${tiene ? ' sel' : ''}"><div class="mj-ic">${icon(m === 'musica' ? 'volumeOn' : 'coins')}</div><h3>${d.nombre}</h3>
      <div class="meta"><b>${para} (caja ${k + 1})</b><br />${d.desc}</div>
      <div class="row"><span class="price">${icon('coins')}${money(d.coste)}</span>
      <button class="ghost" data-m="${m}" data-k="${k}" ${tiene || d.coste > yo().dinero ? 'disabled' : ''}>${tiene ? 'Ya la tiene' : k === ME ? 'Comprar' : 'Regalar'}</button></div></article>`;
  })).join('');
}
$('pcMejoras').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-m]');
  if (!b) return;
  const m = b.dataset.m as MejoraId, k = Number(b.dataset.k);
  const r = mejorar(state, m, k, ME);
  if (!r.ok) { sfx.error(); toast(r.motivo === 'dinero' ? 'No tienes dinero suficiente' : 'Esa caja ya tiene esa mejora', 'bad'); return; }
  if (isGuest()) session!.send({ t: 'mejorar', m, k } as Omit<Accion, 'n'>);
  sfx.buy();
  pulse(hudMoneyEl, 'spend');
  toast(k === ME ? `Tu caja tiene ahora: ${MEJORAS[m].nombre.toLowerCase()}` : `Has regalado a tu compañero: ${MEJORAS[m].nombre.toLowerCase()}`, 'ok', 2600);
  save();
  renderPc();
});

// ---------- Partida de dos: vestíbulo, anfitrión e invitado ----------
const MOTIVOS: Record<string, string> = {
  dinero: 'No tienes dinero suficiente', agotado: 'El proveedor no tiene tantas cajas hoy', ya: 'Esa caja ya tiene esa mejora',
};
const sessionHooks = {
  onPartner(present: boolean) {
    if (session?.role !== 'host') return;
    abrirCaja(state, 1, present);
    sfx.door();
    toast(present ? 'Se ha unido tu compañero: la caja 2 está abierta' : 'Tu compañero se ha ido: la caja 2 cierra', present ? 'ok' : 'bad', 3200);
    mejorasKey = '';
  },
  onAction(a: Accion): [0 | 1, string] {
    const r = aplicarAccion(state, a, 1);
    if (a.t === 'reponer' || a.t === 'comprar' || a.t === 'mejorar') save();
    return r;
  },
  onSnap(x: { ev: [number, GameState['eventos'][number]][]; res: [number, 0 | 1, string][] }) {
    for (const [, ev] of x.ev) state.eventos.push(ev);
    for (const [, ok, m] of x.res) {
      if (ok) continue;
      if (m.startsWith('falta:')) toast(`Al cambio le faltan ${money(Number(m.slice(6)))}`, 'bad', 2400);
      else if (MOTIVOS[m]) toast(MOTIVOS[m], 'bad');
    }
  },
  onEnd(reason: EndReason) {
    if (reason === 'retry') {
      // Tu amigo entró en el mismo servidor justo a la vez: se vuelve a entrar, ya como invitado.
      const sala = SERVERS.find((x) => x.nombre === session?.nombre)?.sala;
      endSession();
      if (sala) void enterServer(sala);
      return;
    }
    const msg = { 'host-gone': 'Tu compañero ha salido del servidor', full: 'Ese servidor ya tiene dos jugadores', kicked: 'El anfitrión te ha sacado del servidor', lost: 'Se ha perdido la conexión con el servidor' }[reason];
    goTitle();
    toast(msg, 'bad', 3600);
  },
};

function startSession(s: Session) {
  session = s;
  s.mySkin = mySkin;
  ME = s.me;
  till = tills[ME];
  partnerLabel.material.map?.dispose();
  partnerLabel.material.map = labelTexture(ME === 0 ? 'Jugador 2' : 'Jugador 1');
  partnerLabel.material.needsUpdate = true;
  mejorasKey = '';
  document.body.classList.add('mp');
  close();
  enterStore();
}

function endSession() {
  if (!session) return;
  const s = session;
  session = null;
  void s.leave();
  for (const t of tills) if (t.active) t.exit();
  partner.group.visible = false;
  if (s.role === 'guest') { state = loadSave() ?? newGame((Math.random() * 2 ** 32) >>> 0); resetViews(); }
  else abrirCaja(state, 1, false);
  ME = 0;
  till = tills[0];
  mejorasKey = '';
  document.body.classList.remove('mp');
}

/** Avatar del otro jugador: camina donde está; si está cobrando, aparece detrás de su caja. */
let partnerPhase = 0;
let partnerKey = '';
/** El avatar del otro se rehace con su aspecto cuando lo elige o lo cambia. */
function ensurePartnerModel(skin: Skin) {
  const key = skin.join();
  if (key === partnerKey) return;
  partnerKey = key;
  const old = partner;
  partner = M.playerModel(skin[0], skin[1]);
  partner.group.position.copy(old.group.position);
  partner.group.rotation.copy(old.group.rotation);
  partner.group.visible = old.group.visible;
  partner.group.add(partnerLabel);
  scene.remove(old.group);
  scene.add(partner.group);
}
function updatePartner(dt: number) {
  if (session) ensurePartnerModel(session.partnerSkin);
  const p = session?.partnerPos ?? null;
  partner.group.visible = !!p && inStore;
  if (!p) return;
  const k = 1 - ME;
  let x = p[0], z = p[1], yaw = p[2] + Math.PI;
  if (p[3]) { x = LAYOUT.cashiers[k].x; z = LAYOUT.cashiers[k].z; yaw = Math.PI; }
  const g = partner.group;
  const d = Math.hypot(x - g.position.x, z - g.position.z);
  if (d > 4) g.position.set(x, 0, z);
  else { const f = Math.min(1, dt * 10); g.position.x += (x - g.position.x) * f; g.position.z += (z - g.position.z) * f; }
  let dr = yaw - g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
  g.rotation.y += dr * Math.min(1, dt * 10);
  const walking = d > 0.02 && !p[3];
  if (walking) partnerPhase += dt * 9;
  const sw = walking ? Math.sin(partnerPhase) * 0.5 : 0;
  partner.legL.rotation.x = sw; partner.legR.rotation.x = -sw;
  partner.armL.rotation.x = -sw * 0.7; partner.armR.rotation.x = p[3] ? -0.9 : sw * 0.7;
}

// Servidores (lista fija)
const mpStatus = $('mpStatus'), mpList = $('mpList');
let lobbyTimer = 0;
let lobbyKey = '';
let entering = false;
function renderLobby(servers: ServerInfo[]) {
  // Solo se redibuja si cambia algo: así un toque en "Entrar" nunca cae justo en un redibujado.
  const key = JSON.stringify(servers) + entering;
  if (key === lobbyKey) return;
  lobbyKey = key;
  // Primero los que tienen a alguien esperando (ahí está tu amigo), luego los vacíos y al final los llenos.
  const orden = (n: number) => (n === 1 ? 0 : n === 0 ? 1 : 2);
  mpList.innerHTML = [...servers].sort((a, b) => orden(a.n) - orden(b.n) || a.sala.localeCompare(b.sala, 'es', { numeric: true })).map((s) => {
    const estado = s.n === 0 ? 'Vacío: entra y espera a tu amigo' : s.n === 1 ? `1 jugador esperando · Día ${s.dia}` : `Lleno · Día ${s.dia}`;
    return `<li class="srv n${s.n}"><span class="dot" aria-hidden="true"></span><div><strong>${s.nombre}</strong><span>${estado}</span></div>
      <button class="${s.n === 1 ? 'primary' : 'ghost'}" data-sala="${s.sala}" ${s.n === 2 || entering ? 'disabled' : ''} aria-label="Entrar en ${s.nombre}">${icon('logIn')}${s.n === 1 ? 'Unirse' : 'Entrar'}</button></li>`;
  }).join('');
}
mpList.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-sala]');
  if (b && !b.disabled) void enterServer(b.dataset.sala!);
});
/** El botón se ve siempre que la página está dentro de claude.ai (en la app no existe `window.claude`). */
const hasClaude = !!(window as unknown as { claude?: { use?: unknown } }).claude?.use;
$('mpBtn').hidden = !hasClaude;
async function openLobby() {
  $('mpSkinName').textContent = M.SKINS[mySkin[0]].nombre;
  mpStatus.textContent = 'Conectando...';
  mpList.innerHTML = '';
  lobbyKey = '';
  open('mp');
  const room = await getRoom();
  if ($('mp').hidden) return;
  if (!room) {
    // Sin canal no hay multijugador: se explica en lugar de dejar el botón sin hacer nada.
    mpStatus.textContent = 'El multijugador no está disponible aquí. Abre el juego dentro de claude.ai con tu sesión iniciada (no como página aparte ni con un enlace público) y vuelve a intentarlo.';
    return;
  }
  mpStatus.textContent = '';
  const refresh = () => { if (!$('mp').hidden) renderLobby(listServers(room.peers())); else clearInterval(lobbyTimer); };
  refresh();
  clearInterval(lobbyTimer);
  lobbyTimer = window.setInterval(refresh, 1000);
}
$('mpBtn').addEventListener('click', () => void openLobby());

/** Entra en un servidor: si está vacío, la partida es la tuya; si tu amigo ya está, te unes a la suya. */
async function enterServer(sala: string) {
  const room = await getRoom();
  if (!room || session || entering) return;
  const nombre = SERVERS.find((s) => s.sala === sala)?.nombre ?? 'el servidor';
  entering = true;
  lobbyKey = '';
  mpStatus.textContent = `Entrando en ${nombre}...`;
  const mine = state;
  let guest = false;
  try {
    const s = await Session.enter(room, sala, sessionHooks, () => state, () => {
      // Invitado: se dibuja la tienda del anfitrión; tu partida guardada no se toca.
      guest = true;
      state = newGame(1);
      resetViews();
    });
    startSession(s);
    toast(s.role === 'host' ? `Estás en ${s.nombre}. Cuando tu amigo entre en el mismo servidor, jugaréis juntos.` : `Te has unido a tu amigo en ${s.nombre}: tú cobras en la caja 2`, 'ok', 4600);
  } catch (e) {
    if (guest) { state = mine; resetViews(); }
    mpStatus.textContent = (e as Error).message === 'full' ? `${nombre} ya tiene dos jugadores: elige otro.` : `No se pudo entrar en ${nombre}. Inténtalo de nuevo.`;
  } finally {
    entering = false;
    lobbyKey = '';
  }
}

function renderTitle() {
  $('playLbl').textContent = hasSave ? `Continuar · Día ${state.dia}` : 'Jugar';
  $('newBtn').hidden = !hasSave;
  $('recDay').textContent = String(state.dia);
  $('recMoney').textContent = money(state.jugadores[0].dinero);
  $('recBest').textContent = money(Math.max(0, state.mejorDia));
}
function enterStore() {
  unlock();
  titleEl.hidden = true;
  inStore = true;
  document.body.classList.add('instore', 'fp');
  controls.autoRotate = false;
  controls.enabled = false;
  camera.fov = 70;
  camera.clearViewOffset();
  fitCamera();
  lastFase = state.fase;
  // El segundo jugador aparece justo detrás del primero, mirando hacia el mismo lado.
  const host = ME === 1 ? session?.partnerPos : null;
  if (host) { const p = detrasDe(host[3] ? LAYOUT.cashiers[0].x : host[0], host[3] ? LAYOUT.cashiers[0].z : host[1], host[3] ? 0 : host[2]); player.place(p.x, p.z, host[3] ? 0 : host[2]); }
  else player.place(0.5, 4.2, 0);
  player.enabled = true;
  prepBanner();
  toast(isTouch ? 'Joystick a la izquierda para andar · arrastra a la derecha para mirar' : 'Haz clic para mirar con el ratón (L o Esc lo suelta) · WASD para andar', '', 4200);
  startBtn.focus();
}
function prepBanner() {
  const empty = PRODUCT_IDS.filter((p) => state.estantes[p] === 0).length;
  banner(`Día ${state.dia}`, 'Prepara la tienda', empty ? `Hay ${empty} estanterías vacías: repón o haz un pedido` : 'Cuando lo tengas todo listo, empieza el turno', 3200);
}
function goTitle() {
  close();
  endSession();
  setPaused(false);
  inStore = false;
  player.enabled = false;
  player.unlock();
  player.release();
  document.body.classList.remove('instore', 'fp');
  camera.fov = 42;
  controls.enabled = true;
  placeCamera();
  hasSave = loadSave() !== null;
  renderTitle();
  titleEl.hidden = false;
  controls.autoRotate = !reducedMotion;
  $('playBtn').focus();
}
$('playBtn').addEventListener('click', enterStore);
$('helpBtn').addEventListener('click', () => open('help'));
$('newBtn').addEventListener('click', () => open('confirm'));
$('cfYes').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nada */ }
  state = newGame((Math.random() * 2 ** 32) >>> 0);
  resetViews();
  hasSave = false;
  close();
  renderTitle();
  enterStore();
});
$('helpKeys').textContent = isTouch
  ? 'Juegas en primera persona. Joystick en la mitad izquierda para andar, arrastra en la derecha para mirar. Apunta con el punto del centro y pulsa el botón amarillo para usar lo que miras. En la caja, arrastra los productos al escáner.'
  : 'Juegas en primera persona. WASD o flechas para andar (Mayús corre). Haz clic para mirar con el ratón; L o Esc lo sueltan. Apunta con el punto del centro y pulsa E o haz clic para usar lo que miras. Intro empieza el turno y P pausa. En la caja: Espacio pasa un producto, 1-7 sacan dinero, Retroceso deshace e Intro da el cambio.';

startBtn.addEventListener('click', () => {
  if (state.fase !== 'preparacion') return;
  if (isGuest()) { session!.send({ t: 'empezar' } as Omit<Accion, 'n'>); return; }
  writeSave(exportar(state));
  empezarTurno(state);
});
function doScan() {
  if (state.fase !== 'turno' || paused) return;
  close();
  till.enter();
}
scanBtn.addEventListener('click', doScan);

// ---------- Panel de la caja ----------
const tillEl = $('till'), tillMsg = $('tillMsg'), tillCount = $('tillCount'), tillPay = $('tillPay');
const tGive = $<HTMLButtonElement>('tGive'), tUndo = $<HTMLButtonElement>('tUndo');
$('tDens').innerHTML = CAMBIO.map((v, i) => `<button class="den d${v}" data-den="${v}" aria-label="Sacar ${esMoneda(v) ? `una moneda de ${v} pesos` : `un billete de ${v} pesos`}" title="${i + 1}">${icon(esMoneda(v) ? 'coins' : 'banknote')}${v}</button>`).join('');
$('tDens').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-den]'); if (b) till.addChange(Number(b.dataset.den)); });
tUndo.addEventListener('click', () => till.undoChange());
tGive.addEventListener('click', () => till.giveChange());
$('tExit').addEventListener('click', () => till.exit());
let tillShown = false, lastPanelH = 0;
function renderTill() {
  const on = till.active && !till.isLeaving;
  if (on !== tillShown) {
    tillShown = on;
    tillEl.hidden = !on;
    document.body.classList.toggle('attill', on);
    lastPanelH = -1;
    if (!on && inStore && state.fase === 'turno') scanBtn.focus();
  }
  if (!on) { if (lastPanelH !== 0) { lastPanelH = 0; applyViewOffset(); } return; }
  const ph = Math.round(tillEl.getBoundingClientRect().height);
  if (ph !== lastPanelH) { lastPanelH = ph; applyViewOffset(); till.resize(); }
  const i = till.info();
  tillPay.hidden = i.phase !== 'pago';
  if (i.phase === 'escaneo') {
    tillMsg.textContent = 'Arrastra cada producto de la cinta hasta el escáner.';
    tillCount.textContent = `${i.scanned}/${i.total} · ${money(i.sub)}`;
  } else if (i.phase === 'pago') {
    const vuelta = i.paid - i.due, llevas = till.changeTotal;
    tillPay.classList.toggle('card', i.tarjeta);
    tillCount.textContent = '';
    $('tTotal').textContent = money(i.due);
    if (i.tarjeta) {
      tillMsg.textContent = `Paga con tarjeta: cóbrale ${money(i.due)} en el datáfono.`;
      $('tPaid').textContent = 'Tarjeta';
      tGive.lastChild!.textContent = 'Cobrar con tarjeta';
    } else {
      tillMsg.textContent = vuelta === 0 ? 'Paga con el importe justo: no hay que dar cambio.'
        : llevas === vuelta ? '¡Justo! Pulsa Dar cambio.' : llevas > vuelta ? `Te has pasado ${money(llevas - vuelta)}: quita algo con Deshacer.` : `Saca del cajón ${money(vuelta - llevas)} más.`;
      $('tPaid').textContent = money(i.paid);
      $('tDue').textContent = money(vuelta);
      $('tChange').textContent = money(llevas);
      $('tChangeBox').classList.toggle('ok', llevas === vuelta);
      $('tChangeBox').classList.toggle('over', llevas > vuelta);
      tGive.lastChild!.textContent = 'Dar cambio';
    }
    tUndo.disabled = till.change.length === 0;
  } else {
    const n = state.cajas[ME].cola.length;
    tillMsg.textContent = n ? 'El siguiente cliente está llegando a la caja.' : state.reloj >= SHIFT_SECONDS ? 'No queda nadie: la tienda está cerrada.' : 'No hay nadie en la cola.';
    tillCount.textContent = n ? `${n} en cola` : '';
  }
}

function showSummary() {
  if (!$('summary').hidden) return;
  const s = state.stats, j = yo();
  const profit = j.ingresos - j.gastos;
  $('sumDay').textContent = String(state.dia);
  $('sClients').textContent = String(s.clientes);
  $('sServed').textContent = String(s.atendidos);
  $('sLost').textContent = String(s.perdidos);
  $('sItems').textContent = String(s.articulos);
  $('sIncome').textContent = money(j.ingresos);
  $('sCost').textContent = money(j.gastos);
  const pe = $('sProfit');
  pe.textContent = (profit < 0 ? '-' : '') + money(Math.abs(profit));
  pe.classList.toggle('neg', profit < 0);
  $('sumRecord').hidden = !(profit > 0 && profit >= state.mejorDia);
  const tips: string[] = [];
  if (s.faltas > 0) tips.push(`${s.faltas === 1 ? 'Una vez' : `${s.faltas} veces`} un cliente no encontró lo que buscaba: compra más género en el ordenador.`);
  if (j.cambioDeMas > 0) tips.push(`Diste ${money(j.cambioDeMas)} de más en cambios.`);
  if (session) tips.push(`Tu compañero ganó ${money(state.jugadores[1 - ME].ingresos)} hoy.`);
  if (s.cansados > 0) tips.push('Hubo clientes que se cansaron de esperar en la caja: cóbrales más rápido.');
  $('sumTip').textContent = tips.length ? tips.join(' ') : 'Día perfecto: todos los clientes se fueron contentos.';
  close();
  $('summary').hidden = false;
  $('nextBtn').focus();
  if (isGuest()) return; // la partida es del anfitrión: el invitado no guarda
  // Se guarda ya el día siguiente: si se cierra la app aquí, no se pierde lo ganado.
  const sv = exportar(state); sv.dia = state.dia + 1;
  writeSave(sv);
  hasSave = true;
}
$('nextBtn').addEventListener('click', () => {
  if (isGuest()) { session!.send({ t: 'siguiente' } as Omit<Accion, 'n'>); return; }
  siguienteDia(state);
});

// Pausa
const pauseBtn = $('pauseBtn');
function setPaused(v: boolean, remote = false) {
  // En multijugador la pausa es de los dos: se avisa al otro (salvo si la pidió él).
  if (session && !remote && v !== paused) { session.setPause(v); session.pump(performance.now(), v); }
  pausedByPartner = v && remote;
  paused = v;
  $('pauseKicker').textContent = pausedByPartner ? 'Tu compañero ha pausado' : 'Juego en pausa';
  $('kickBtn').hidden = !(session?.role === 'host' && session.partner);
  pauseEl.hidden = !v;
  pauseBtn.innerHTML = icon(v ? 'play' : 'pause');
  pauseBtn.setAttribute('aria-label', v ? 'Continuar' : 'Pausar');
  $('quitHelp').textContent = isGuest() ? 'Saldrás de la partida de tu compañero.'
    : session ? 'Se cerrará la partida para tu compañero.'
    : state.fase === 'turno' ? 'Si sales ahora, el turno en curso no se guardará.' : 'La tienda queda guardada en este dispositivo.';
  if (v) { close(); player.unlock(); player.release(); $('resumeBtn').focus(); }
  else if (till?.active) applyViewOffset();
}
pauseBtn.innerHTML = icon('pause');
pauseBtn.addEventListener('click', () => setPaused(!paused));
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('quitBtn').addEventListener('click', () => {
  if (!isGuest() && state.fase === 'turno') { state = loadSave() ?? newGame(); resetViews(); }
  goTitle();
});
$('kickBtn').addEventListener('click', () => { session?.kick(); setPaused(false); toast('Has sacado a tu compañero de la partida'); });
// Ciclo de vida: al pasar a segundo plano el turno se pausa solo.
document.addEventListener('visibilitychange', () => { if (document.hidden && inStore && state.fase === 'turno' && !paused) setPaused(true); });

// Ajuste de gráficos (menú de pausa)
const qualityLbl = $('qualityLbl');
const QUALITY_NAME: Record<Quality, string> = { auto: 'automático', alta: 'alta', baja: 'baja' };
function renderQuality() { qualityLbl.textContent = `Gráficos: ${QUALITY_NAME[quality]}`; }
$('qualityBtn').addEventListener('click', () => {
  quality = quality === 'auto' ? 'alta' : quality === 'alta' ? 'baja' : 'auto';
  try { localStorage.setItem(QUALITY_KEY, quality); } catch { /* sin almacenamiento */ }
  level = quality === 'baja' ? 0 : 2;
  fpsTime = 0; fpsFrames = 0; fpsChecks = 0;
  applyLevel();
  renderQuality();
});
renderQuality();

// Pantalla completa, donde el dispositivo lo permite (en iPhone no existe).
const fsBtn = $<HTMLButtonElement>('fsBtn');
const doc = document as Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
const fsEnabled = !!(document.fullscreenEnabled || doc.webkitFullscreenEnabled);
const fsActive = () => !!(document.fullscreenElement || doc.webkitFullscreenElement);
function renderFs() {
  fsBtn.innerHTML = icon(fsActive() ? 'minimize' : 'maximize');
  fsBtn.setAttribute('aria-label', fsActive() ? 'Salir de pantalla completa' : 'Pantalla completa');
  fsBtn.title = fsBtn.getAttribute('aria-label')!;
}
fsBtn.hidden = !fsEnabled;
fsBtn.addEventListener('click', async () => {
  try {
    if (fsActive()) await (document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.());
    else {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      await (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.());
    }
  } catch { toast('Este dispositivo no permite la pantalla completa aquí'); }
  renderFs();
});
document.addEventListener('fullscreenchange', renderFs);
document.addEventListener('webkitfullscreenchange', renderFs);
renderFs();

const muteBtn = $('mute');
function renderMute() {
  muteBtn.innerHTML = icon(isMuted() ? 'volumeOff' : 'volumeOn');
  muteBtn.setAttribute('aria-label', isMuted() ? 'Activar sonido' : 'Silenciar');
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
}
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); renderMute(); });
renderMute();

function resetViews() {
  if (till.active) till.exit();
  for (const v of views.values()) scene.remove(v.p.group);
  views.clear();
  for (const v of displays.values()) v.shown = -1;
  shownMoney = -1;
  for (const p of PRODUCT_IDS) cart[p] = 0;
}

// Teclado
addEventListener('keydown', (e) => {
  if (!inStore) return;
  const k = e.key.toLowerCase();
  // El Esc que suelta el ratón fijado lo gestiona el navegador: no debe abrir la pausa.
  if (k === 'escape' && performance.now() - player.unlockedAt < 400 && !openModal) return;
  if (k === 'escape') { if (openModal) close(); else if (!$('summary').hidden) return; else if (till.active && !paused) till.exit(); else setPaused(!paused); e.preventDefault(); return; }
  if (paused || !$('summary').hidden) return;
  if (k === 'p') { setPaused(true); return; }
  if (openModal) return;
  if (till.active) {
    // Teclado en la caja: Espacio pasa el primer producto; 1-7 sacan dinero; Retroceso deshace; Intro da el cambio.
    if (k === ' ') { e.preventDefault(); till.scanNext(); }
    else if (/^[1-7]$/.test(k)) till.addChange(CAMBIO[Number(k) - 1]);
    else if (k === 'backspace') { e.preventDefault(); till.undoChange(); }
    else if (k === 'enter' && document.activeElement === document.body) till.giveChange();
    return;
  }
  if (k === 'e') { const o = aimAt(null, null); if (o) act(o); }
  else if (k === 'enter' && state.fase === 'preparacion' && document.activeElement === document.body) startBtn.click();
});

// Tocar la escena: muebles reponen, la caja cobra, el ordenador abre los pedidos.
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down: { x: number; y: number; t: number } | null = null;
function pick(e: PointerEvent): THREE.Object3D | null {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(hitTargets, false)[0]?.object ?? null;
}
canvas.addEventListener('pointerdown', (e) => {
  if (till.active) { down = null; if (!paused) till.pointerDown(e); return; }
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (till.active) { till.pointerUp(); return; }
  if (player.enabled) return;
  if (!down || !inStore || paused) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 10 || dt > 600) return;
  const o = pick(e);
  if (!o) return;
  if (o.userData.product) restock(o.userData.product as ProductId, true);
  else if (o.userData.action === 'cobrar') { if (state.fase === 'turno') doScan(); else toast('La caja se abre al empezar el turno'); }
  else if (o.userData.action === 'ordenador') open('pc');
  else if (o.userData.action === 'almacen') open('shelves');
});
canvas.addEventListener('pointercancel', () => { if (till.active) till.pointerUp(); });
canvas.addEventListener('pointermove', (e) => {
  if (till.active) { if (!paused) till.pointerMove(e); return; }
  if (isTouch || !inStore || e.buttons || player.enabled) return;
  canvas.style.cursor = pick(e) ? 'pointer' : '';
});

// ---------- Primera persona ----------
const REACH = 3.2;
/** Lo que hay en el punto de mira (o en el punto tocado) a menos de un brazo y pico. */
function aimAt(x: number | null, y: number | null): THREE.Object3D | null {
  if (x === null || y === null) ndc.set(0, 0); else ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.far = REACH;
  const hit = ray.intersectObjects(hitTargets, false)[0]?.object ?? null;
  ray.far = Infinity;
  return hit;
}
function act(o: THREE.Object3D) {
  if (o.userData.product) { restock(o.userData.product as ProductId, true); return; }
  const a = o.userData.action;
  if (a === 'cobrar') {
    const k = o.userData.caja as number;
    if (k !== ME) { toast(session ? 'Esa es la caja de tu compañero: tú cobras en la tuya' : 'La caja 2 se abre cuando juegan dos personas'); return; }
    if (state.fase !== 'turno') { toast('La caja se abre al empezar el turno'); return; }
    player.unlock(); player.release();
    // La caja arranca desde donde mira el jugador y vuelve ahí al salir.
    tillView.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
    camera.up.set(0, 1, 0);
    till.enter();
  } else if (a === 'ordenador') open('pc');
  else if (a === 'almacen') open('shelves');
}
function describe(o: THREE.Object3D): string {
  if (o.userData.product) {
    const p = o.userData.product as ProductId, d = PRODUCTS[p];
    return `Reponer ${d.nombre.toLowerCase()} · ${state.estantes[p]}/${d.capacidad} · almacén ${state.almacen[p]}`;
  }
  const a = o.userData.action;
  if (a === 'cobrar') {
    const k = o.userData.caja as number;
    if (k !== ME) return session ? `Caja ${k + 1}: la de tu compañero` : 'Caja 2 (cerrada: se abre cuando juegan dos)';
    const n = state.cajas[ME].cola.length;
    return state.fase === 'turno' ? (n ? `Atender tu caja · ${n} en cola` : 'Atender tu caja') : `Caja ${ME + 1} (se abre al empezar el turno)`;
  }
  if (a === 'ordenador') return 'Hacer pedidos en el ordenador';
  return 'Ver el almacén';
}
const aimEl = $('aim'), promptEl = $('prompt'), promptText = $('promptText'), actBtn = $<HTMLButtonElement>('actBtn'), actLbl = $('actLbl');
let aimed: THREE.Object3D | null = null, aimedText = '';
function updateAim() {
  const o = player.enabled && canAct() ? aimAt(null, null) : null;
  aimed = o;
  aimEl.classList.toggle('on', !!o);
  const text = o ? describe(o) : '';
  if (text !== aimedText) {
    aimedText = text;
    promptEl.hidden = !o;
    promptText.textContent = text;
    actBtn.hidden = !o || !isTouch;
    if (o) actLbl.textContent = o.userData.product ? 'Reponer' : o.userData.action === 'cobrar' ? 'Atender' : o.userData.action === 'ordenador' ? 'Ordenador' : 'Almacén';
  }
}
actBtn.addEventListener('click', () => { if (aimed) act(aimed); });
function canAct() { return inStore && !paused && !openModal && $('summary').hidden && !till.active; }
const player = new Player({
  canvas, camera, canAct,
  onInteract: (x, y) => { const o = aimAt(x, y); if (o) act(o); },
});
if (isTouch) document.body.classList.add('touch');

// Límites de la cámara: siempre mirando a la tienda.
controls.addEventListener('change', () => {
  const t = controls.target;
  t.x = THREE.MathUtils.clamp(t.x, -8, 8); t.z = THREE.MathUtils.clamp(t.z, -6, 6); t.y = 0;
});

// ---------- Eventos de la simulación ----------
let lastDoorChime = 0, lastAngry = 0;
const lowWarned = new Set<ProductId>();
function handleEvents(now: number) {
  for (const ev of state.eventos) {
    switch (ev.tipo) {
      case 'entra':
        if (now - lastDoorChime > 1.2) { sfx.door(); lastDoorChime = now; }
        break;
      case 'coge': {
        const v = views.get(ev.id);
        if (v) addToBasket(v, ev.product, ev.qty);
        const d = PRODUCTS[ev.product];
        if (state.estantes[ev.product] <= d.capacidad * 0.25 && !lowWarned.has(ev.product) && now > toastLock) {
          lowWarned.add(ev.product);
          toast(state.estantes[ev.product] === 0 ? `Se ha agotado: ${d.nombre.toLowerCase()}` : `Queda poco: ${d.nombre.toLowerCase()}`, 'bad', 2200);
        }
        break;
      }
      case 'falta':
        if (now - lastAngry > 1.5) {
          sfx.angry(); lastAngry = now;
          toast(`Un cliente no encontró ${PRODUCTS[ev.product].nombre.toLowerCase()}`, 'bad', 2200);
          toastLock = now + 1.5;
        }
        break;
      case 'escanea': {
        if (ev.caja === ME && !isGuest()) sfx.scan();
        const v = views.get(ev.id);
        const it = v?.inBasket.pop();
        if (it) it.removeFromParent();
        break;
      }
      case 'venta': {
        const r = LAYOUT.registers[ev.caja] ?? LAYOUT.register;
        if (ev.caja === ME) {
          sfx.cash();
          pulse(hudMoneyEl, 'pulse');
          if (ev.propina > 0) toast(`Propina: +${money(ev.propina)}`, 'ok');
        }
        floatText(`+${money(ev.importe + ev.propina)}`, ev.caja === ME ? '#ffc83d' : '#b3b199', new THREE.Vector3(r.x, 1.9, r.z - 0.4));
        const v = views.get(ev.id);
        if (v) { v.bag.visible = true; v.p.basket.visible = false; for (const m of v.inBasket) m.removeFromParent(); v.inBasket = []; }
        break;
      }
      case 'seVa':
        if (now - lastAngry > 1.5) { sfx.angry(); lastAngry = now; toast('Un cliente se ha ido sin comprar', 'bad', 2000); toastLock = now + 1.2; }
        break;
      case 'cierre':
        sfx.close();
        banner('Son las 20:00', 'Cerramos', state.clientes.length ? 'Atiende a los últimos clientes' : '');
        break;
      case 'fin':
        lowWarned.clear();
        till.exit();
        setTimeout(showSummary, 600);
        break;
      case 'compra':
        if (ev.j !== ME) toast(`Tu compañero compró: ${ev.lineas.map(([p, n]) => `${n} ${n === 1 ? 'caja' : 'cajas'} de ${PRODUCTS[p].nombre.toLowerCase()}`).join(', ')}`, '', 3200);
        break;
      case 'mejora':
        if (ev.j !== ME) {
          sfx.buy();
          toast(ev.caja === ME ? `Tu compañero ha mejorado tu caja: ${MEJORAS[ev.mejora].nombre.toLowerCase()}` : `Tu compañero ha mejorado su caja: ${MEJORAS[ev.mejora].nombre.toLowerCase()}`, 'ok', 3200);
        }
        break;
    }
  }
  if (session?.role === 'host') session.pushEvents(state.eventos);
  state.eventos.length = 0;
  for (const p of lowWarned) if (state.estantes[p] > PRODUCTS[p].capacidad * 0.25) lowWarned.delete(p);
}

// ---------- Bucle ----------
let doorOpen = 0, tillWas = false;
const timer = new THREE.Timer();
let elapsed = 0, loaded = false;

function frame(now: number) {
  timer.update(now);
  const raw = timer.getDelta();
  const dt = Math.min(0.1, raw);
  elapsed += dt;
  watchFps(raw);
  // Pausa compartida en multijugador
  if (session) {
    // 1: la pidió el anfitrión, 2: el invitado. Si la pide el otro, se pausa aquí; si cualquiera
    // la quita (después de haberse visto activa), se quita aquí también.
    const mine = session.role === 'host' ? 1 : 2, p = session.pausa;
    if (p !== 0 && p !== mine && !paused) setPaused(true, true);
    else if (p === 0 && paused && pauseSeen) setPaused(false, true);
    pauseSeen = paused && p !== 0;
  }
  const running = inStore && !paused && $('summary').hidden;
  if (running && !isGuest()) {
    // Pasos fijos: la simulación avanza igual en un móvil lento y en un ordenador rápido.
    let left = dt;
    while (left > 1e-6) { const s = Math.min(0.05, left); tick(state, s); left -= s; }
  }
  if (inStore) handleEvents(elapsed);
  watchPhase();
  if (session) {
    session.myPos = [player.pos.x, player.pos.y, player.yaw, till.active ? 1 : 0];
    session.pump(now, paused && !pausedByPartner);
    updatePartner(dt);
  }
  syncCustomers(running ? dt : 0, elapsed);
  updateWorldState();
  updateFlies(dt);

  // Primera persona
  const wasTill = tillWas;
  tillWas = till.active;
  if (wasTill && !till.active && player.enabled) player.syncFromCamera();
  if (player.enabled && !till.active) player.update(running ? dt : 0);
  ceilingGroup.visible = player.enabled && !till.active;
  cashier.group.visible = !player.enabled && !till.active;

  // Caja y cajero
  for (const t of tills) t.update(running || t.isLeaving ? dt : 0);
  cashier.armR.rotation.x = -0.25;
  cashier.armL.rotation.x = -0.2 + (reducedMotion ? 0 : Math.sin(elapsed * 1.3) * 0.04);
  const atReg = clienteEnCaja(state, 0);
  cashier.group.rotation.y = Math.PI + (atReg ? 0 : Math.sin(elapsed * 0.4) * 0.25);

  // Puertas automáticas
  const near = state.clientes.some((c) => Math.abs(c.x - doors.x) < 1.6 && Math.abs(c.z - 7.5) < 2.3);
  doorOpen = THREE.MathUtils.lerp(doorOpen, near ? 1 : 0, Math.min(1, dt * 6));
  doors.left.position.x = doors.x - doors.w / 4 - doorOpen * doors.w * 0.47;
  doors.right.position.x = doors.x + doors.w / 4 + doorOpen * doors.w * 0.47;

  // Paredes recortadas: las que quedan entre la cámara y la tienda bajan para ver el interior.
  for (const w of build.walls) {
    const outside = camera.position.clone().sub(w.point).dot(w.normal) < 0;
    const target = outside ? 0.1 : 1;
    const o = w.mesh;
    const s = THREE.MathUtils.lerp(o.scale.y, target, Math.min(1, dt * 8));
    o.scale.y = s;
    if ((o as THREE.Mesh).isMesh) o.position.y = (M.STORE.H * s) / 2;
    if (o === build.walls[build.walls.length - 1].mesh) { doors.left.scale.y = s; doors.right.scale.y = s; doors.left.position.y = doors.right.position.y = ((M.STORE.H - 0.85) / 2 + 0.35) * s; }
  }

  // Pantalla del ordenador con leve parpadeo
  ((pcScreen.material as THREE.Material[])[4] as THREE.MeshStandardMaterial).emissiveIntensity = 1.05 + (reducedMotion ? 0 : Math.sin(elapsed * 3) * 0.05);

  if (!tills.some((t) => t.active) && !player.enabled) controls.update();
  if (inStore) updateAim();
  renderer.render(scene, camera);
  if (inStore) { renderHud(); renderTill(); }
  if (openModal?.id === 'shelves' && running && Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) renderShelves();
  if (openModal?.id === 'pc' && running && Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) renderPc();
  if (!loaded) { loaded = true; const l = $('loading'); l.classList.add('done'); setTimeout(() => l.remove(), 450); }
  requestAnimationFrame(frame);
}

async function init() {
  // Las texturas llevan texto: esperamos a las fuentes empaquetadas para dibujarlas bien.
  try { await Promise.all([document.fonts.load("700 64px 'Oswald'"), document.fonts.load("600 26px 'Oswald'"), document.fonts.load("600 18px 'Inter'")]); } catch { /* se dibuja con la fuente del sistema */ }
  buildWorld();
  thumbs = makeThumbs();
  buildPc();
  buildShelves();
  placeCamera();
  worldReady = true;
  controls.autoRotate = !reducedMotion;
  renderTitle();
  requestAnimationFrame(frame);
  $('playBtn').focus();
}
void init();

// ---------- Aspecto (skin) ----------
let skinRenderer: THREE.WebGLRenderer | null = null;
const skinThumbs = new Map<string, string>();
/** Foto del personaje con un aspecto (con el mismo modelo 3D que ve el otro jugador). */
function skinThumb(skin: number, tono: number): string {
  const key = `${skin},${tono}`;
  const hit = skinThumbs.get(key);
  if (hit) return hit;
  if (!skinRenderer) {
    skinRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    skinRenderer.setPixelRatio(1); skinRenderer.setSize(160, 200, false);
    skinRenderer.toneMapping = THREE.ACESFilmicToneMapping; skinRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.6));
  const l = new THREE.DirectionalLight(0xffffff, 2.2); l.position.set(1.5, 3, 3); sc.add(l);
  const m = M.playerModel(skin, tono);
  m.group.rotation.y = 0.35;
  m.armL.rotation.z = -0.12; m.armR.rotation.z = 0.12;
  sc.add(m.group);
  const cam = new THREE.PerspectiveCamera(30, 160 / 200, 0.1, 10);
  cam.position.set(0, 1.25, 4.1); cam.lookAt(0, 1.08, 0);
  skinRenderer.render(sc, cam);
  const url = skinRenderer.domElement.toDataURL('image/png');
  skinThumbs.set(key, url);
  return url;
}
function renderSkins() {
  const [s, t] = mySkin;
  ($('skPreview') as HTMLImageElement).src = skinThumb(s, t);
  $('skName').textContent = M.SKINS[s].nombre;
  $('skGrid').innerHTML = M.SKINS.map((o, i) => `<button class="skin-opt" role="radio" aria-checked="${i === s}" data-skin="${i}"><img alt="" src="${skinThumb(i, t)}" />${o.nombre}</button>`).join('');
  $('skTones').innerHTML = M.TONOS.map((c, i) => `<button class="tone" role="radio" aria-checked="${i === t}" aria-label="Tono de piel ${i + 1}" data-tone="${i}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('');
}
function setSkin(next: Skin) {
  mySkin = next;
  try { localStorage.setItem(SKIN_KEY, JSON.stringify(next)); } catch { /* se usa solo en esta sesión */ }
  if (session) session.mySkin = next;
  // El empleado del menú lleva tu aspecto.
  const old = cashier;
  cashier = M.playerModel(next[0], next[1]);
  cashier.group.position.copy(old.group.position);
  cashier.group.rotation.copy(old.group.rotation);
  cashier.group.visible = old.group.visible;
  scene.remove(old.group);
  scene.add(cashier.group);
  renderSkins();
}
$('skGrid').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-skin]');
  if (b) { sfx.click(); setSkin([Number(b.dataset.skin), mySkin[1]]); $('skGrid').querySelector<HTMLElement>(`[data-skin="${b.dataset.skin}"]`)?.focus(); }
});
$('skTones').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tone]');
  if (b) { sfx.click(); setSkin([mySkin[0], Number(b.dataset.tone)]); $('skTones').querySelector<HTMLElement>(`[data-tone="${b.dataset.tone}"]`)?.focus(); }
});
function openSkins() { renderSkins(); open('skins'); }
$('skinBtn').addEventListener('click', openSkins);
$('mpSkinBtn').addEventListener('click', openSkins);

// ---------- Pasar partida (código para copiar y pegar en otra copia del juego) ----------
const trOut = $<HTMLTextAreaElement>('trOut'), trIn = $<HTMLTextAreaElement>('trIn'), trMsg = $('trMsg'), trYes = $<HTMLButtonElement>('trYes');
let trPending: ReturnType<typeof leerCodigo> | null = null;
function trMessage(text: string, kind: '' | 'ok' | 'bad' = '') { trMsg.textContent = text; trMsg.className = 'help ' + kind; }
$('transferBtn').addEventListener('click', () => {
  // Desde el menú, `state` es tu propia partida guardada.
  trOut.value = codigoPartida(state, mySkin);
  trIn.value = '';
  trYes.hidden = true; trPending = null;
  trMessage('');
  open('transfer');
});
$('trCopy').addEventListener('click', () => {
  const ok = () => { sfx.click(); trMessage('Código copiado. Pégalo en «Cargar partida» de la otra copia del juego.', 'ok'); };
  const manual = () => { trOut.focus(); trOut.select(); trMessage('Selecciona el código de arriba y cópialo.', ''); };
  try { navigator.clipboard.writeText(trOut.value).then(ok, manual); } catch { manual(); }
});
$('trLoad').addEventListener('click', () => {
  const r = leerCodigo(trIn.value);
  trYes.hidden = true; trPending = null;
  if (!r.ok) {
    sfx.error();
    trMessage(r.motivo === 'formato' ? 'Eso no es un código de partida: empieza por SUPER1-.' : r.motivo === 'incompleto' ? 'El código está incompleto o tiene algo cambiado. Cópialo otra vez entero.' : 'El código no tiene una partida válida.', 'bad');
    return;
  }
  trPending = r;
  trMessage(`Partida del día ${r.state.dia} con ${money(r.state.jugadores[0].dinero)}. Tu partida de ahora (día ${state.dia}) se cambiará por esta.`, '');
  trYes.hidden = false;
  trYes.focus();
});
trYes.addEventListener('click', () => {
  if (!trPending || !trPending.ok || session) return;
  state = trPending.state;
  resetViews();
  writeSave(exportar(state));
  hasSave = true;
  if (trPending.aspecto) setSkin(readSkin(trPending.aspecto));
  trPending = null;
  trYes.hidden = true;
  sfx.buy();
  renderTitle();
  close();
  toast(`Partida cargada: día ${state.dia}`, 'ok', 3000);
});

// Para pruebas automáticas en el navegador (no forma parte del juego).
(window as unknown as { __super: () => GameState }).__super = () => state;
(window as unknown as { __player: Player }).__player = player;
(window as unknown as { __tillPts: () => unknown }).__tillPts = () => tillScreenPoints(till, camera, regs[ME].group);
(window as unknown as { __countMoney: () => number }).__countMoney = () => till.loosePayments();
(window as unknown as { __superAvanzar: (s: number) => void }).__superAvanzar = (seg: number) => { for (let t = 0; t < seg; t += 0.05) tick(state, 0.05); };
