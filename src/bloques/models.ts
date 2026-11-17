// Modelos de Bloques: todo hecho con cubos y texturas pixeladas (estilo de bloques propio del juego).
// Personajes y robots tienen articulaciones (cabeza, brazos, piernas) para animarlos.
import * as THREE from 'three';
import { blockMat } from './textures.ts';
import type { EnemyType, ObstacleKind, WeaponId, CharacterId } from '../shooter/sim.ts';

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
/** Los dos personajes de Bloques: el Coloso (camiseta negra de rayas, sin mangas) y el Halcón (polo blanco, pelo rizado). */
export const LOOKS: Partial<Record<CharacterId, Look>> = {
  coloso: { skin: 0xa86a46, hair: 0x1d140d, shirt: 0x141518, pants: 0x2c3442, shoes: 0x23262b, curly: false, stripes: true, sleeves: false, collar: false, wide: 1.18 },
  halcon: { skin: 0x9a5e3b, hair: 0x22160e, shirt: 0xf3f3ef, pants: 0x2e3a4c, shoes: 0x2a2d33, curly: true, stripes: false, sleeves: true, collar: true, wide: 0.96 },
};
export const lookFor = (c: CharacterId) => LOOKS[c] ?? LOOKS.coloso!;
/** Monstruos con forma de persona (diseños propios del juego). */
export const MOB_LOOKS: Record<'zombi' | 'esqueleto' | 'sombra', Look> = {
  sombra: { skin: 0x0b0b0e, hair: 0x0b0b0e, shirt: 0x0e0e12, pants: 0x0b0b0e, shoes: 0x08080a, curly: false, stripes: false, sleeves: false, collar: false, wide: 0.8, face: 'sombra' },
  zombi: { skin: 0x5f8c4e, hair: 0x2f4a26, shirt: 0x3a6d74, pants: 0x4a3f78, shoes: 0x2c2c34, curly: false, stripes: false, sleeves: true, collar: false, wide: 1.05, face: 'zombi', torn: true },
  esqueleto: { skin: 0xd9d4c4, hair: 0xd9d4c4, shirt: 0xd9d4c4, pants: 0xcfcab8, shoes: 0xbdb8a6, curly: false, stripes: false, sleeves: false, collar: false, wide: 0.7, face: 'calavera' },
};

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
  hand: THREE.Group; mats: THREE.MeshStandardMaterial[]; walk: number; swing: number; px: number; pz: number; held: WeaponId | null;
  label: THREE.Sprite | null; labelText: string;
}

export function makePerson(character: CharacterId | Look): Person {
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
  return { root, body, head, armL, armR, legL, legR, hand, mats: [skin, face, shirt, shirtPlain, pants], walk: 0, swing: 0, px: 0, pz: 0, held: null, label: null, labelText: '' };
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

// ---------- Objetos en la mano (también en primera persona) ----------

const GUN_LEN: Partial<Record<WeaponId, number>> = { pistola: 0.42, subfusil: 0.6, fusil: 0.85, escopeta: 0.9, ametralladora: 1, lanzallamas: 0.85, francotirador: 1.15, tesla: 0.75, granadas: 0.75, cohetes: 1.1 };
const GUN_TINT: Partial<Record<WeaponId, number>> = { lanzallamas: 0xb5532f, tesla: 0x4a8ab5, cohetes: 0x5d7a3e, granadas: 0x5d6b3a };

/** Modelo del arma, orientado hacia +z (hacia delante). */
export function heldModel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  if (id === 'puno') return g;
  if (id === 'palo') {
    const stick = mesh(box(0.09, 0.09, 1.05), blockMat('log'), 0, 0, 0.42, g);
    stick.rotation.x = 0.05;
    mesh(box(0.06, 0.06, 0.22), blockMat('log'), 0.06, 0.06, 0.62, g).rotation.y = 0.6; // rama
    return g;
  }
  if (id === 'martillo') {
    mesh(box(0.08, 0.08, 0.85), blockMat('planks'), 0, 0, 0.34, g);
    mesh(box(0.22, 0.24, 0.42), blockMat('metal'), 0, 0.02, 0.78, g).rotation.x = Math.PI / 2;
    return g;
  }
  const len = GUN_LEN[id] ?? 0.6, metal = blockMat('metalDark'), body = GUN_TINT[id] ? std({ color: GUN_TINT[id], roughness: 0.5, metalness: 0.3 }) : blockMat('metal');
  mesh(box(0.12, 0.16, len), body, 0, 0.04, len / 2 - 0.05, g);
  mesh(box(0.06, 0.06, len * 0.45), metal, 0, 0.08, len, g); // cañón
  mesh(box(0.1, 0.22, 0.12), metal, 0, -0.12, 0.05, g).rotation.x = -0.2; // empuñadura
  if (len > 0.55) mesh(box(0.08, 0.18, 0.1), metal, 0, -0.12, len * 0.5, g); // cargador
  if (id === 'francotirador') mesh(box(0.08, 0.08, 0.36), metal, 0, 0.18, len * 0.5, g);
  if (id === 'tesla') mesh(box(0.18, 0.18, 0.18), std({ color: 0x9ff0ff, emissive: 0x6fd3ff, emissiveIntensity: 2 }), 0, 0.04, len, g);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0.08, len * 1.25); g.add(muzzle);
  return g;
}

export function showHeld(p: Person, id: WeaponId) {
  if (p.held === id) return;
  p.held = id;
  p.hand.clear();
  p.hand.add(heldModel(id)); // con el brazo bajado, el objeto apunta hacia delante
}

// ---------- Robots de bloques ----------

export interface Bot { root: THREE.Group; body: THREE.Group; legs: THREE.Group[]; arms: THREE.Group[]; eyes: THREE.MeshStandardMaterial; skin: THREE.MeshStandardMaterial[]; walk: number; px: number; pz: number; flash: number; rotors: THREE.Object3D[] }

interface BotSpec { w: number; h: number; d: number; head: number; leg: number; tint: number; eye: number; legs: 0 | 2 | 4; arms: boolean; fly?: boolean }
const BOT: Record<EnemyType, BotSpec> = {
  chaser: { w: 0.7, h: 0.7, d: 0.5, head: 0.5, leg: 0.55, tint: 0xd9534f, eye: 0xff3b3b, legs: 2, arms: true },
  tank: { w: 1.5, h: 1.1, d: 1.2, head: 0.7, leg: 0.5, tint: 0x6b7280, eye: 0xffa040, legs: 4, arms: false },
  gunner: { w: 0.8, h: 0.8, d: 0.55, head: 0.5, leg: 0.6, tint: 0x8a6fb5, eye: 0xff5ad8, legs: 2, arms: true },
  kamikaze: { w: 0.75, h: 0.75, d: 0.75, head: 0, leg: 0.3, tint: 0x3a3a3a, eye: 0xff8a1a, legs: 2, arms: false },
  dron: { w: 0.8, h: 0.35, d: 0.8, head: 0, leg: 0, tint: 0x4a8ab5, eye: 0x6fd3ff, legs: 0, arms: false, fly: true },
  jefe: { w: 2.4, h: 2, d: 1.6, head: 1.1, leg: 1.2, tint: 0x4b4f58, eye: 0xff2a2a, legs: 2, arms: true },
  enjambre: { w: 0.4, h: 0.35, d: 0.4, head: 0, leg: 0.2, tint: 0xc9a227, eye: 0xffe066, legs: 2, arms: false },
  escudero: { w: 0.9, h: 0.9, d: 0.6, head: 0.55, leg: 0.6, tint: 0x5f8aa8, eye: 0x9fd8ff, legs: 2, arms: true },
  tirador: { w: 0.6, h: 0.8, d: 0.45, head: 0.42, leg: 0.8, tint: 0x5d7a3e, eye: 0xff2a2a, legs: 2, arms: true },
  reparador: { w: 0.75, h: 0.7, d: 0.55, head: 0.48, leg: 0.55, tint: 0x3f9a6a, eye: 0x6dff8a, legs: 2, arms: true },
};
/** Altura de la cabeza de cada robot (para su barra de vida). */
export const BOT_TOP = Object.fromEntries(Object.entries(BOT).map(([k, s]) => [k, (s.fly ? 2.2 : 0) + s.leg + s.h + s.head + 0.35])) as Record<EnemyType, number>;

export function makeBot(type: EnemyType): Bot {
  const s = BOT[type];
  const plate = blockMat('metal', { tint: s.tint }), dark = blockMat('metalDark');
  const eyes = new THREE.MeshStandardMaterial({ color: s.eye, emissive: s.eye, emissiveIntensity: 2.4 });
  const skin = [plate.clone(), dark.clone()]; // propios: se iluminan al recibir un golpe
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const base = s.fly ? 2.2 : s.leg;
  const legs: THREE.Group[] = [], arms: THREE.Group[] = [], rotors: THREE.Object3D[] = [];
  const legW = Math.min(0.32, s.w * 0.32);
  const legPos = s.legs === 4 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : s.legs === 2 ? [[-1, 0], [1, 0]] : [];
  for (const [lx, lz] of legPos) {
    const g = joint(lx * (s.w / 2 - legW / 2), s.leg, lz * (s.d / 2 - legW / 2), body);
    mesh(box(legW, s.leg, legW), skin[1], 0, -s.leg / 2, 0, g);
    mesh(box(legW * 1.15, 0.1, legW * 1.4), skin[1], 0, -s.leg + 0.05, 0.04, g);
    legs.push(g);
  }
  mesh(box(s.w, s.h, s.d), skin[0], 0, base + s.h / 2, 0, body);
  mesh(box(s.w * 0.6, s.h * 0.35, 0.04), dark, 0, base + s.h * 0.55, s.d / 2 + 0.02, body); // panel del pecho
  if (s.head) {
    const hd = joint(0, base + s.h, 0, body); hd.name = 'head';
    mesh(box(s.head, s.head * 0.85, s.head), skin[0], 0, s.head * 0.42, 0, hd);
    mesh(box(s.head * 0.7, s.head * 0.16, 0.04), eyes, 0, s.head * 0.5, s.head / 2 + 0.02, hd);
    mesh(box(0.05, 0.25, 0.05), dark, s.head * 0.3, s.head * 0.95, 0, hd); // antena
  } else {
    mesh(box(s.w * 0.6, s.h * 0.18, 0.04), eyes, 0, base + s.h * 0.75, s.d / 2 + 0.02, body);
  }
  if (s.arms) for (const sx of [-1, 1]) {
    const g = joint(sx * (s.w / 2 + 0.12), base + s.h * 0.92, 0, body);
    mesh(box(0.2 * (s.w > 1.5 ? 2 : 1), s.h * 0.85, 0.2 * (s.w > 1.5 ? 2 : 1)), skin[1], 0, -s.h * 0.4, 0, g);
    arms.push(g);
  }
  if (type === 'gunner' || type === 'tirador') {
    const gun = mesh(box(0.12, 0.12, type === 'tirador' ? 1.2 : 0.7), dark, 0, -s.h * 0.7, 0.3, arms[1]);
    gun.rotation.x = 0;
    arms[1].rotation.x = -Math.PI / 2; // apunta al frente
  }
  if (type === 'tirador') {
    const laser = new THREE.Mesh(box(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8 }));
    laser.name = 'laser'; laser.position.y = base + s.h * 0.92 - s.h * 0.0; laser.visible = false; root.add(laser);
  }
  if (type === 'escudero') {
    const shield = mesh(box(s.w * 1.3, s.h * 1.5, 0.12), blockMat('cobble', { tint: 0xb9d6ea }), 0, base + s.h * 0.55, s.d / 2 + 0.25, body);
    shield.name = 'shield';
  }
  if (type === 'reparador') {
    const cross = std({ color: 0x6dff8a, emissive: 0x6dff8a, emissiveIntensity: 1.8 });
    mesh(box(0.4, 0.12, 0.05), cross, 0, base + s.h * 0.5, s.d / 2 + 0.05, body);
    mesh(box(0.12, 0.4, 0.05), cross, 0, base + s.h * 0.5, s.d / 2 + 0.05, body);
  }
  if (type === 'kamikaze') {
    const core = std({ color: 0xff8a1a, emissive: 0xff6a00, emissiveIntensity: 2 });
    const c = mesh(box(0.3, 0.3, 0.06), core, 0, base + s.h * 0.4, s.d / 2 + 0.03, body); c.name = 'core';
  }
  if (type === 'jefe') {
    const core = std({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 2.2 });
    mesh(box(0.6, 0.6, 0.06), core, 0, base + s.h * 0.55, s.d / 2 + 0.05, body);
    for (const sx of [-1, 1]) mesh(box(0.7, 0.4, 0.9), skin[1], sx * (s.w / 2 + 0.2), base + s.h + 0.1, 0, body); // hombreras
  }
  if (s.fly) for (const [rx, rz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const r = mesh(box(0.5, 0.03, 0.06), dark, rx * s.w * 0.55, base + s.h + 0.08, rz * s.d * 0.55, body);
    rotors.push(r);
  }
  return { root, body, legs, arms, eyes, skin, walk: 0, px: 0, pz: 0, flash: 0, rotors };
}

export function animateBot(b: Bot, speed: number, dt: number, t: number, hit: boolean, stunned: boolean, reduceMotion: boolean) {
  b.walk += dt * (4 + speed * 1.6);
  const k = Math.min(1, speed / 5), s = reduceMotion ? 0 : Math.sin(b.walk) * 0.7 * k;
  b.legs.forEach((l, i) => { l.rotation.x = i % 2 ? -s : s; });
  b.arms.forEach((a, i) => { if (a.rotation.x > -1.5) a.rotation.x = i % 2 ? s * 0.6 : -s * 0.6; });
  for (const r of b.rotors) r.rotation.y += dt * 40;
  b.body.position.y = b.rotors.length ? Math.sin(t * 3) * 0.12 : Math.abs(Math.sin(b.walk)) * 0.05 * k;
  b.body.position.x = stunned && !reduceMotion ? Math.sin(t * 60) * 0.03 : 0;
  b.flash = hit ? 1 : Math.max(0, b.flash - dt * 8);
  for (const m of b.skin) { m.emissive.setRGB(b.flash * 0.9, b.flash * 0.9, b.flash * 0.9); }
  b.eyes.emissiveIntensity = stunned ? 0.3 : 2.4;
}

// ---------- Escenario ----------

/** Obstáculo del campo hecho de bloques, del tamaño de su radio de choque. */
export function makeObstacle(kind: ObstacleKind, r: number, rot: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rnd = (k: number) => { const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  if (kind === 'rock') {
    const n = r > 1.4 ? 4 : 3, mats = [blockMat('stone'), blockMat('cobble')];
    for (let i = 0; i < n; i++) {
      const s = r * (0.7 + rnd(i) * 0.5), a = rnd(i + 9) * Math.PI * 2, d = i ? r * 0.45 : 0;
      const b = mesh(box(s, s * (0.6 + rnd(i + 3) * 0.6), s), mats[i % 2], Math.cos(a) * d, 0, Math.sin(a) * d, g);
      b.position.y = (b.geometry as THREE.BoxGeometry).parameters.height / 2;
      b.rotation.y = rnd(i + 5) * 0.6;
    }
  } else if (kind === 'tree') {
    const h = 3 + Math.floor(rnd(1) * 2), log = blockMat('log'), top = blockMat('logTop');
    mesh(box(0.6, h, 0.6), [log, log, top, top, log, log], 0, h / 2, 0, g);
    const leaves = blockMat('leaves');
    const L = (x: number, y: number, z: number, s: number) => mesh(box(s, s, s), leaves, x, y, z, g);
    L(0, h + 0.3, 0, 2.6); L(0, h + 1.5, 0, 1.6);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + rnd(i) * 0.5; L(Math.cos(a) * 1.3, h - 0.2 + rnd(i + 2) * 0.6, Math.sin(a) * 1.3, 1.1); }
  } else if (kind === 'crate') {
    mesh(box(1.1, 1.1, 1.1), blockMat('crate'), 0, 0.55, 0, g);
  } else if (kind === 'sandbag') {
    const sand = blockMat('sand');
    for (let i = -1; i <= 1; i++) mesh(box(0.5, 0.5, 0.5), sand, i * 0.5, 0.25, 0, g);
    mesh(box(0.5, 0.5, 0.5), sand, 0, 0.75, 0, g);
  } else if (kind === 'wall' || kind === 'barricade') {
    const p = blockMat('planks');
    for (let i = -1; i <= 1; i++) mesh(box(0.6, 1.2, 0.3), p, i * 0.6, 0.6, 0, g);
  } else if (kind === 'tower') {
    mesh(box(1.8, 2, 1.8), blockMat('cobble'), 0, 1, 0, g);
  } else {
    mesh(box(1.4, 1, 1.4), blockMat('brick'), 0, 0.5, 0, g);
  }
  g.rotation.y = rot;
  return g;
}

// ---------- Recogibles y balas ----------

const coinGeo = box(0.55, 0.55, 0.12);
export function makeCoin() { const g = new THREE.Group(); mesh(coinGeo, blockMat('gold', { emissive: 0x6b4a00 }), 0, 0, 0, g); return g; }
export function makeHealth() {
  const g = new THREE.Group();
  mesh(box(0.5, 0.5, 0.5), std({ color: 0xf2f2f2 }), 0, 0, 0, g);
  const red = std({ color: 0xe5484d, emissive: 0x7a0f12 });
  mesh(box(0.52, 0.14, 0.14), red, 0, 0, 0, g); mesh(box(0.14, 0.52, 0.14), red, 0, 0, 0, g); mesh(box(0.14, 0.14, 0.52), red, 0, 0, 0, g);
  return g;
}
export function makeRapid() { const g = new THREE.Group(); mesh(box(0.45, 0.45, 0.45), std({ color: 0xffd54a, emissive: 0xffa000, emissiveIntensity: 1.4 }), 0, 0, 0, g); return g; }

const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe28a });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff4d3d });
const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 });
const teslaMat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff });
export function makeBullet(kind: string): THREE.Object3D {
  if (kind === 'golpe') return new THREE.Object3D(); // el golpe no se ve: se ve el brazo
  const big = kind === 'cohete' || kind === 'granada';
  const m = new THREE.Mesh(box(big ? 0.22 : 0.08, big ? 0.22 : 0.08, big ? 0.5 : 0.45),
    kind === 'enemiga' ? enemyBulletMat : kind === 'fuego' ? fireMat : kind === 'tesla' || kind === 'rayo' ? teslaMat : bulletMat);
  return m;
}

// ---------- Araña de bloques ----------

export interface Spider { root: THREE.Group; body: THREE.Group; legs: THREE.Group[]; walk: number; mats: THREE.MeshStandardMaterial[] }
export function makeSpider(): Spider {
  const dark = std({ color: 0x2b2420, roughness: 0.9 }), dark2 = std({ color: 0x3a302a, roughness: 0.9 });
  const eyes = std({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 2.2 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  mesh(box(0.9, 0.55, 1.0), dark, 0, 0.55, -0.45, body); // abdomen
  mesh(box(0.6, 0.45, 0.5), dark2, 0, 0.5, 0.25, body); // tórax
  const head = mesh(box(0.55, 0.45, 0.4), dark, 0, 0.52, 0.65, body);
  for (const [x, y] of [[-0.15, 0.08], [0.15, 0.08], [-0.2, -0.05], [0.2, -0.05]]) mesh(box(0.08, 0.08, 0.02), eyes, x, y, 0.21, head);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const g = joint(side * 0.3, 0.55, 0.45 - i * 0.28, body);
    const l = mesh(box(1.0, 0.09, 0.09), dark2, side * 0.5, 0, 0, g);
    l.rotation.z = side * -0.5;
    legs.push(g);
  }
  return { root, body, legs, walk: 0, mats: [dark, dark2] };
}
export function animateSpider(s: Spider, speed: number, dt: number, hit: boolean, reduceMotion: boolean) {
  s.walk += dt * (6 + speed * 2);
  const k = Math.min(1, speed / 3);
  s.legs.forEach((l, i) => { l.rotation.y = reduceMotion ? 0 : Math.sin(s.walk + i * 1.6) * 0.45 * k; });
  for (const m of s.mats) m.emissive.setRGB(hit ? 0.8 : 0, hit ? 0.1 : 0, hit ? 0.1 : 0);
}
