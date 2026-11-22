// Modelos de Bloques: todo hecho con cubos y texturas pixeladas (estilo de bloques propio del juego).
// Los personajes tienen articulaciones (cabeza, brazos, piernas) para animarlos.
import * as THREE from 'three';
import { blockMat } from './textures.ts';
import type { Look as LookId } from './game.ts';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent?.add(m);
  return m;
}
/** Articulación: un grupo que gira desde su extremo superior (hombro, cadera). */
function joint(x: number, y: number, z: number, parent: THREE.Object3D) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

// ---------- Texturas de piel y ropa (8 x 8 píxeles, se escalan sin suavizar) ----------

function pixelTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; draw(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Aspecto de cada personaje de Bloques. */
export interface Look { skin: number; hair: number; shirt: number; pants: number; shoes: number; curly: boolean; stripes: boolean; sleeves: boolean; collar: boolean; wide: number;
  /** Cara: persona, zombi o calavera. */
  face?: 'persona' | 'zombi' | 'calavera' | 'sombra'; torn?: boolean }
/** Los dos aspectos de Bloques: Roble (camiseta negra de rayas, sin mangas) y Brisa (polo blanco, pelo rizado). En línea los reparte el servidor. */
export const LOOKS: Record<LookId, Look> = {
  roble: { skin: 0xa86a46, hair: 0x1d140d, shirt: 0x141518, pants: 0x2c3442, shoes: 0x23262b, curly: false, stripes: true, sleeves: false, collar: false, wide: 1.18 },
  brisa: { skin: 0x9a5e3b, hair: 0x22160e, shirt: 0xf3f3ef, pants: 0x2e3a4c, shoes: 0x2a2d33, curly: true, stripes: false, sleeves: true, collar: true, wide: 0.96 },
};
export const lookFor = (c: LookId) => LOOKS[c];
function faceTex(l: Look) {
  if (l.face === 'zombi') return pixelTex(8, 8, (g) => {
    g.fillStyle = hex(l.skin); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(l.hair); g.fillRect(0, 0, 8, 1); g.fillRect(0, 1, 2, 1); g.fillRect(6, 1, 1, 1);
    g.fillStyle = '#101810'; g.fillRect(1, 3, 2, 2); g.fillRect(5, 3, 2, 2); // ojos hundidos
    g.fillStyle = '#c8302a'; g.fillRect(2, 4, 1, 1); g.fillRect(5, 4, 1, 1);
    g.fillStyle = '#2a3a22'; g.fillRect(2, 6, 4, 1); g.fillRect(1, 7, 1, 1); g.fillRect(6, 7, 1, 1); // boca torcida
  });
  if (l.face === 'sombra') return pixelTex(8, 8, (g) => {
    g.fillStyle = hex(l.skin); g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#f4f4f4'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1); // solo dos ojos blancos
  });
  if (l.face === 'calavera') return pixelTex(8, 8, (g) => {
    g.fillStyle = hex(l.skin); g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#1a1814'; g.fillRect(1, 2, 2, 2); g.fillRect(5, 2, 2, 2); g.fillRect(3, 4, 2, 1); // cuencas y nariz
    g.fillRect(2, 6, 4, 1); g.fillStyle = hex(l.skin); g.fillRect(3, 6, 1, 1); g.fillRect(5, 6, 1, 1); // dientes
  });
  return pixelTex(8, 8, (g) => {
    g.fillStyle = hex(l.skin); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(l.hair); g.fillRect(0, 0, 8, 1); // flequillo
    if (l.curly) { g.fillRect(0, 1, 1, 1); g.fillRect(7, 1, 1, 1); g.fillRect(2, 1, 1, 1); g.fillRect(5, 1, 1, 1); }
    g.fillStyle = '#2a1a10'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1); // cejas
    g.fillStyle = '#ffffff'; g.fillRect(1, 4, 2, 1); g.fillRect(5, 4, 2, 1); // ojos
    g.fillStyle = '#2b1b12'; g.fillRect(2, 4, 1, 1); g.fillRect(5, 4, 1, 1);
    g.fillStyle = hex(new THREE.Color(l.skin).multiplyScalar(0.8).getHex()); g.fillRect(3, 5, 2, 1); // nariz
    g.fillStyle = '#ffffff'; g.fillRect(2, 6, 4, 1); // sonrisa
    g.fillStyle = '#6b2d22'; g.fillRect(2, 7, 4, 1);
  });
}
function hairTex(l: Look, top: boolean) {
  return pixelTex(8, 8, (g) => {
    g.fillStyle = hex(l.skin); g.fillRect(0, 0, 8, 8);
    g.fillStyle = hex(l.hair);
    g.fillRect(0, 0, 8, top ? 8 : l.curly ? 3 : 2);
    if (!top) for (let x = 0; x < 8; x += 2) g.fillRect(x + (l.curly ? 1 : 0), l.curly ? 3 : 2, 1, 1);
    if (top && l.curly) { g.fillStyle = hex(new THREE.Color(l.hair).multiplyScalar(1.8).getHex()); for (let i = 0; i < 10; i++) g.fillRect((i * 3) % 8, (i * 5) % 8, 1, 1); }
  });
}
function shirtTex(l: Look) {
  return pixelTex(8, 8, (g) => {
    g.fillStyle = hex(l.shirt); g.fillRect(0, 0, 8, 8);
    if (l.torn) { g.fillStyle = hex(l.skin); g.fillRect(1, 6, 2, 2); g.fillRect(5, 5, 1, 3); g.fillRect(6, 7, 2, 1); }
    if (l.face === 'calavera') { g.fillStyle = '#1a1814'; for (let y = 1; y < 7; y += 2) { g.fillRect(1, y, 2, 1); g.fillRect(5, y, 2, 1); } g.fillRect(3, 0, 2, 8); g.fillStyle = hex(l.shirt); g.fillRect(3, 0, 1, 8); }
    if (l.stripes) for (let i = -8; i < 16; i += 3) {
      g.fillStyle = i % 2 ? '#ff8a5c' : '#f2f2f2';
      for (let k = 0; k < 8; k++) { const x = i + k, y = 7 - k; if (y >= 3 && x >= 0 && x < 8) g.fillRect(x, y, 1, 1); }
    }
    if (l.collar) { g.fillStyle = '#d9d9d4'; g.fillRect(2, 0, 4, 1); g.fillRect(3, 1, 2, 2); g.fillStyle = '#b5b5ae'; g.fillRect(4, 1, 1, 2); }
  });
}

// ---------- Personajes ----------

export interface Person {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  hand: THREE.Group; mats: THREE.MeshStandardMaterial[]; walk: number; swing: number; px: number; pz: number;
  label: THREE.Sprite | null; labelText: string;
}

export function makePerson(character: LookId | Look): Person {
  const l = typeof character === 'string' ? lookFor(character) : character, W = l.wide;
  const skin = std({ color: l.skin }), hair = std({ color: l.hair, roughness: 1 });
  const face = std({ map: faceTex(l) }), side = std({ map: hairTex(l, false) }), top = std({ map: hairTex(l, true), roughness: 1 });
  const shirt = std({ map: shirtTex(l) }), shirtPlain = std({ color: l.shirt }), pants = std({ color: l.pants }), shoes = std({ color: l.shoes, roughness: 0.6 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // Piernas (giran en la cadera)
  const legL = joint(-0.13 * W, 0.78, 0, body), legR = joint(0.13 * W, 0.78, 0, body);
  for (const leg of [legL, legR]) { mesh(box(0.25 * W, 0.62, 0.27), pants, 0, -0.31, 0, leg); mesh(box(0.26 * W, 0.16, 0.32), shoes, 0, -0.7, 0.03, leg); }
  // Torso: camiseta (frente con dibujo) y cuello
  mesh(box(0.54 * W, 0.72, 0.3 * Math.min(W, 1.1)), [shirtPlain, shirtPlain, shirtPlain, shirtPlain, shirt, shirtPlain], 0, 1.14, 0, body);
  // Brazos (giran en el hombro): piel; manga corta si la camiseta la tiene
  const armL = joint(-(0.27 * W + 0.12), 1.46, 0, body), armR = joint(0.27 * W + 0.12, 1.46, 0, body);
  for (const arm of [armL, armR]) {
    mesh(box(0.22, 0.68, 0.22), skin, 0, -0.32, 0, arm);
    if (l.sleeves) mesh(box(0.25, 0.26, 0.25), shirtPlain, 0, -0.1, 0, arm);
  }
  const hand = joint(0, -0.62, 0.06, armR); // lo que lleva en la mano
  // Cabeza (gira para mirar)
  const head = joint(0, 1.5, 0, body);
  mesh(box(0.5, 0.5, 0.5), [side, side, top, skin, face, side], 0, 0.26, 0, head);
  if (l.curly) for (let i = 0; i < 9; i++) mesh(box(0.14, 0.12, 0.14), hair, ((i % 3) - 1) * 0.17, 0.55, (Math.floor(i / 3) - 1.2) * 0.17, head);
  return { root, body, head, armL, armR, legL, legR, hand, mats: [skin, face, shirt, shirtPlain, pants], walk: 0, swing: 0, px: 0, pz: 0, label: null, labelText: '' };
}

/** Animación: andar (brazos y piernas), respirar, golpear y caer. */
export function animatePerson(p: Person, speed: number, dt: number, t: number, down: boolean, reduceMotion: boolean) {
  const k = Math.min(1, speed / 9);
  p.walk += dt * (5 + speed * 1.1);
  const s = reduceMotion ? 0 : Math.sin(p.walk) * 0.8 * k;
  p.legL.rotation.x = s; p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8;
  p.swing = Math.max(0, p.swing - dt * 4.5);
  // Golpe: el brazo derecho sube y baja en arco
  const sw = p.swing > 0 ? Math.sin((1 - p.swing) * Math.PI) : 0;
  p.armR.rotation.x = s * 0.8 - sw * 2.1;
  p.armR.rotation.z = -sw * 0.3;
  p.body.position.y = reduceMotion ? 0 : Math.abs(Math.sin(p.walk)) * 0.06 * k + Math.sin(t * 2) * 0.008;
  p.body.rotation.x = THREE.MathUtils.lerp(p.body.rotation.x, down ? -Math.PI / 2 : 0, Math.min(1, dt * 6));
  p.body.position.z = down ? -0.5 : 0;
}

/** Cartel con el nombre que flota sobre un jugador. `muted` = jugador bloqueado (gris y en cursiva). */
export function makeLabel(text: string, muted = false): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = `${muted ? '600 italic' : '700'} 30px Oswald, 'Arial Narrow', sans-serif`;
  const w = Math.min(312, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(20, 24, 14, 0.78)';
  g.fillRect((320 - w) / 2, 10, w, 44);
  g.fillStyle = muted ? '#b3b199' : '#d7ecb0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 160, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(1.98, 0.396, 1);
  sp.renderOrder = 8;
  return sp;
}
