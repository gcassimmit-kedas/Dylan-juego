// Supermercado: escena 3D, interfaz y bucle del juego. Las reglas están en sim.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  newGame, tick, comprarPedido, costePedido, reponer, empezarTurno, siguienteDia, clienteEnCaja, CAMBIO, esMoneda, esRara, disponibles,
  horaTienda, exportar, importar,
  PRODUCTS, PRODUCT_IDS, DISPLAYS, LAYOUT, SHIFT_SECONDS,
  type GameState, type ProductId, type Customer,
} from './sim.ts';
import * as M from './models.ts';
import * as T from './textures.ts';
import { Till, tillScreenPoints } from './checkout.ts';
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
const save = () => { if (state.fase === 'preparacion') writeSave(exportar(state)); };
let hasSave = loadSave() !== null;
let state: GameState = loadSave() ?? newGame((Math.random() * 2 ** 32) >>> 0);

// ---------- Render ----------
const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.75 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
T.setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8c9);
scene.fog = new THREE.Fog(0x9fb8c9, 40, 90);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
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
let pcScreen: THREE.Mesh;
let store: ReturnType<typeof M.storage>;
let doors: { left: THREE.Mesh; right: THREE.Mesh; x: number; w: number };
let thumbs: Record<ProductId, string>;
let till: Till;

function buildWorld() {
  build = M.building();
  scene.add(build.group);
  doors = build.group.userData.doors;
  scene.add(M.ceilingDecor());
  for (const d of DISPLAYS) {
    const model = M.displayModel(d);
    scene.add(model.group);
    const tex = T.stockBadge(null, 0, 1, '');
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    badge.renderOrder = 10;
    badge.scale.set(1.35, 0.42, 1);
    badge.position.set(THREE.MathUtils.lerp(d.x, d.pick.x, 0.55), model.badgeY, THREE.MathUtils.lerp(d.z, d.pick.z, 0.55));
    badge.userData.product = d.product;
    scene.add(badge);
    displays.set(d.product, { model, badge, tex, shown: -1 });
    hitTargets.push(model.hit, badge);
  }
  reg = M.checkout(LAYOUT.register.x, LAYOUT.register.z);
  reg.hit.userData.action = 'cobrar';
  scene.add(reg.group); hitTargets.push(reg.hit);
  const off = M.office(LAYOUT.computer.x, LAYOUT.computer.z);
  off.hit.userData.action = 'ordenador';
  pcScreen = off.screen;
  scene.add(off.group); hitTargets.push(off.hit);
  store = M.storage(LAYOUT.storage.x, LAYOUT.storage.z);
  store.hit.userData.action = 'almacen';
  scene.add(store.group); hitTargets.push(store.hit);
  const baskets = M.basketStack(); baskets.position.set(7.6, 0, 6.6); scene.add(baskets);
  cashier = M.person(424242, true);
  cashier.group.position.set(LAYOUT.cashier.x, 0, LAYOUT.cashier.z);
  cashier.group.rotation.y = Math.PI;
  scene.add(cashier.group);
  till = new Till({
    scene, camera, controls, canvas, register: reg.group, scanner: reg.scanner, belt: reg.belt, cashier: cashier.group,
    state: () => state, toast, onChange: () => { if (inStore) renderTill(); },
  });
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
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTex, depthTest: false, transparent: true }));
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
    g.position.x = c.x; g.position.z = c.z;
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
    v.p.basket.visible = c.estado !== 'entrando' && !v.bag.visible && !(till.active && c.id === state.cola[0] && c.path.length === 0);
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
  if (state.dinero !== shownMoney) { hudMoney.textContent = String(state.dinero); shownMoney = state.dinero; }
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
  phaseChip.textContent = state.fase === 'preparacion' ? 'Preparación' : state.fase === 'resumen' ? 'Cerrado' : closing ? 'Cerrando' : 'Abierto';
  phaseChip.classList.toggle('open', state.fase === 'turno' && !closing);
  const turno = state.fase === 'turno';
  startBtn.hidden = state.fase !== 'preparacion'; scanBtn.hidden = !turno;
  if (turno) {
    const c = clienteEnCaja(state);
    scanBtn.classList.toggle('ready', !!c);
    scanLbl.textContent = c ? 'Atender cliente' : 'Ir a la caja';
    queueN.textContent = String(state.cola.length);
    queueN.hidden = state.cola.length === 0;
  }
  const needs = PRODUCT_IDS.some((p) => state.estantes[p] <= PRODUCTS[p].capacidad * 0.25 && state.almacen[p] > 0);
  shelvesBtn.classList.toggle('warn', needs);
}

let shownRegister = '';
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
  const c = clienteEnCaja(state);
  let total = 0, items = 0;
  if (c) {
    let n = c.escaneados;
    for (const l of c.cesta) { const k = Math.min(n, l.qty); total += k * PRODUCTS[l.product].precio; items += k; n -= k; }
  }
  const key = `${total}/${items}`;
  if (key !== shownRegister) { T.drawRegister(reg.screen, total, items); shownRegister = key; }
}

// ---------- Ordenador ----------
const cart: Record<ProductId, number> = Object.fromEntries(PRODUCT_IDS.map((p) => [p, 0])) as Record<ProductId, number>;
const pcRows = new Map<ProductId, { card: HTMLElement; qty: HTMLOutputElement; minus: HTMLButtonElement; plus: HTMLButtonElement; stock: HTMLElement }>();
function buildPc() {
  const body = $('pcBody');
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
  $('pcMoney').textContent = String(state.dinero);
  $('pcTotal').textContent = money(total);
  const after = $('pcAfter');
  after.textContent = total === 0 ? 'Añade cajas al pedido' : total > state.dinero ? `Faltan ${money(total - state.dinero)}` : `Te quedarán ${money(state.dinero - total)}`;
  after.classList.toggle('bad', total > state.dinero);
  $<HTMLButtonElement>('pcPay').disabled = total === 0 || total > state.dinero;
  $<HTMLButtonElement>('pcClear').disabled = total === 0;
}
$('pcClear').addEventListener('click', () => { for (const p of PRODUCT_IDS) cart[p] = 0; renderPc(); });
$('pcPay').addEventListener('click', () => {
  const r = comprarPedido(state, cart);
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
  for (const p of PRODUCT_IDS) total += reponer(state, p);
  if (total) { sfx.stock(); toast(`Repuestas ${total} unidades`, 'ok'); save(); }
  else { sfx.error(); toast('No hay nada que reponer', 'bad'); }
  renderShelves();
});

// ---------- Ventanas ----------
let openModal: HTMLElement | null = null, opener: HTMLElement | null = null;
function open(id: 'pc' | 'shelves' | 'help' | 'confirm') {
  if (openModal) close();
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
for (const id of ['pc', 'shelves', 'help', 'confirm']) $(id).addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) close(); });
pcBtn.addEventListener('click', () => open('pc'));
shelvesBtn.addEventListener('click', () => open('shelves'));

// ---------- Flujo de partida ----------
let inStore = false, paused = false;

function renderTitle() {
  $('playLbl').textContent = hasSave ? `Continuar · Día ${state.dia}` : 'Jugar';
  $('newBtn').hidden = !hasSave;
  $('recDay').textContent = String(state.dia);
  $('recMoney').textContent = money(state.dinero);
  $('recBest').textContent = money(Math.max(0, state.mejorDia));
}
function enterStore() {
  unlock();
  titleEl.hidden = true;
  inStore = true;
  document.body.classList.add('instore');
  controls.autoRotate = false;
  prepBanner();
  startBtn.focus();
}
function prepBanner() {
  const empty = PRODUCT_IDS.filter((p) => state.estantes[p] === 0).length;
  banner(`Día ${state.dia}`, 'Prepara la tienda', empty ? `Hay ${empty} estanterías vacías: repón o haz un pedido` : 'Cuando lo tengas todo listo, empieza el turno', 3200);
}
function goTitle() {
  close();
  setPaused(false);
  inStore = false;
  document.body.classList.remove('instore');
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
  ? 'Arrastra con un dedo para girar la vista y con dos para acercarla o moverla. En la caja, arrastra los productos al escáner.'
  : 'Arrastra para girar la vista, rueda para acercar y botón derecho para moverla. Teclas: O abre el ordenador, R repone, Intro empieza el turno y P pausa. En la caja: Espacio pasa un producto, 1-7 sacan dinero, Retroceso deshace e Intro da el cambio.';

startBtn.addEventListener('click', () => {
  if (state.fase !== 'preparacion') return;
  writeSave(exportar(state));
  empezarTurno(state);
  sfx.open();
  banner(`Día ${state.dia}`, '¡Abrimos!', 'Cobra a los clientes y vigila las estanterías');
  scanBtn.hidden = false;
  scanBtn.focus();
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
  if (ph !== lastPanelH) { lastPanelH = ph; applyViewOffset(); }
  const i = till.info();
  tillPay.hidden = i.phase !== 'pago';
  if (i.phase === 'escaneo') {
    tillMsg.textContent = 'Arrastra cada producto de la cinta hasta el escáner.';
    tillCount.textContent = `${i.scanned}/${i.total} · ${money(i.sub)}`;
  } else if (i.phase === 'pago') {
    tillMsg.textContent = i.paid === i.due ? 'Paga con el importe justo: no hay que dar cambio.' : `Paga con un billete de ${money(i.paid)}. Saca la vuelta del cajón.`;
    tillCount.textContent = '';
    $('tTotal').textContent = money(i.due);
    $('tPaid').textContent = money(i.paid);
    $('tChange').textContent = money(till.changeTotal);
    tUndo.disabled = till.change.length === 0;
  } else {
    const n = state.cola.length;
    tillMsg.textContent = n ? 'El siguiente cliente está llegando a la caja.' : state.reloj >= SHIFT_SECONDS ? 'No queda nadie: la tienda está cerrada.' : 'No hay nadie en la cola.';
    tillCount.textContent = n ? `${n} en cola` : '';
  }
}

function showSummary() {
  const s = state.stats;
  const profit = s.ingresos - s.gastos;
  $('sumDay').textContent = String(state.dia);
  $('sClients').textContent = String(s.clientes);
  $('sServed').textContent = String(s.atendidos);
  $('sLost').textContent = String(s.perdidos);
  $('sItems').textContent = String(s.articulos);
  $('sIncome').textContent = money(s.ingresos);
  $('sCost').textContent = money(s.gastos);
  const pe = $('sProfit');
  pe.textContent = (profit < 0 ? '-' : '') + money(Math.abs(profit));
  pe.classList.toggle('neg', profit < 0);
  $('sumRecord').hidden = !(profit > 0 && profit >= state.mejorDia);
  const tips: string[] = [];
  if (s.faltas > 0) tips.push(`${s.faltas === 1 ? 'Una vez' : `${s.faltas} veces`} un cliente no encontró lo que buscaba: compra más género en el ordenador.`);
  if (s.cambioDeMas > 0) tips.push(`Diste ${money(s.cambioDeMas)} de más en cambios.`);
  if (s.cansados > 0) tips.push('Hubo clientes que se cansaron de esperar en la caja: cóbrales más rápido.');
  $('sumTip').textContent = tips.length ? tips.join(' ') : 'Día perfecto: todos los clientes se fueron contentos.';
  close();
  $('summary').hidden = false;
  $('nextBtn').focus();
  // Se guarda ya el día siguiente: si se cierra la app aquí, no se pierde lo ganado.
  const sv = exportar(state); sv.dia = state.dia + 1;
  writeSave(sv);
  hasSave = true;
}
$('nextBtn').addEventListener('click', () => {
  siguienteDia(state);
  $('summary').hidden = true;
  save();
  prepBanner();
  startBtn.focus();
});

// Pausa
const pauseBtn = $('pauseBtn');
function setPaused(v: boolean) {
  paused = v;
  pauseEl.hidden = !v;
  pauseBtn.innerHTML = icon(v ? 'play' : 'pause');
  pauseBtn.setAttribute('aria-label', v ? 'Continuar' : 'Pausar');
  $('quitHelp').textContent = state.fase === 'turno' ? 'Si sales ahora, el turno en curso no se guardará.' : 'La tienda queda guardada en este dispositivo.';
  if (v) { close(); $('resumeBtn').focus(); }
  else if (till?.active) applyViewOffset();
}
pauseBtn.innerHTML = icon('pause');
pauseBtn.addEventListener('click', () => setPaused(!paused));
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('quitBtn').addEventListener('click', () => {
  if (state.fase === 'turno') { state = loadSave() ?? newGame(); resetViews(); }
  goTitle();
});
// Ciclo de vida: al pasar a segundo plano el turno se pausa solo.
document.addEventListener('visibilitychange', () => { if (document.hidden && inStore && state.fase === 'turno' && !paused) setPaused(true); });

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
  if (k === ' ' && state.fase === 'turno') { e.preventDefault(); doScan(); }
  else if (k === 'o') open('pc');
  else if (k === 'r') open('shelves');
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
  if (isTouch || !inStore || e.buttons) return;
  canvas.style.cursor = pick(e) ? 'pointer' : '';
});

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
        sfx.scan();
        const v = views.get(ev.id);
        const it = v?.inBasket.pop();
        if (it) it.removeFromParent();
        break;
      }
      case 'venta': {
        sfx.cash();
        pulse(hudMoneyEl, 'pulse');
        floatText(`+${money(ev.importe)}`, '#ffc83d', new THREE.Vector3(LAYOUT.register.x, 1.9, LAYOUT.register.z - 0.4));
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
    }
  }
  state.eventos.length = 0;
  for (const p of lowWarned) if (state.estantes[p] > PRODUCTS[p].capacidad * 0.25) lowWarned.delete(p);
}

// ---------- Bucle ----------
let doorOpen = 0;
const timer = new THREE.Timer();
let elapsed = 0, loaded = false;

function frame(now: number) {
  timer.update(now);
  const dt = Math.min(0.1, timer.getDelta());
  elapsed += dt;
  const running = inStore && !paused && $('summary').hidden;
  if (running) {
    // Pasos fijos: la simulación avanza igual en un móvil lento y en un ordenador rápido.
    let left = dt;
    while (left > 1e-6) { const s = Math.min(0.05, left); tick(state, s); left -= s; }
    handleEvents(elapsed);
  }
  syncCustomers(running ? dt : 0, elapsed);
  updateWorldState();
  updateFlies(dt);

  // Caja y cajero
  till.update(running || till.isLeaving ? dt : 0);
  cashier.armR.rotation.x = -0.25;
  cashier.armL.rotation.x = -0.2 + (reducedMotion ? 0 : Math.sin(elapsed * 1.3) * 0.04);
  const atReg = clienteEnCaja(state);
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

  if (!till.active) controls.update();
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
  controls.autoRotate = !reducedMotion;
  renderTitle();
  requestAnimationFrame(frame);
  $('playBtn').focus();
}
void init();

// Para pruebas automáticas en el navegador (no forma parte del juego).
(window as unknown as { __super: () => GameState }).__super = () => state;
(window as unknown as { __tillPts: () => unknown }).__tillPts = () => tillScreenPoints(till, camera, reg.group);
(window as unknown as { __superAvanzar: (s: number) => void }).__superAvanzar = (seg: number) => { for (let t = 0; t < seg; t += 0.05) tick(state, 0.05); };
