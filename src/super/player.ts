// Primera persona: el jugador es el empleado y camina por la tienda.
// - Ordenador: WASD o flechas para andar (Mayús para correr), ratón para mirar. Un clic fija el ratón
//   (también la tecla L); si el navegador no lo permite, se mira arrastrando.
// - Móvil y tableta: joystick en la mitad izquierda para andar y arrastrar en la derecha para mirar.
// Las colisiones usan la misma rejilla que los clientes (walkable de sim.ts).
import * as THREE from 'three';
import { walkable } from './sim.ts';

const EYE = 1.62;
const WALK = 2.6, RUN = 4.4;
const LOOK_MOUSE = 0.0024, LOOK_DRAG = 0.0055, LOOK_TOUCH = 0.006;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface PlayerDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  /** ¿Puede moverse ahora? (no en pausa, ni con una ventana abierta, ni en la caja) */
  canAct: () => boolean;
  /** Toque o clic para interactuar: en el punto tocado, o en el centro si es con el ratón fijado. */
  onInteract: (clientX: number | null, clientY: number | null) => void;
}

export class Player {
  enabled = false;
  pos = new THREE.Vector2(0.5, 4.2);
  yaw = 0;
  pitch = -0.12;
  private keys = new Set<string>();
  private d: PlayerDeps;
  private bob = 0;
  private stick: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private looks = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean; mouse: boolean }>();
  private lockFailed = false;
  /** Momento en que se soltó el ratón (para no confundir el Esc del navegador con una pausa). */
  unlockedAt = 0;
  readonly stickEl: HTMLElement;
  readonly knobEl: HTMLElement;

  constructor(d: PlayerDeps) {
    this.d = d;
    this.stickEl = document.getElementById('joy')!;
    this.knobEl = this.stickEl.querySelector<HTMLElement>('.knob')!;
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        this.keys.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
      if (k === 'l' && this.d.canAct()) this.toggleLock();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { if (!this.locked) this.unlockedAt = performance.now(); });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    const c = d.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.cancel(e));
  }

  get locked() { return document.pointerLockElement === this.d.canvas; }

  toggleLock() {
    if (this.locked) { document.exitPointerLock(); return; }
    this.lock();
  }
  lock() {
    if (this.lockFailed || matchMedia('(pointer: coarse)').matches) return;
    try {
      const r = this.d.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => { this.lockFailed = true; });
    } catch { this.lockFailed = true; }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }

  /** Coloca al jugador mirando en la dirección actual de la cámara (al volver de la caja). */
  syncFromCamera() {
    const cam = this.d.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)), -1.2, 1.2);
    this.pitch = Math.max(this.pitch, -0.6);
    const p = new THREE.Vector2(cam.position.x, cam.position.z);
    if (walkable({ x: p.x, z: p.y })) this.pos.copy(p);
  }

  place(x: number, z: number, yaw: number) { this.pos.set(x, z); this.yaw = yaw; this.pitch = -0.12; }

  // ---------- Puntero ----------

  private down(e: PointerEvent) {
    if (!this.enabled || !this.d.canAct()) return;
    const touch = e.pointerType !== 'mouse';
    if (!touch) {
      if (this.locked) { if (e.button === 0) this.d.onInteract(null, null); return; }
      // Primer clic: fija el ratón. Si no se puede, se mira arrastrando.
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, mouse: true });
      return;
    }
    const left = e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.3;
    if (left && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.add('on');
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, mouse: false });
    }
    try { this.d.canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
  }

  private move(e: PointerEvent) {
    if (!this.enabled) return;
    if (this.locked && e.pointerType === 'mouse') {
      if (!this.d.canAct()) return;
      this.turn(e.movementX * LOOK_MOUSE, e.movementY * LOOK_MOUSE);
      return;
    }
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick.x = e.clientX; this.stick.y = e.clientY;
      const dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0, d = Math.hypot(dx, dy), m = Math.min(d, 48) / (d || 1);
      this.knobEl.style.transform = `translate(calc(-50% + ${dx * m}px), calc(-50% + ${dy * m}px))`;
      return;
    }
    const l = this.looks.get(e.pointerId);
    if (!l) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY;
    if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) > 8) l.moved = true;
    if (l.moved && this.d.canAct()) { const s = l.mouse ? LOOK_DRAG : LOOK_TOUCH; this.turn(dx * s, dy * s); }
  }

  private up(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickEl.classList.remove('on'); return; }
    const l = this.looks.get(e.pointerId);
    this.looks.delete(e.pointerId);
    if (!l || !this.enabled || !this.d.canAct()) return;
    const quick = performance.now() - l.t < 450;
    if (!l.moved && quick) {
      if (l.mouse && !this.lockFailed) { this.lock(); return; }
      this.d.onInteract(e.clientX, e.clientY);
    }
  }

  private cancel(e: PointerEvent) {
    if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickEl.classList.remove('on'); }
    this.looks.delete(e.pointerId);
  }

  private turn(dx: number, dy: number) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.25, 1.25);
  }

  /** Suelta todo lo que esté pulsado (al abrir una ventana o pausar). */
  release() {
    this.keys.clear();
    this.looks.clear();
    if (this.stick) { this.stick = null; this.stickEl.classList.remove('on'); }
  }

  // ---------- Movimiento ----------

  update(dt: number) {
    if (!this.enabled) return;
    let fx = 0, fz = 0, run = this.keys.has('shift');
    if (this.d.canAct()) {
      if (this.keys.has('w') || this.keys.has('arrowup')) fz += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) fz -= 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) fx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) fx += 1;
      if (this.stick) {
        const dx = this.stick.x - this.stick.x0, dy = this.stick.y - this.stick.y0, d = Math.hypot(dx, dy);
        if (d > 6) { const k = Math.min(1, d / 48); fx += (dx / d) * k; fz -= (dy / d) * k; run = run || k > 0.95; }
      }
    } else this.release();
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const speed = (run ? RUN : WALK) * dt;
    // Adelante es -z cuando yaw = 0
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const mx = (fx * cos - fz * sin) * speed, mz = (-fx * sin - fz * cos) * speed;
    // Se intenta en x y en z por separado: así se resbala a lo largo de muebles y paredes.
    if (mx && walkable({ x: this.pos.x + mx, z: this.pos.y })) this.pos.x += mx;
    if (mz && walkable({ x: this.pos.x, z: this.pos.y + mz })) this.pos.y += mz;
    const moving = len > 0.05;
    if (moving && !reducedMotion) this.bob += dt * (run ? 13 : 9); else this.bob *= 0.9;
    const cam = this.d.camera;
    cam.position.set(this.pos.x, EYE + (reducedMotion ? 0 : Math.sin(this.bob) * 0.025), this.pos.y);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
