// Criaturas de la noche de Bloques, diseños propios hechos con cubos: el pedrusco (una roca con musgo que anda
// y embiste), el espino (una planta alta que lanza púas) y el brincón (pequeño, morado y muy rápido).
// Todas miran hacia +z y tienen los pies en y = 0.
import * as THREE from 'three';
import { blockMat } from './textures.ts';
import type { MobKind } from './game.ts';

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function joint(x: number, y: number, z: number, parent: THREE.Object3D) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}
const flat = (color: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const glow = (color: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8 });

export interface Creature {
  kind: MobKind; root: THREE.Group; body: THREE.Group;
  /** Partes que se balancean al andar (piernas, brazos, hojas), por parejas alternas. */
  limbs: THREE.Group[];
  /** Materiales que destellan al recibir un golpe. */
  mats: THREE.MeshStandardMaterial[];
  baseY: number; walk: number;
}

function makePedrusco(): Creature {
  // Los materiales de bloque se comparten: aquí se copian para poder hacerlos destellar sin tocar el mundo
  const rock = blockMat('cobble').clone(), rock2 = blockMat('stone').clone(), moss = flat(0x5c9a3e), eye = glow(0xffb02e);
  const root = new THREE.Group(), body = joint(0, 0.62, 0, root);
  part(box(0.95, 0.9, 0.8), rock, 0, 0.5, 0, body);
  part(box(0.7, 0.3, 0.6), rock2, 0, 1.08, -0.02, body); // coronilla
  part(box(0.74, 0.08, 0.64), moss, 0, 1.26, -0.02, body); // musgo
  part(box(0.3, 0.1, 0.3), moss, -0.3, 0.98, 0.2, body);
  for (const x of [-0.2, 0.2]) part(box(0.16, 0.12, 0.04), eye, x, 0.62, 0.41, body);
  part(box(0.4, 0.07, 0.04), flat(0x2a2c30), 0, 0.36, 0.41, body); // boca: una grieta
  const limbs: THREE.Group[] = [];
  for (const x of [-0.26, 0.26]) { const leg = joint(x, 0.62, 0, root); part(box(0.3, 0.62, 0.34), rock2, 0, -0.31, 0, leg); limbs.push(leg); }
  for (const x of [-0.62, 0.62]) { const arm = joint(x, 0.88, 0, body); part(box(0.26, 0.8, 0.3), rock, 0, -0.36, 0, arm); part(box(0.32, 0.26, 0.36), rock2, 0, -0.8, 0, arm); limbs.push(arm); }
  return { kind: 'pedrusco', root, body, limbs, mats: [rock, rock2], baseY: 0.62, walk: 0 };
}

function makeEspino(): Creature {
  const stem = flat(0x3f8a3a), dark = flat(0x2c6a2e), bulb = flat(0xc2377e), petal = flat(0xe85aa0), thorn = flat(0xe8e2c4, 0.6), eye = glow(0xfff06a);
  const root = new THREE.Group(), body = joint(0, 0.2, 0, root);
  part(box(0.24, 1.25, 0.24), stem, 0, 0.62, 0, body); // tallo
  const head = joint(0, 1.3, 0, body);
  part(box(0.56, 0.5, 0.56), bulb, 0, 0.22, 0, head);
  for (const [x, z] of [[-0.36, 0], [0.36, 0], [0, -0.36], [0, 0.36]]) part(box(x ? 0.18 : 0.44, 0.1, z ? 0.18 : 0.44), petal, x, 0.03, z, head); // corola
  part(box(0.3, 0.16, 0.3), petal, 0, 0.54, 0, head);
  for (const x of [-0.13, 0.13]) part(box(0.1, 0.12, 0.04), eye, x, 0.26, 0.29, head);
  // Púas a lo largo del tallo
  for (const [x, y, z] of [[0.18, 0.4, 0], [-0.18, 0.62, 0], [0, 0.8, 0.18], [0, 0.3, -0.18], [0.18, 1.02, 0], [-0.18, 1.1, 0.05]]) part(box(x ? 0.16 : 0.06, 0.06, z ? 0.16 : 0.06), thorn, x, y, z, body);
  const limbs: THREE.Group[] = [];
  // Raíces que hacen de pies y dos hojas que hacen de brazos
  for (const x of [-0.16, 0.16]) { const foot = joint(x, 0.2, 0, root); part(box(0.18, 0.2, 0.42), dark, 0, -0.1, 0.06, foot); limbs.push(foot); }
  for (const x of [-1, 1]) { const leaf = joint(x * 0.12, 0.92, 0, body); const l = part(box(0.5, 0.08, 0.26), stem, x * 0.27, 0, 0, leaf); l.rotation.z = x * -0.35; limbs.push(leaf); }
  return { kind: 'espino', root, body, limbs, mats: [stem, bulb, petal, dark], baseY: 0.2, walk: 0 };
}

function makeBrincon(): Creature {
  const fur = flat(0x7a4fd0), fur2 = flat(0x5a36a6), belly = flat(0xefe3c8), eye = glow(0x7df9ff), pupil = flat(0x14121c);
  const root = new THREE.Group(), body = joint(0, 0.3, 0, root);
  part(box(0.86, 0.5, 0.9), fur, 0, 0.25, 0, body);
  part(box(0.6, 0.26, 0.5), belly, 0, 0.14, 0.24, body);
  for (const x of [-0.22, 0.22]) { part(box(0.22, 0.22, 0.05), eye, x, 0.34, 0.46, body); part(box(0.09, 0.12, 0.03), pupil, x, 0.34, 0.49, body); }
  for (const x of [-0.26, 0.26]) part(box(0.14, 0.3, 0.1), fur2, x, 0.62, -0.1, body); // orejas
  part(box(0.2, 0.16, 0.2), fur2, 0, 0.3, -0.52, body); // cola
  const limbs: THREE.Group[] = [];
  for (const x of [-0.36, 0.36]) { const leg = joint(x, 0.3, -0.2, root); part(box(0.22, 0.34, 0.5), fur2, 0, -0.14, 0.08, leg); limbs.push(leg); }
  for (const x of [-0.3, 0.3]) { const paw = joint(x, 0.3, 0.3, root); part(box(0.16, 0.3, 0.18), fur2, 0, -0.15, 0, paw); limbs.push(paw); }
  return { kind: 'brincon', root, body, limbs, mats: [fur, fur2, belly], baseY: 0.3, walk: 0 };
}

export function makeCreature(kind: MobKind): Creature {
  return kind === 'pedrusco' ? makePedrusco() : kind === 'espino' ? makeEspino() : makeBrincon();
}

/** Anima una criatura según lo deprisa que se mueve (bloques por segundo). Con "reducir movimiento" solo se desplaza. */
export function animateCreature(c: Creature, speed: number, dt: number, t: number, hit: boolean, reduceMotion: boolean) {
  const k = reduceMotion ? 0 : Math.min(1, speed / 2.5);
  c.walk += dt * (c.kind === 'brincon' ? 14 : 7) * Math.min(1.5, speed / 2 + 0.2);
  const s = Math.sin(c.walk);
  c.limbs.forEach((l, i) => { l.rotation.x = (i % 2 ? -s : s) * (c.kind === 'pedrusco' ? 0.5 : 0.7) * k; });
  if (c.kind === 'brincon') c.body.position.y = c.baseY + Math.abs(s) * 0.22 * k; // va a saltitos
  else if (c.kind === 'espino') { c.body.rotation.z = reduceMotion ? 0 : Math.sin(t * 2.2) * 0.05 + s * 0.06 * k; c.body.position.y = c.baseY; } // se mece
  else c.body.position.y = c.baseY + Math.abs(Math.cos(c.walk)) * 0.04 * k;
  for (const m of c.mats) m.emissive.setRGB(hit ? 0.75 : 0, hit ? 0.12 : 0, hit ? 0.08 : 0);
}
