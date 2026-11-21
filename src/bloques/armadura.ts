// Armadura sobre el modelo de un personaje: casco en la cabeza, peto en el torso y botas en las piernas,
// del color del material. Se ve en los demás jugadores (en primera persona no te ves a ti).
import * as THREE from 'three';
import { ITEMS } from './items.ts';
import type { Person } from './models.ts';

const COLORS = [0xd8d8dc, 0xffd23a, 0x5ee8df]; // hierro, oro, diamante
const mats = COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.55 }));
function piece(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, tag: THREE.Object3D[]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  parent.add(m); tag.push(m);
}

/** Viste (o desviste) a un personaje con las piezas dadas: [casco, peto, botas], id del objeto o null. */
export function dressPerson(p: Person & { armorParts?: THREE.Object3D[] }, armor: (number | null)[]) {
  for (const o of p.armorParts ?? []) o.parent?.remove(o);
  const parts: THREE.Object3D[] = (p.armorParts = []);
  const mat = (i: number) => { const a = armor[i] !== null && armor[i] !== undefined ? ITEMS.get(armor[i]!)?.armor : undefined; return a && a.piece === i ? mats[a.mat] : null; };
  const casco = mat(0), peto = mat(1), botas = mat(2);
  // Casco: tapa la coronilla, la nuca y las sienes, y deja la cara a la vista
  if (casco) { piece(0.58, 0.18, 0.58, casco, 0, 0.47, 0, p.head, parts); piece(0.58, 0.3, 0.1, casco, 0, 0.26, -0.25, p.head, parts); for (const x of [-0.26, 0.26]) piece(0.08, 0.22, 0.3, casco, x, 0.3, -0.08, p.head, parts); }
  if (peto) { piece(0.74, 0.56, 0.42, peto, 0, 1.2, 0, p.body, parts); piece(0.9, 0.16, 0.36, peto, 0, 1.46, 0, p.body, parts); }
  if (botas) for (const leg of [p.legL, p.legR]) piece(0.32, 0.3, 0.38, botas, 0, -0.64, 0.03, leg, parts);
}
