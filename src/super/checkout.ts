// Modo caja en 3D: la cámara baja al mostrador, el jugador arrastra cada producto de la cinta al escáner
// y después da el cambio del billete sacando monedas y billetes del cajón.
// Las reglas (qué se escanea, cuánto paga, si el cambio es correcto) siguen en sim.ts.
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  clienteEnCaja, escanear, darCambio, importe, importeEscaneado, totalArticulos, CAMBIO, esMoneda,
  type GameState, type ProductId, type Customer,
} from './sim.ts';
import * as M from './models.ts';
import * as T from './textures.ts';
import { sfx } from './audio.ts';

type Phase = 'espera' | 'escaneo' | 'pago';

interface BeltItem { product: ProductId; obj: THREE.Group; hit: THREE.Mesh; w: number; h: number; slot: number; state: 'llega' | 'cinta' | 'mano' | 'bolsa'; delay: number }
interface Tween { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; arc: number; done?: () => void; delay: number; spin?: number }

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const SCANNER = new THREE.Vector3(0.25, 0, 0);
const TOP = 0.895;
const BELT_FRONT = -0.18;
const TRAY = new THREE.Vector3(-0.32, TOP + 0.012, 0);
const BILL_SPOT = new THREE.Vector3(-0.62, TOP + 0.004, 0.02);
const BAG = new THREE.Vector3(0.64, TOP, -0.17);
/** Centro de cada hueco del cajón (uno por valor de CAMBIO). */
const SLOT_W = 0.078;
const slotX = (i: number) => -((CAMBIO.length - 1) * SLOT_W) / 2 + i * SLOT_W;
const COIN_R: Record<number, number> = { 1: 0.0115, 5: 0.0125, 10: 0.0135, 25: 0.0155 };

export interface TillDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  register: THREE.Group;
  scanner: THREE.Mesh;
  belt: THREE.Texture;
  cashier: THREE.Object3D;
  state: () => GameState;
  toast: (text: string, kind?: '' | 'ok' | 'bad', ms?: number) => void;
  onChange: () => void;
  /** Fracción de la altura de pantalla libre (sin la barra de arriba ni el panel de la caja). */
  freeHeight: () => number;
  /** Número de caja (0 o 1). */
  caja: number;
  /**
   * Cómo se escanea y se da el cambio. Por defecto, directamente sobre la simulación; el segundo
   * jugador las cambia para mandar la acción al anfitrión.
   */
  ops?: {
    escanear(p: ProductId): ReturnType<typeof escanear>;
    darCambio(v: number): ReturnType<typeof darCambio>;
  };
}

export class Till {
  active = false;
  phase: Phase = 'espera';
  private d: TillDeps;
  private items: BeltItem[] = [];
  private tweens: Tween[] = [];
  private customerId = 0;
  private grabbed: BeltItem | null = null;
  private grabOffset = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TOP + 0.14));
  private flash = 0;
  private beltMoving = 0;
  /** Cambio que el jugador ha puesto en la bandeja (en orden, para poder deshacer). */
  change: { value: number; obj: THREE.Object3D }[] = [];
  private bill: THREE.Object3D | null = null;
  private drawer = new THREE.Group();
  private drawerOpen = 0;
  private slots: THREE.Mesh[] = [];
  private camFrom = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  private camAnim = 1;
  private camGoal = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  private camStart = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  private leaving = false;
  private billGeo = new THREE.BoxGeometry(0.155, 0.002, 0.066);
  private coinGeos = new Map<number, THREE.CylinderGeometry>();
  private coinMats = new Map<number, THREE.Material[]>();
  private billMats = new Map<number, THREE.Material[]>();
  private bag: THREE.Group;
  private served = new Set<number>();
  private get ops() {
    return this.d.ops ?? {
      escanear: (p: ProductId) => escanear(this.d.state(), p, this.d.caja),
      darCambio: (v: number) => darCambio(this.d.state(), v, this.d.caja),
    };
  }

  constructor(d: TillDeps) {
    this.d = d;
    this.buildDrawer();
    this.bag = this.buildBag();
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.22), std({ color: 0x1b1c1e, roughness: 0.5 }));
    tray.position.set(TRAY.x, TOP + 0.006, TRAY.z);
    tray.receiveShadow = true;
    d.register.add(tray);
  }

  // ---------- Modelos ----------

  private billMat(v: number): THREE.Material[] {
    let m = this.billMats.get(v);
    if (!m) {
      const t = T.billTexture(v);
      const side = std({ color: 0xe8e4d4, roughness: 0.8 });
      const face = std({ map: t, roughness: 0.75 });
      m = [side, side, face, face, side, side];
      this.billMats.set(v, m);
    }
    return m;
  }
  private money(v: number): THREE.Mesh {
    let m: THREE.Mesh;
    if (esMoneda(v)) {
      let geo = this.coinGeos.get(v), mat = this.coinMats.get(v);
      if (!geo || !mat) {
        geo = new THREE.CylinderGeometry(COIN_R[v] ?? 0.013, COIN_R[v] ?? 0.013, 0.004, 20);
        const edge = std({ color: 0xc9961e, roughness: 0.3, metalness: 0.9 }), face = std({ map: T.coinTexture(v), roughness: 0.35, metalness: 0.6 });
        mat = [edge, face, face];
        this.coinGeos.set(v, geo); this.coinMats.set(v, mat);
      }
      m = new THREE.Mesh(geo, mat);
    } else m = new THREE.Mesh(this.billGeo, this.billMat(v));
    m.castShadow = true;
    return m;
  }

  private buildDrawer() {
    const g = this.drawer;
    const dark = std({ color: 0x2a2b2e, roughness: 0.5, metalness: 0.4 });
    const box = (w: number, h: number, dd: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat); m.position.set(x, y, z); m.receiveShadow = true; g.add(m); return m;
    };
    const DW = CAMBIO.length * SLOT_W + 0.02;
    box(DW, 0.01, 0.42, 0, 0, 0, dark);
    box(DW, 0.08, 0.012, 0, 0.04, 0.21, dark);
    box(DW, 0.06, 0.012, 0, 0.03, -0.21, dark);
    for (const x of [-DW / 2, DW / 2]) box(0.012, 0.06, 0.42, x, 0.03, 0, dark);
    box(0.18, 0.018, 0.02, 0, 0.05, 0.225, std({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.85 }));
    // Un hueco por valor, con su pila de billetes o monedas
    CAMBIO.forEach((v, i) => {
      const x = slotX(i);
      if (i) box(0.006, 0.05, 0.4, x - SLOT_W / 2, 0.03, 0, dark);
      for (let k = 0; k < 6; k++) {
        const m = this.money(v);
        if (esMoneda(v)) m.position.set(x + ((k % 2) - 0.5) * 0.034, 0.008 + Math.floor(k / 2) * 0.005, 0.05 + ((k % 3) - 1) * 0.03);
        else { m.rotation.y = Math.PI / 2; m.position.set(x, 0.007 + k * 0.003, 0); }
        g.add(m);
      }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(SLOT_W * 0.98, 0.1, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(x, 0.05, 0);
      hit.userData.den = v;
      g.add(hit);
      this.slots.push(hit);
    });
    g.position.set(0.42, 0.76, 0.2);
    this.d.register.add(g);
  }

  private buildBag(): THREE.Group {
    const g = new THREE.Group();
    const paper = std({ color: 0xc8a272, roughness: 0.9, side: THREE.DoubleSide });
    const w = 0.22, h = 0.24, dd = 0.14;
    const wall = (ww: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, h), paper); m.position.set(x, h / 2, z); m.rotation.y = ry; g.add(m); };
    wall(w, 0, dd / 2, 0); wall(w, 0, -dd / 2, 0); wall(dd, w / 2, 0, Math.PI / 2); wall(dd, -w / 2, 0, Math.PI / 2);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, dd), paper); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.002; g.add(bottom);
    g.position.copy(BAG);
    g.traverse((m) => { m.castShadow = true; });
    g.visible = false;
    this.d.register.add(g);
    return g;
  }

  // ---------- Entrar y salir ----------

  /**
   * Encuadre de la cámara desde el lado del cajero. En pantallas verticales la cámara gira 90 grados
   * para que el mostrador quede de arriba (cinta) abajo (escáner y cajón) y los productos se vean grandes.
   */
  private framing(out: { pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 }) {
    const cam = this.d.camera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), tanH = tanV * cam.aspect;
    const reg = this.d.register.position;
    if (cam.aspect < 0.85) {
      // Vertical: largo del mostrador (2,4 m) en vertical, fondo (1,5 m con cajón y cliente) en horizontal.
      // Al cobrar, la cámara se centra en el billete, la bandeja y el cajón.
      const pay = this.phase === 'pago';
      const dist = THREE.MathUtils.clamp(Math.max((pay ? 0.85 : 1.2) / tanV, 0.62 / tanH), 2.2, 6);
      out.target.set(pay ? -0.14 : -0.25, TOP - 0.1, pay ? 0.25 : 0.14).add(reg);
      out.pos.copy(out.target).addScaledVector(new THREE.Vector3(0.45, 1.5, 0.35).normalize(), dist);
      out.up.set(-1, 0, 0);
      return;
    }
    // Horizontal: que quepa de la cinta al cajón (unos 2,4 m de ancho) y, en pantallas bajas
    // (móvil apaisado), también de fondo en el hueco que dejan la barra de arriba y el panel.
    const free = THREE.MathUtils.clamp(this.d.freeHeight(), 0.3, 1);
    const dist = THREE.MathUtils.clamp(Math.max(1.2 / tanH, 0.55 / (tanV * free)), 2.3, 7);
    out.target.set(-0.2, TOP - 0.1, 0.18).add(reg);
    out.pos.copy(out.target).addScaledVector(new THREE.Vector3(0.12, 1.15, 1.0).normalize(), dist);
    out.up.set(0, 1, 0);
  }

  enter() {
    if (this.active) return;
    const s = this.d.state();
    if (s.fase !== 'turno') return;
    this.active = true;
    this.leaving = false;
    this.camFrom.pos.copy(this.d.camera.position);
    this.camFrom.target.copy(this.d.controls.target);
    this.camFrom.up.set(0, 1, 0);
    this.d.controls.enabled = false;
    this.d.controls.autoRotate = false;
    this.startCam(this.camFrom, null);
    this.d.cashier.visible = false;
    this.customerId = 0;
    this.load();
    this.d.onChange();
  }

  exit() {
    if (!this.active) return;
    this.dropGrab();
    this.leaving = true;
    this.startCam({ pos: this.d.camera.position.clone(), target: this.d.controls.target.clone(), up: this.d.camera.up.clone() }, this.camFrom);
    this.clearAll();
    this.d.onChange();
  }

  private startCam(from: { pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 }, to: { pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null) {
    this.camStart.pos.copy(from.pos); this.camStart.target.copy(from.target); this.camStart.up.copy(from.up);
    if (to) { this.camGoal.pos.copy(to.pos); this.camGoal.target.copy(to.target); this.camGoal.up.copy(to.up); } else this.framing(this.camGoal);
    this.camAnim = reducedMotion ? 1 : 0;
  }

  /** Mueve la cámara al encuadre de la fase actual (solo cambia en pantallas verticales). */
  private refocus() {
    if (!this.active || this.leaving) return;
    this.startCam({ pos: this.d.camera.position.clone(), target: this.d.controls.target.clone(), up: this.d.camera.up.clone() }, null);
  }

  /** Al girar el móvil, recalcula el encuadre. */
  resize() { if (this.active && !this.leaving) { this.framing(this.camGoal); if (this.camAnim >= 1) this.applyCam(1); } }

  private applyCam(k: number) {
    const e = k < 1 ? 1 - (1 - k) ** 3 : 1;
    this.d.camera.position.lerpVectors(this.camStart.pos, this.camGoal.pos, e);
    this.d.controls.target.lerpVectors(this.camStart.target, this.camGoal.target, e);
    this.d.camera.up.lerpVectors(this.camStart.up, this.camGoal.up, e);
    if (this.d.camera.up.lengthSq() < 1e-4) this.d.camera.up.copy(this.camGoal.up);
    this.d.camera.up.normalize();
    this.d.camera.lookAt(this.d.controls.target);
  }

  private clearAll() {
    for (const it of this.items) it.obj.removeFromParent();
    this.items = [];
    for (const c of this.change) c.obj.removeFromParent();
    this.change = [];
    this.bill?.removeFromParent(); this.bill = null;
    for (const t of this.tweens) if (t.obj.parent && t.obj !== this.bag) t.obj.removeFromParent();
    this.tweens = [];
    this.bag.visible = false;
    this.bag.position.copy(BAG);
    this.customerId = 0;
    this.phase = 'espera';
  }

  /** Prepara el mostrador para el cliente que está en la caja. */
  private load() {
    const s = this.d.state();
    const c = clienteEnCaja(s, this.d.caja);
    if (!c || this.served.has(c.id)) { if (this.customerId) this.clearAll(); this.phase = 'espera'; return; }
    if (c.id === this.customerId) return;
    this.clearAll();
    this.customerId = c.id;
    this.bag.visible = true;
    this.bag.scale.setScalar(1);
    if (c.pago) { this.startPayment(c); return; }
    this.phase = 'escaneo';
    // El cliente vacía la cesta en la cinta, uno a uno.
    let k = 0;
    for (const l of c.cesta) {
      const left = l.qty - (c.pasados[l.product] ?? 0);
      for (let i = 0; i < left; i++) this.addItem(l.product, k++);
    }
    this.layout(true);
  }

  private addItem(p: ProductId, k: number) {
    const tpl = M.itemTemplate(p);
    const obj = M.itemMesh(p);
    obj.traverse((m) => { m.castShadow = true; });
    const lie = tpl.h > 0.2; // los altos (botellas, cereales) se tumban en la cinta
    const inner = new THREE.Group();
    inner.add(obj);
    if (lie) { obj.rotation.z = Math.PI / 2; obj.position.y = tpl.w / 2; obj.position.x = tpl.h / 2; }
    const w = lie ? tpl.h : tpl.w, h = lie ? tpl.w : tpl.h;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.1, Math.max(w, h) / 2 + 0.05), 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = h / 2;
    inner.add(hit);
    inner.position.set(-1.5, TOP + 0.35, (k % 2 ? 0.08 : -0.08));
    inner.visible = false;
    this.d.register.add(inner);
    const it: BeltItem = { product: p, obj: inner, hit, w, h, slot: 0, state: 'llega', delay: reducedMotion ? 0 : k * 0.22 };
    hit.userData.item = it;
    this.items.push(it);
  }

  /** Coloca la fila de la cinta: el primero junto al escáner y el resto detrás. */
  private layout(initial = false) {
    let x = BELT_FRONT;
    for (const it of this.items) {
      if (it.state === 'bolsa' || it.state === 'mano') continue;
      it.slot = x - it.w / 2;
      x -= it.w + 0.035;
      if (initial) it.obj.position.x = it.slot - 0.6;
    }
  }

  // ---------- Pago ----------

  private startPayment(c: Customer) {
    this.phase = 'pago';
    for (const it of this.items) it.obj.removeFromParent();
    this.items = [];
    // El cliente deja el billete en el mostrador y se abre el cajón.
    const bill = this.money(c.pago);
    bill.position.set(BILL_SPOT.x, TOP + 0.5, -0.75);
    bill.rotation.y = 0.15;
    this.d.register.add(bill);
    this.bill = bill;
    this.tween(bill, BILL_SPOT.clone(), 0.55, 0.15, 0.1);
    sfx.drawer();
    this.refocus();
    this.d.onChange();
  }

  /** Pone en la bandeja una moneda o billete del cajón. */
  addChange(v: number) {
    if (!this.active || this.phase !== 'pago') return;
    const m = this.money(v);
    const slot = CAMBIO.indexOf(v as (typeof CAMBIO)[number]);
    const from = new THREE.Vector3(slotX(slot), 0.05, 0).add(this.drawer.position);
    m.position.copy(from);
    const n = this.change.length;
    const coins = this.change.filter((c) => esMoneda(c.value)).length, bills = n - coins;
    const to = esMoneda(v)
      ? new THREE.Vector3(TRAY.x + 0.09 - (coins % 4) * 0.032, TRAY.y + 0.002 + Math.floor(coins / 4) * 0.004, TRAY.z + 0.07)
      : new THREE.Vector3(TRAY.x - 0.03 + (bills % 3) * 0.012, TRAY.y + 0.001 + bills * 0.0025, TRAY.z - 0.02 + (bills % 2) * 0.012);
    if (v !== 1) m.rotation.y = (bills % 3 - 1) * 0.08;
    this.d.register.add(m);
    this.change.push({ value: v, obj: m });
    this.tween(m, to, 0.28, 0.1);
    if (esMoneda(v)) sfx.coin(); else sfx.bill();
    this.d.onChange();
  }

  undoChange() {
    const last = this.change.pop();
    if (!last) return;
    const slot = CAMBIO.indexOf(last.value as (typeof CAMBIO)[number]);
    this.tween(last.obj, new THREE.Vector3(slotX(slot), 0.05, 0).add(this.drawer.position), 0.22, 0.08, 0, () => last.obj.removeFromParent());
    sfx.click();
    this.d.onChange();
  }

  get isLeaving() { return this.leaving; }

  frontItem(): THREE.Vector3 | null { const it = this.items.find((i) => i.state === 'cinta'); return it ? it.obj.position.clone() : null; }

  get changeTotal() { return this.change.reduce((t, c) => t + c.value, 0); }

  giveChange() {
    if (this.phase !== 'pago') return;
    const s = this.d.state();
    const c = clienteEnCaja(s, this.d.caja);
    if (!c) return;
    const r = this.ops.darCambio(this.changeTotal);
    if (!r) { sfx.error(); this.d.toast('Eso es más dinero del que te ha dado', 'bad'); return; }
    if (!r.ok) { sfx.error(); this.d.toast(`Al cambio le faltan RD$${r.falta}`, 'bad', 2400); return; }
    if (r.sobra > 0) this.d.toast(`Le diste RD$${r.sobra} de más`, 'bad', 2400);
    // El cambio va al cliente, el billete al cajón y la bolsa con la compra se la lleva.
    const toCustomer = new THREE.Vector3(TRAY.x, TOP + 0.4, -0.9);
    for (const ch of this.change) this.tween(ch.obj, toCustomer.clone(), 0.4, 0.15, Math.random() * 0.1, () => ch.obj.removeFromParent());
    this.change = [];
    if (this.bill) { const b = this.bill; this.tween(b, new THREE.Vector3(slotX(CAMBIO.length - 1), 0.06, 0).add(this.drawer.position), 0.35, 0.12, 0.05, () => b.removeFromParent()); this.bill = null; }
    const bagTo = this.bag.position.clone().add(new THREE.Vector3(0, 0.25, -0.8));
    const bagBack = BAG.clone();
    this.tween(this.bag, bagTo, 0.45, 0.1, 0.2, () => { this.bag.visible = false; this.bag.position.copy(bagBack); });
    // Ya atendido: aunque la confirmación del anfitrión tarde un momento, no vuelve a cargarse.
    this.served.add(c.id);
    if (this.served.size > 50) this.served.delete(this.served.values().next().value as number);
    this.customerId = 0;
    this.phase = 'espera';
    this.refocus();
    this.d.onChange();
  }

  // ---------- Escaneo ----------

  /** Teclado: pasa por el escáner el primer producto de la cinta. */
  scanNext() {
    if (this.phase !== 'escaneo') return;
    const it = this.items.find((i) => i.state === 'cinta');
    if (!it) return;
    it.state = 'mano';
    this.tween(it.obj, new THREE.Vector3(SCANNER.x, TOP + 0.08, SCANNER.z), 0.25, 0.12, 0, () => this.scan(it));
  }

  private scan(it: BeltItem): boolean {
    const r = this.ops.escanear(it.product);
    if (!r) return false;
    it.state = 'bolsa';
    this.grabbed = this.grabbed === it ? null : this.grabbed;
    this.flash = 1;
    this.tween(it.obj, BAG.clone().add(new THREE.Vector3(0, 0.08, 0)), 0.3, 0.18, 0.05, () => it.obj.removeFromParent());
    this.items = this.items.filter((i) => i !== it);
    this.layout();
    this.beltMoving = 0.5;
    if ('pagaCon' in r) {
      const c = clienteEnCaja(this.d.state(), this.d.caja);
      if (c) setTimeout(() => { if (this.active && this.customerId === c.id) this.startPayment(c); }, 450);
    }
    this.d.onChange();
    return true;
  }

  // ---------- Puntero ----------

  private setRay(e: PointerEvent) {
    const r = this.d.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.d.camera);
  }

  /** Devuelve true si el toque lo ha usado la caja. */
  pointerDown(e: PointerEvent): boolean {
    if (!this.active || this.leaving) return false;
    this.setRay(e);
    if (this.phase === 'escaneo') {
      const hits = this.ray.intersectObjects(this.items.filter((i) => i.state === 'cinta').map((i) => i.hit), false);
      const it = hits[0]?.object.userData.item as BeltItem | undefined;
      if (it) {
        this.grabbed = it;
        it.state = 'mano';
        const p = this.planePoint();
        if (p) this.grabOffset.copy(it.obj.position).sub(p).setY(0);
        this.d.canvas.setPointerCapture(e.pointerId);
        sfx.click();
        return true;
      }
    }
    if (this.phase === 'pago') {
      const hit = this.ray.intersectObjects(this.slots, false)[0];
      if (hit) { this.addChange(hit.object.userData.den as number); return true; }
      const tray = this.ray.intersectObjects(this.change.map((c) => c.obj), false)[0];
      if (tray) { this.undoChange(); return true; }
    }
    return true; // en modo caja la cámara no se mueve con el dedo
  }

  private planePoint(): THREE.Vector3 | null {
    const p = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    return p ? this.d.register.worldToLocal(p) : null;
  }

  pointerMove(e: PointerEvent) {
    const it = this.grabbed;
    if (!it) {
      if (this.active && e.pointerType === 'mouse') {
        this.setRay(e);
        const over = this.phase === 'escaneo'
          ? this.ray.intersectObjects(this.items.filter((i) => i.state === 'cinta').map((i) => i.hit), false).length
          : this.phase === 'pago' ? this.ray.intersectObjects(this.slots, false).length : 0;
        this.d.canvas.style.cursor = over ? 'grab' : '';
      }
      return;
    }
    this.setRay(e);
    const p = this.planePoint();
    if (!p) return;
    p.add(this.grabOffset);
    p.x = THREE.MathUtils.clamp(p.x, -1.4, 0.85);
    p.z = THREE.MathUtils.clamp(p.z, -0.36, 0.36);
    p.y = TOP + 0.08;
    it.obj.position.lerp(p, 0.6);
    this.d.canvas.style.cursor = 'grabbing';
    // Pasar el producto por encima del cristal basta, como en una caja de verdad.
    if (Math.hypot(it.obj.position.x - SCANNER.x, it.obj.position.z - SCANNER.z) < 0.19) this.scan(it);
  }

  pointerUp() { this.dropGrab(); }

  private dropGrab() {
    const it = this.grabbed;
    this.grabbed = null;
    this.d.canvas.style.cursor = '';
    if (it && it.state === 'mano') { it.state = 'cinta'; this.layout(); }
  }

  // ---------- Animación ----------

  private tween(obj: THREE.Object3D, to: THREE.Vector3, dur: number, arc = 0, delay = 0, done?: () => void) {
    this.tweens = this.tweens.filter((t) => t.obj !== obj);
    this.tweens.push({ obj, from: obj.position.clone(), to, t: 0, dur: reducedMotion ? 0.01 : dur, arc, done, delay });
  }

  update(dt: number) {
    // Cámara
    if (this.camAnim < 1) {
      this.camAnim = Math.min(1, this.camAnim + dt / 0.7);
      this.applyCam(this.camAnim);
      if (this.camAnim >= 1 && this.leaving) {
        this.active = false;
        this.leaving = false;
        this.d.camera.up.set(0, 1, 0);
        this.d.controls.enabled = true;
        this.d.cashier.visible = true;
        this.d.onChange();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    (this.d.scanner.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + this.flash * 3;
    if (!this.active) { this.drawerOpen = Math.max(0, this.drawerOpen - dt * 4); this.drawer.position.z = 0.2 + this.drawerOpen * 0.4; this.stepTweens(dt); return; }
    if (!this.leaving) {
      // ¿Ha cambiado el cliente de la caja?
      const c = clienteEnCaja(this.d.state(), this.d.caja);
      if ((c?.id ?? 0) !== this.customerId && (this.phase !== 'pago' || !c)) { this.load(); this.d.onChange(); }
      // El billete puede llegar después (lo decide el anfitrión): en cuanto el cliente paga, se cobra.
      else if (c && c.id === this.customerId && this.phase === 'escaneo' && c.pago > 0 && !this.items.some((i) => i.state !== 'bolsa')) this.startPayment(c);
    }
    // Productos llegando y avanzando por la cinta
    let moving = false;
    for (const it of this.items) {
      if (it.state === 'llega') {
        it.delay -= dt;
        if (it.delay <= 0) {
          it.obj.visible = true;
          it.obj.position.y = Math.max(TOP, it.obj.position.y - dt * 2.2);
          if (it.obj.position.y <= TOP) it.state = 'cinta';
        }
      }
      if (it.state === 'cinta' || it.state === 'llega') {
        const dx = it.slot - it.obj.position.x;
        if (Math.abs(dx) > 0.002) { it.obj.position.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.9); moving = true; }
        it.obj.position.z += (0 - it.obj.position.z) * Math.min(1, dt * 4) * (it.state === 'cinta' ? 1 : 0);
        if (it.state === 'cinta') it.obj.position.y += (TOP - it.obj.position.y) * Math.min(1, dt * 12);
      }
    }
    if (moving || this.beltMoving > 0) this.d.belt.offset.x -= dt * 0.75;
    this.beltMoving = Math.max(0, this.beltMoving - dt);
    // Cajón
    const want = this.phase === 'pago' ? 1 : 0;
    this.drawerOpen += (want - this.drawerOpen) * Math.min(1, dt * 7);
    this.drawer.position.z = 0.2 + this.drawerOpen * 0.4;
    this.stepTweens(dt);
  }

  private stepTweens(dt: number) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      if (t.delay > 0) { t.delay -= dt; continue; }
      t.t += dt;
      const k = Math.min(1, t.t / t.dur), e = 1 - (1 - k) ** 2;
      t.obj.position.lerpVectors(t.from, t.to, e);
      t.obj.position.y += Math.sin(k * Math.PI) * t.arc;
      if (k >= 1) { this.tweens.splice(i, 1); t.done?.(); }
    }
  }

  /** Datos para el panel de la caja. */
  info(): { phase: Phase; scanned: number; total: number; sub: number; paid: number; due: number } {
    const c = this.customerId ? clienteEnCaja(this.d.state(), this.d.caja) : null;
    if (!c) return { phase: this.phase, scanned: 0, total: 0, sub: 0, paid: 0, due: 0 };
    return { phase: this.phase, scanned: c.escaneados, total: totalArticulos(c), sub: importeEscaneado(c), paid: c.pago, due: importe(c) };
  }
}

/** Para pruebas automáticas: posición en pantalla del primer producto de la cinta y del escáner. */
export function tillScreenPoints(t: Till, camera: THREE.Camera, reg: THREE.Object3D) {
  const toScreen = (v: THREE.Vector3) => { const p = reg.localToWorld(v.clone()).project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const it = t.frontItem();
  return { item: it ? toScreen(it.clone().add(new THREE.Vector3(0, 0.05, 0))) : null, scan: toScreen(new THREE.Vector3(SCANNER.x, TOP + 0.05, SCANNER.z)) };
}
