// Efectos de Bloques: trocitos que saltan al romper un bloque o vencer a una criatura, y polvo que sube.
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
const SOFT = softTexture();
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

interface Bit { o: THREE.Object3D; vx: number; vy: number; vz: number; life: number; max: number; gravity: number; grow: number; size: number; spin: number; mat?: THREE.SpriteMaterial; opacity: number }

export class Effects {
  private bits: Bit[] = [];
  private cubeMats = new Map<number, THREE.MeshStandardMaterial>();
  constructor(private scene: THREE.Scene) {}

  private add(b: Bit) { this.bits.push(b); this.scene.add(b.o); }
  private cubeMat(color: number) {
    let m = this.cubeMats.get(color);
    if (!m) this.cubeMats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 })));
    return m;
  }

  /** Trocitos sólidos del color dado que saltan desde un punto y encogen hasta desaparecer. */
  debris(x: number, y: number, z: number, color: number, n: number, power = 7, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const o = new THREE.Mesh(cubeGeo, this.cubeMat(color));
      o.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2, s = power * (0.3 + Math.random());
      const sz = size * (0.6 + Math.random() * 0.8), life = 0.6 + Math.random() * 0.6;
      o.scale.setScalar(sz);
      this.add({ o, vx: Math.cos(a) * s, vy: 3 + Math.random() * 6, vz: Math.sin(a) * s, life, max: life, gravity: 20, grow: 0, size: sz, spin: 10, opacity: 1 });
    }
  }

  /** Nubecillas de polvo que suben y se deshacen. */
  smoke(x: number, y: number, z: number, n: number, color = 0x6b6b6b, size = 1, rise = 1.5) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: SOFT, color, transparent: true, opacity: 0.55, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.set(x + (Math.random() - 0.5) * size, y + Math.random() * 0.4, z + (Math.random() - 0.5) * size);
      const life = 0.9 + Math.random() * 0.9;
      this.add({ o: s, mat, vx: (Math.random() - 0.5) * 1.2, vy: rise * (0.6 + Math.random() * 0.6), vz: (Math.random() - 0.5) * 1.2,
        life, max: life, gravity: 0, grow: 1.6 * size, size: size * (0.6 + Math.random() * 0.5), spin: 0, opacity: 0.55 });
    }
  }

  update(dt: number) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) { this.scene.remove(b.o); b.mat?.dispose(); this.bits.splice(i, 1); continue; }
      const k = b.life / b.max; // de 1 a 0
      b.vy -= b.gravity * dt;
      b.o.position.x += b.vx * dt; b.o.position.y += b.vy * dt; b.o.position.z += b.vz * dt;
      if (b.spin) { b.o.rotation.x += b.spin * dt; b.o.rotation.z += b.spin * 0.7 * dt; }
      const s = Math.max(0.01, b.size + b.grow * (1 - k));
      if (b.mat) { b.o.scale.set(s, s, 1); b.mat.opacity = b.opacity * k; } else b.o.scale.setScalar(s * Math.min(1, k * 4));
    }
  }

  clear() {
    for (const b of this.bits) { this.scene.remove(b.o); b.mat?.dispose(); }
    this.bits.length = 0;
  }
}
