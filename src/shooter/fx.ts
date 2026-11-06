// Efectos visuales: chispas, humo, fogonazos, polvo, escombros, marcas de explosión y textos flotantes.
import * as THREE from 'three';

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const SOFT = softTexture();

interface P {
  o: THREE.Object3D; vx: number; vy: number; vz: number; life: number; max: number;
  gravity: number; grow: number; size: number; fade: number; spin: number; mat?: THREE.SpriteMaterial | THREE.MeshBasicMaterial; floor: number;
}

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const scorchGeo = new THREE.CircleGeometry(1, 24);
const flashGeo = new THREE.SphereGeometry(1, 16, 12);

export class Effects {
  private ps: P[] = [];
  private cubeMats = new Map<number, THREE.MeshStandardMaterial>();
  private textTex = new Map<string, THREE.CanvasTexture>();
  constructor(private scene: THREE.Scene) {}

  private add(p: P) { this.ps.push(p); this.scene.add(p.o); }
  private cubeMat(color: number) {
    let m = this.cubeMats.get(color);
    if (!m) this.cubeMats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 })));
    return m;
  }
  private sprite(color: number, opacity: number, additive = false, overlay = false) {
    // overlay: se dibuja por encima del suelo (si no, un sprite grande queda cortado en recto por el terreno)
    const mat = new THREE.SpriteMaterial({ map: SOFT, color, transparent: true, opacity, depthWrite: false, depthTest: !overlay,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    return { s: new THREE.Sprite(mat), mat };
  }

  /** Trozos sólidos que saltan y rebotan en el suelo. */
  debris(x: number, y: number, z: number, color: number, n: number, power = 7, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const o = new THREE.Mesh(cubeGeo, this.cubeMat(color));
      o.position.set(x, y, z);
      o.castShadow = true;
      const a = Math.random() * Math.PI * 2, s = power * (0.3 + Math.random());
      const sz = size * (0.6 + Math.random() * 0.8), life = 0.6 + Math.random() * 0.6;
      o.scale.setScalar(sz);
      this.add({ o, vx: Math.cos(a) * s, vy: 3 + Math.random() * 6, vz: Math.sin(a) * s, life, max: life, gravity: 20, grow: 0, size: sz, fade: 0.25, spin: 10, floor: sz / 2 });
    }
  }

  /** Chispas brillantes (impactos). */
  sparks(x: number, y: number, z: number, color: number, n: number, power = 6) {
    for (let i = 0; i < n; i++) {
      const { s, mat } = this.sprite(color, 1, true);
      s.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, sp = power * (0.4 + Math.random()), life = 0.15 + Math.random() * 0.2;
      this.add({ o: s, mat, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, life, max: life, gravity: 12, grow: -0.5, size: 0.35, fade: 1, spin: 0, floor: 0.05 });
    }
  }

  smoke(x: number, y: number, z: number, n: number, color = 0x6b6b6b, size = 1, rise = 1.5) {
    for (let i = 0; i < n; i++) {
      const { s, mat } = this.sprite(color, 0.55);
      s.position.set(x + (Math.random() - 0.5) * size, y + Math.random() * 0.4, z + (Math.random() - 0.5) * size);
      const life = 0.9 + Math.random() * 0.9;
      this.add({ o: s, mat, vx: (Math.random() - 0.5) * 1.2, vy: rise * (0.6 + Math.random() * 0.6), vz: (Math.random() - 0.5) * 1.2,
        life, max: life, gravity: 0, grow: 1.6 * size, size: size * (0.6 + Math.random() * 0.5), fade: 1, spin: 0, floor: -99 });
    }
  }

  dust(x: number, z: number) {
    const { s, mat } = this.sprite(0xb79f78, 0.35);
    s.position.set(x + (Math.random() - 0.5) * 0.3, 0.15, z + (Math.random() - 0.5) * 0.3);
    this.add({ o: s, mat, vx: 0, vy: 0.4, vz: 0, life: 0.5, max: 0.5, gravity: 0, grow: 1.2, size: 0.35, fade: 1, spin: 0, floor: -99 });
  }

  muzzle(pos: THREE.Vector3, color = 0xffd27a, size = 0.6) {
    const { s, mat } = this.sprite(color, 1, true);
    s.position.copy(pos);
    this.add({ o: s, mat, vx: 0, vy: 0, vz: 0, life: 0.06, max: 0.06, gravity: 0, grow: 0, size, fade: 1, spin: 0, floor: -99 });
  }

  explosion(x: number, z: number, r: number) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.7, depthWrite: false });
    const f = new THREE.Mesh(flashGeo, mat);
    f.position.set(x, 0.4, z);
    this.add({ o: f, mat, vx: 0, vy: 0, vz: 0, life: 0.16, max: 0.16, gravity: 0, grow: r * 0.8, size: r * 0.35, fade: 1, spin: 0, floor: -99 });
    // Bola de fuego: varias nubes opacas que crecen y pasan de amarillo a rojo
    const cols = [0xffe066, 0xffb02e, 0xff7a1a, 0xe2481c];
    for (let i = 0; i < 7; i++) {
      const { s, mat: m } = this.sprite(cols[i % cols.length], 0.95, false, true);
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.35;
      s.position.set(x + Math.cos(a) * d, 0.8 + Math.random() * 0.8, z + Math.sin(a) * d);
      const life = 0.3 + Math.random() * 0.25;
      this.add({ o: s, mat: m, vx: Math.cos(a) * 2, vy: 1.5 + Math.random() * 2, vz: Math.sin(a) * 2, life, max: life, gravity: 0,
        grow: r * 0.7, size: r * (0.35 + Math.random() * 0.25), fade: 0.6, spin: 0, floor: -99 });
    }
    this.sparks(x, 0.8, z, 0xffb347, 16, 12);
    this.smoke(x, 0.6, z, Math.round(5 + r * 2), 0x585450, r * 0.8, 2.5);
    this.debris(x, 0.3, z, 0x6b4a2b, 8, 8, 0.2);
    // Marca quemada en el suelo
    const sm = new THREE.MeshBasicMaterial({ map: SOFT, color: 0x1e160e, transparent: true, opacity: 0.7, depthWrite: false });
    const sc = new THREE.Mesh(scorchGeo, sm);
    sc.rotation.x = -Math.PI / 2;
    sc.position.set(x, 0.015 + Math.random() * 0.005, z);
    this.add({ o: sc, mat: sm, vx: 0, vy: 0, vz: 0, life: 14, max: 14, gravity: 0, grow: 0, size: r * 1.05, fade: 0.25, spin: 0, floor: -99 });
  }

  /** Texto flotante (p. ej. "+3 🪙"). */
  text(x: number, y: number, z: number, str: string, color = '#ffd54a') {
    const key = str + color;
    let tex = this.textTex.get(key);
    if (!tex) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 96;
      const g = c.getContext('2d')!;
      g.font = '900 64px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(str, 128, 50);
      g.fillStyle = color; g.fillText(str, 128, 50);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textTex.set(key, tex);
    }
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.renderOrder = 10;
    this.add({ o: s, mat, vx: 0, vy: 2.2, vz: 0, life: 0.9, max: 0.9, gravity: 2, grow: 0, size: 1.6, fade: 0.4, spin: 0, floor: -99 });
  }

  update(dt: number) {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.o);
        if (p.mat) p.mat.dispose();
        this.ps.splice(i, 1);
        continue;
      }
      const k = p.life / p.max; // 1 → 0
      p.vy -= p.gravity * dt;
      p.o.position.x += p.vx * dt; p.o.position.y += p.vy * dt; p.o.position.z += p.vz * dt;
      if (p.o.position.y < p.floor) { p.o.position.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
      if (p.spin) { p.o.rotation.x += p.spin * dt; p.o.rotation.z += p.spin * 0.7 * dt; }
      const fadeK = Math.min(1, k / p.fade);
      let s = Math.max(0.01, p.size + p.grow * (1 - k));
      if (!p.mat) s *= fadeK; // los sólidos encogen en vez de volverse transparentes
      if (p.o instanceof THREE.Sprite) p.o.scale.set(s, p.o.material.map === SOFT ? s : s * 0.375, 1); // el texto es 256×96
      else p.o.scale.setScalar(s);
      if (p.mat) p.mat.opacity = fadeK * (p.mat.userData.base ?? (p.mat.userData.base = p.mat.opacity));
    }
  }

  clear() {
    for (const p of this.ps) { this.scene.remove(p.o); p.mat?.dispose(); }
    this.ps.length = 0;
  }
}
