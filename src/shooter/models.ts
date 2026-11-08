// Modelos 3D low-poly hechos con primitivas de Three.js (sin archivos externos) y sus animaciones.
import * as THREE from 'three';
import type { EnemyType, WeaponId, ObstacleKind, CharacterId } from './sim.ts';

const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

/** Materiales compartidos (menos cambios de estado en la GPU). */
export const MAT = {
  uniform: std(0x5d7a3e), uniformDark: std(0x46602d), vest: std(0x3b4a2a), skin: std(0xe2b48c), helmet: std(0x5a6e33, { roughness: 0.6 }),
  boot: std(0x2e2a24), strap: std(0x2a2a22), metal: std(0x34383c, { metalness: 0.6, roughness: 0.4 }), metalLight: std(0x8c949b, { metalness: 0.6, roughness: 0.35 }),
  wood: std(0x7a5532), orange: std(0xe8761e), visor: std(0x101418, { metalness: 0.9, roughness: 0.15 }),
  red: std(0xc8342f, { roughness: 0.5, metalness: 0.3 }), redDark: std(0x7a1f1c, { roughness: 0.5, metalness: 0.3 }),
  purple: std(0x5b4f7a, { roughness: 0.55, metalness: 0.45 }), purpleDark: std(0x3a3250, { roughness: 0.6, metalness: 0.4 }),
  amber: std(0xe39a26, { roughness: 0.5, metalness: 0.35 }), amberDark: std(0x8f5a12, { roughness: 0.55, metalness: 0.35 }),
  tread: std(0x26262a, { roughness: 0.9 }),
  eyeRed: new THREE.MeshBasicMaterial({ color: 0xff3020 }), eyeYellow: new THREE.MeshBasicMaterial({ color: 0xffe14a }),
  eyeCyan: new THREE.MeshBasicMaterial({ color: 0x5ff2ff }),
  eyeOrange: new THREE.MeshBasicMaterial({ color: 0xff8a1e }),
  hair: std(0x3b2a1e, { roughness: 0.9 }), ghillie: std(0x4c5a2e, { flatShading: true, roughness: 1 }), ghillieDark: std(0x39451f, { flatShading: true, roughness: 1 }),
  plate: std(0x4a4f55, { metalness: 0.55, roughness: 0.45 }), hardhat: std(0xf0b429, { roughness: 0.5 }), scarf: std(0x8a3b2a, { roughness: 0.9 }),
  hazard: std(0xf2c230, { roughness: 0.5, metalness: 0.3 }), hazardDark: std(0x2b2b2b, { roughness: 0.6, metalness: 0.4 }),
  teal: std(0x2f8f8a, { roughness: 0.45, metalness: 0.5 }), tealDark: std(0x1d5a57, { roughness: 0.5, metalness: 0.5 }),
  boss: std(0x3a3f46, { roughness: 0.45, metalness: 0.65 }), bossDark: std(0x22262b, { roughness: 0.5, metalness: 0.6 }),
  bossRed: std(0xb3261e, { roughness: 0.4, metalness: 0.5 }),
  swarm: std(0x8e44d8, { roughness: 0.45, metalness: 0.35 }), swarmDark: std(0x55248a, { roughness: 0.5, metalness: 0.35 }),
  steelBlue: std(0x4a6a8a, { roughness: 0.45, metalness: 0.55 }), steelBlueDark: std(0x2f465e, { roughness: 0.5, metalness: 0.5 }),
  riot: std(0x9fb3c4, { roughness: 0.3, metalness: 0.4 }), riotStripe: std(0xf2c230, { roughness: 0.5 }),
  sniperBody: std(0x5a5f52, { roughness: 0.6, metalness: 0.45 }), sniperDark: std(0x353a30, { roughness: 0.6, metalness: 0.45 }),
  medicBody: std(0xdfe6e1, { roughness: 0.35, metalness: 0.3 }), medicGreen: std(0x3fae5a, { roughness: 0.5 }),
  laser: new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.75, depthWrite: false }),
  eyeGreen: new THREE.MeshBasicMaterial({ color: 0x6dff8a }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  stun: new THREE.MeshBasicMaterial({ color: 0x6fd3ff }),
  plank: std(0x8a6236, { roughness: 0.9 }), plankDark: std(0x6b4a28, { roughness: 0.95 }), rope: std(0xc9b48a),
  canvas: std(0xe8e2cf, { roughness: 0.9 }), redCross: new THREE.MeshBasicMaterial({ color: 0xd8342f }),
  steel: std(0xa9b0b6, { metalness: 0.7, roughness: 0.3 }),
  blob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  rock: std(0x8d9093, { flatShading: true, roughness: 0.95 }), rockDark: std(0x6f7276, { flatShading: true, roughness: 0.95 }),
  bark: std(0x6b4a2b), leaves: std(0x4f8a2f, { flatShading: true }), leavesDark: std(0x3d7026, { flatShading: true }),
  bag: std(0xcdb88c, { roughness: 1 }), bagDark: std(0xb39c6e, { roughness: 1 }),
  shield: new THREE.MeshStandardMaterial({ color: 0x6fd3ff, emissive: 0x2a8cff, emissiveIntensity: 0.6, transparent: true, opacity: 0.28, depthWrite: false }),
};

const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sph = (r: number, m: THREE.Material, w = 12, h = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };
const blobGeo = new THREE.CircleGeometry(1, 20);

export function blobShadow(r: number) {
  const m = new THREE.Mesh(blobGeo, MAT.blob);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.scale.setScalar(r);
  m.name = 'blob'; m.visible = false; m.castShadow = false;
  return m;
}

export function castShadows<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { if (c.name !== 'blob') { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}

// ---------------- Armas (en las manos del soldado) ----------------

function weaponModel(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const M = MAT.metal, L = MAT.metalLight;
  switch (id) {
    case 'pistola':
      g.add(at(box(0.1, 0.12, 0.38, M), 0, 0, 0.12), at(box(0.09, 0.2, 0.1, MAT.strap), 0, -0.12, -0.02));
      break;
    case 'subfusil':
      g.add(at(box(0.12, 0.15, 0.6, M), 0, 0, 0.2), at(box(0.08, 0.28, 0.1, M), 0, -0.2, 0.2),
        at(cyl(0.035, 0.035, 0.3, L), 0, 0.02, 0.6).rotateX(Math.PI / 2), at(box(0.1, 0.1, 0.25, MAT.strap), 0, -0.02, -0.15));
      break;
    case 'escopeta':
      g.add(at(cyl(0.045, 0.045, 0.95, M), 0.035, 0.02, 0.45).rotateX(Math.PI / 2), at(cyl(0.045, 0.045, 0.95, M), -0.035, 0.02, 0.45).rotateX(Math.PI / 2),
        at(box(0.13, 0.13, 0.35, MAT.wood), 0, -0.02, -0.12), at(box(0.12, 0.08, 0.25, MAT.wood), 0, -0.06, 0.4));
      break;
    case 'lanzallamas':
      g.add(at(box(0.14, 0.16, 0.55, M), 0, 0, 0.15), at(cyl(0.06, 0.09, 0.4, L), 0, 0.02, 0.6).rotateX(Math.PI / 2),
        at(cyl(0.025, 0.025, 0.12, MAT.orange), 0, -0.05, 0.82).rotateX(Math.PI / 2));
      break;
    case 'francotirador':
      g.add(at(cyl(0.035, 0.035, 1.3, M), 0, 0.03, 0.6).rotateX(Math.PI / 2), at(box(0.12, 0.15, 0.6, MAT.uniformDark), 0, -0.02, 0),
        at(cyl(0.05, 0.05, 0.35, MAT.visor), 0, 0.15, 0.15).rotateX(Math.PI / 2), at(box(0.04, 0.2, 0.04, M), 0.08, -0.15, 0.85));
      break;
    case 'granadas':
      g.add(at(cyl(0.11, 0.11, 0.55, M), 0, 0.02, 0.3).rotateX(Math.PI / 2), at(cyl(0.16, 0.16, 0.18, MAT.uniformDark, 8), 0, 0, 0.05).rotateZ(Math.PI / 2),
        at(box(0.09, 0.22, 0.1, MAT.strap), 0, -0.18, -0.05));
      break;
    case 'fusil':
      g.add(at(box(0.12, 0.16, 0.75, M), 0, 0, 0.25), at(cyl(0.03, 0.03, 0.35, L), 0, 0.03, 0.78).rotateX(Math.PI / 2),
        at(box(0.08, 0.26, 0.1, M), 0, -0.2, 0.3).rotateX(0.3), at(box(0.1, 0.14, 0.32, MAT.uniformDark), 0, -0.03, -0.25), at(box(0.06, 0.06, 0.18, MAT.visor), 0, 0.12, 0.15));
      break;
    case 'ametralladora':
      for (const [x, y] of [[0.05, 0.05], [-0.05, 0.05], [0.05, -0.05], [-0.05, -0.05]]) g.add(at(cyl(0.03, 0.03, 0.9, L), x, y, 0.55).rotateX(Math.PI / 2));
      g.add(at(box(0.22, 0.24, 0.5, M), 0, 0, 0.05), at(box(0.16, 0.2, 0.2, MAT.amberDark), 0.18, -0.08, 0.05), at(cyl(0.09, 0.09, 0.05, M, 10), 0, 0, 0.95).rotateX(Math.PI / 2));
      break;
    case 'tesla':
      g.add(at(box(0.16, 0.18, 0.5, M), 0, 0, 0.1), at(cyl(0.11, 0.11, 0.32, MAT.steel, 12), 0, 0.02, 0.5).rotateX(Math.PI / 2),
        at(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 14), MAT.amber), 0, 0.02, 0.42), at(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 14), MAT.amber), 0, 0.02, 0.56),
        at(sph(0.07, MAT.eyeCyan, 8, 6), 0, 0.02, 0.72));
      break;
    case 'cohetes':
      g.add(at(cyl(0.13, 0.13, 1.25, MAT.uniformDark), 0, 0.12, 0.25).rotateX(Math.PI / 2), at(cyl(0.16, 0.13, 0.15, M), 0, 0.12, 0.88).rotateX(Math.PI / 2),
        at(box(0.08, 0.2, 0.1, MAT.strap), 0, -0.08, 0.2), at(box(0.06, 0.08, 0.15, MAT.visor), 0.15, 0.2, 0.25));
      break;
  }
  return g;
}

// ---------------- Soldado (jugador) ----------------

export interface Soldier {
  root: THREE.Group; body: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  weapons: Record<WeaponId, THREE.Group>; shield: THREE.Mesh; muzzle: THREE.Object3D; walk: number;
  /** Retroceso, arma visible, posición anterior y cartel con el nombre (en línea). */
  recoil: number; weapon: WeaponId | null; px: number; pz: number; label: THREE.Sprite | null; labelText: string;
  /** Personaje (aspecto). */
  look: CharacterId;
}

function limb(upper: THREE.Material, lower: THREE.Material, len: number, thick: number) {
  const g = new THREE.Group();
  g.add(at(box(thick, len * 0.55, thick, upper), 0, -len * 0.27, 0), at(box(thick * 0.95, len * 0.5, thick * 0.95, lower), 0, -len * 0.75, 0));
  return g;
}

/** Materiales del uniforme de un color (el señuelo usa uno gris). */
const uniformCache = new Map<number, { main: THREE.Material; dark: THREE.Material; helmet: THREE.Material }>();
function uniformMats(color: number) {
  let u = uniformCache.get(color);
  if (!u) {
    const c = new THREE.Color(color);
    u = color === 0x5d7a3e ? { main: MAT.uniform, dark: MAT.uniformDark, helmet: MAT.helmet }
      : { main: std(color), dark: std(c.clone().multiplyScalar(0.72).getHex()), helmet: std(c.clone().multiplyScalar(0.85).getHex(), { roughness: 0.6 }) };
    uniformCache.set(color, u);
  }
  return u;
}

export function makeSoldier(color = 0x5d7a3e, look: CharacterId = 'sargento'): Soldier {
  const U = uniformMats(color);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body, blobShadow(0.7));

  const legL = limb(U.main, U.dark, 0.7, 0.2), legR = limb(U.main, U.dark, 0.7, 0.2);
  legL.position.set(-0.15, 0.72, 0); legR.position.set(0.15, 0.72, 0);
  legL.add(at(box(0.22, 0.12, 0.32, MAT.boot), 0, -0.7, 0.05)); legR.add(at(box(0.22, 0.12, 0.32, MAT.boot), 0, -0.7, 0.05));
  root.add(legL, legR);

  body.position.y = 0.72;
  body.add(
    at(box(0.5, 0.18, 0.3, U.dark), 0, 0.05, 0), // cadera
    at(box(0.56, 0.5, 0.34, U.main), 0, 0.38, 0), // torso
    at(sph(0.2, MAT.skin), 0, 0.82, 0), // cabeza
  );
  dressSoldier(body, look, U);

  const armL = limb(U.main, MAT.skin, 0.62, 0.15), armR = limb(U.main, MAT.skin, 0.62, 0.15);
  armL.position.set(-0.36, 0.6, 0.02); armR.position.set(0.36, 0.6, 0.02);
  armL.rotation.set(-1.25, 0, 0.35); armR.rotation.set(-1.35, 0, -0.1); // sujetando el arma
  body.add(armL, armR);

  const weapons = {} as Record<WeaponId, THREE.Group>;
  const holder = new THREE.Group();
  holder.position.set(0.08, 0.42, 0.42);
  for (const id of ['pistola', 'subfusil', 'fusil', 'escopeta', 'ametralladora', 'lanzallamas', 'francotirador', 'tesla', 'granadas', 'cohetes'] as WeaponId[]) {
    const w = weaponModel(id);
    w.visible = false;
    if (id === 'cohetes') w.position.set(0.12, 0.3, -0.35); // al hombro
    weapons[id] = w;
    holder.add(w);
  }
  body.add(holder);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.08, 0.45, 1.25);
  body.add(muzzle);

  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), MAT.shield);
  shield.position.y = 0.9; shield.visible = false;
  root.add(shield);

  castShadows(root);
  shield.castShadow = false;
  // Complexión: el Coloso es más ancho; el Halcón, más ligero.
  if (look === 'coloso') { body.scale.set(1.18, 1.04, 1.15); legL.scale.set(1.2, 1, 1.2); legR.scale.set(1.2, 1, 1.2); }
  if (look === 'halcon') { body.scale.set(0.92, 1, 0.92); }
  return { root, body, legL, legR, armL, armR, weapons, shield, muzzle, walk: 0, recoil: 0, weapon: null, px: 0, pz: 0, label: null, labelText: '', look };
}

/** Casco, chaleco y equipo de cada personaje (la silueta los distingue de lejos). */
function dressSoldier(body: THREE.Group, look: CharacterId, U: { main: THREE.Material; dark: THREE.Material; helmet: THREE.Material }) {
  const dome = (r: number, m: THREE.Material) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
  const vest = (m: THREE.Material) => at(box(0.6, 0.42, 0.38, m), 0, 0.4, 0);
  const pouches = () => [at(box(0.12, 0.12, 0.06, MAT.strap), -0.15, 0.48, 0.2), at(box(0.12, 0.12, 0.06, MAT.strap), 0.15, 0.32, 0.2)];
  switch (look) {
    case 'sargento': { // casco clásico, gafas, mochila y saco de dormir
      const helmet = dome(0.26, U.helmet); helmet.position.y = 0.86; helmet.scale.set(1, 0.85, 1.08);
      body.add(vest(MAT.vest), ...pouches(), at(box(0.44, 0.48, 0.24, U.dark), 0, 0.42, -0.3), at(box(0.36, 0.12, 0.2, U.helmet), 0, 0.68, -0.32),
        at(box(0.26, 0.06, 0.02, MAT.visor), 0, 0.86, 0.19), helmet, at(cyl(0.29, 0.29, 0.04, U.helmet, 14), 0, 0.86, 0));
      break;
    }
    case 'coloso': { // blindaje pesado: casco cerrado con visor, hombreras y placas
      const helmet = dome(0.28, MAT.plate); helmet.position.y = 0.84; helmet.scale.set(1, 1.05, 1.08);
      body.add(vest(MAT.plate), at(box(0.62, 0.2, 0.06, MAT.plate), 0, 0.3, 0.21),
        at(box(0.28, 0.16, 0.4, MAT.plate), -0.38, 0.6, 0), at(box(0.28, 0.16, 0.4, MAT.plate), 0.38, 0.6, 0),
        at(cyl(0.22, 0.24, 0.24, MAT.plate, 12), 0, 0.78, 0), helmet, at(box(0.34, 0.1, 0.04, MAT.visor), 0, 0.84, 0.25),
        at(box(0.5, 0.5, 0.26, U.dark), 0, 0.42, -0.31), at(cyl(0.08, 0.08, 0.5, MAT.metal, 8), 0.18, 0.45, -0.46));
      break;
    }
    case 'halcon': { // explorador ligero: gorra con visera hacia atrás, pañuelo y gafas en la frente
      const cap = dome(0.22, U.helmet); cap.position.y = 0.88; cap.scale.set(1, 0.7, 1.05);
      body.add(at(box(0.58, 0.3, 0.36, MAT.strap), 0, 0.48, 0), ...pouches(), cap, at(box(0.24, 0.03, 0.16, U.helmet), 0, 0.89, -0.25),
        at(box(0.3, 0.06, 0.04, MAT.visor), 0, 0.95, 0.15), at(cyl(0.21, 0.24, 0.12, MAT.scarf, 12), 0, 0.68, 0),
        at(box(0.3, 0.36, 0.18, U.dark), 0, 0.42, -0.27));
      break;
    }
    case 'ingeniera': { // casco de obra, coleta, cinturón de herramientas y mochila con antena
      const hat = dome(0.25, MAT.hardhat); hat.position.y = 0.88; hat.scale.set(1, 0.8, 1.05);
      const antenna = at(cyl(0.015, 0.015, 0.7, MAT.metal, 6), 0.14, 0.95, -0.36);
      body.add(vest(MAT.vest), ...pouches(), hat, at(cyl(0.32, 0.32, 0.03, MAT.hardhat, 16), 0, 0.88, 0.02), at(box(0.08, 0.12, 0.04, MAT.hardhat), 0, 1.0, 0.18),
        at(box(0.12, 0.26, 0.1, MAT.hair), 0, 0.72, -0.2), at(box(0.62, 0.1, 0.36, MAT.strap), 0, 0.14, 0),
        at(box(0.1, 0.16, 0.08, MAT.metalLight), -0.28, 0.1, 0.12), at(box(0.06, 0.2, 0.06, MAT.wood), 0.28, 0.08, 0.12),
        at(box(0.44, 0.44, 0.26, U.dark), 0, 0.44, -0.3), antenna, at(sph(0.04, MAT.eyeRed, 6, 4), 0.14, 1.3, -0.36));
      break;
    }
    case 'tiradora': { // capucha de camuflaje (ghillie), bufanda y fusil largo a la espalda
      const hood = dome(0.28, MAT.ghillie); hood.position.y = 0.8; hood.scale.set(1, 1.2, 1.12);
      const rifle = at(box(0.06, 0.06, 1.2, MAT.metal), -0.16, 0.5, -0.32); rifle.rotation.z = 0.6;
      body.add(at(box(0.62, 0.46, 0.4, MAT.ghillie), 0, 0.4, 0), at(box(0.16, 0.2, 0.42, MAT.ghillieDark), -0.3, 0.55, 0), at(box(0.16, 0.2, 0.42, MAT.ghillieDark), 0.3, 0.55, 0),
        hood, at(box(0.3, 0.12, 0.05, MAT.ghillieDark), 0, 0.74, 0.18), at(box(0.22, 0.05, 0.02, MAT.visor), 0, 0.86, 0.2), rifle);
      break;
    }
  }
}

export function animateSoldier(s: Soldier, speed: number, dt: number, t: number, recoil: number) {
  s.walk += speed * dt * 1.6;
  const swing = Math.min(1, speed / 6) * 0.75;
  s.legL.rotation.x = Math.sin(s.walk) * swing;
  s.legR.rotation.x = -Math.sin(s.walk) * swing;
  s.body.position.y = 0.72 + Math.abs(Math.cos(s.walk)) * 0.06 * Math.min(1, speed / 6) + Math.sin(t * 2) * 0.01;
  s.body.position.z = -recoil * 0.12;
  s.armR.rotation.x = -1.35 - recoil * 0.25;
  if (s.shield.visible) { s.shield.rotation.y = t; s.shield.scale.setScalar(1 + Math.sin(t * 8) * 0.03); }
}

export function showWeapon(s: Soldier, id: WeaponId) {
  if (s.weapon === id) return;
  s.weapon = id;
  for (const [k, g] of Object.entries(s.weapons)) g.visible = k === id;
  // Con el lanzacohetes al hombro el brazo izquierdo sube
  s.armL.rotation.set(id === 'cohetes' ? -1.75 : -1.25, 0, id === 'cohetes' ? -0.25 : 0.35);
  s.muzzle.position.set(0.08, id === 'cohetes' ? 0.75 : 0.45, id === 'francotirador' ? 1.5 : id === 'pistola' ? 0.85 : 1.25);
}

// ---------------- Robots enemigos ----------------

export interface Robot { root: THREE.Group; type: EnemyType; parts: THREE.Mesh[]; legs: THREE.Object3D[]; head?: THREE.Object3D; walk: number; px: number; pz: number }

function robotParts(g: THREE.Object3D) {
  const parts: THREE.Mesh[] = [];
  const eyes = [MAT.eyeRed, MAT.eyeYellow, MAT.eyeCyan, MAT.eyeOrange, MAT.eyeGreen, MAT.laser];
  g.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.name !== 'blob' && !eyes.includes(m.material as THREE.MeshBasicMaterial)) { m.userData.base = m.material; parts.push(m); } });
  return parts;
}

/** Araña: robot pequeño y rápido con 4 patas. El enjambre es una versión diminuta y morada. */
function makeSpider(type: EnemyType = 'chaser', shellMat: THREE.Material = MAT.red, darkMat: THREE.Material = MAT.redDark): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  const body = new THREE.Group(); body.position.y = 0.6; root.add(body, blobShadow(0.75));
  const shell = sph(0.42, shellMat, 14, 10); shell.scale.set(1, 0.65, 1.15);
  body.add(shell, at(box(0.5, 0.12, 0.6, darkMat), 0, -0.12, 0), at(sph(0.09, MAT.eyeRed, 8, 6), -0.13, 0.08, 0.42), at(sph(0.09, MAT.eyeRed, 8, 6), 0.13, 0.08, 0.42),
    at(box(0.06, 0.3, 0.06, MAT.metal), 0, 0.35, -0.15));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Group(); leg.position.set(x * 0.32, 0, z * 0.25);
    const upper = at(box(0.42, 0.07, 0.07, MAT.metal), x * 0.2, 0.12, 0); upper.rotation.z = x * -0.6;
    const lower = at(box(0.07, 0.55, 0.07, MAT.metalLight), x * 0.42, -0.15, 0);
    leg.add(upper, lower); leg.userData.side = x * z;
    body.add(leg); legs.push(leg);
  }
  return { root, type, parts: robotParts(root), legs, walk: Math.random() * 6, px: 0, pz: 0 };
}

/** Escudero: bípedo acorazado con un gran escudo antidisturbios por delante (se rompe con el daño). */
function makeShieldbearer(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(0.9));
  for (const x of [-0.28, 0.28]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.8, 0);
    leg.add(at(box(0.22, 0.45, 0.24, MAT.steelBlueDark), 0, -0.22, 0), at(box(0.18, 0.4, 0.18, MAT.metal), 0, -0.58, 0.02), at(box(0.3, 0.1, 0.4, MAT.metal), 0, -0.78, 0.06));
    root.add(leg); legs.push(leg);
  }
  const torso = new THREE.Group(); torso.position.y = 0.85;
  torso.add(at(box(0.8, 0.6, 0.55, MAT.steelBlue), 0, 0.32, 0), at(box(0.55, 0.25, 0.45, MAT.steelBlueDark), 0, 0.72, 0),
    at(box(0.4, 0.08, 0.05, MAT.eyeYellow), 0, 0.74, 0.24), at(box(0.2, 0.5, 0.2, MAT.steelBlueDark), 0.5, 0.25, 0));
  const shield = new THREE.Group(); shield.name = 'shield'; shield.position.set(-0.05, 0.35, 0.62);
  shield.add(at(box(1.15, 1.25, 0.08, MAT.riot), 0, 0, 0), at(box(1.15, 0.12, 0.09, MAT.riotStripe), 0, 0.35, 0.01), at(box(1.15, 0.12, 0.09, MAT.riotStripe), 0, -0.35, 0.01),
    at(box(0.5, 0.14, 0.03, MAT.visor), 0, 0.12, 0.05));
  torso.add(shield);
  root.add(torso);
  return { root, type: 'escudero', parts: robotParts(root), legs, head: torso, walk: 0, px: 0, pz: 0 };
}

/** Tirador: robot alto y delgado con un fusil largo y una mira roja; apunta con un láser antes de disparar. */
function makeSniperBot(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(0.7));
  for (const x of [-0.2, 0.2]) {
    const leg = new THREE.Group(); leg.position.set(x, 1.05, 0);
    leg.add(at(box(0.12, 0.6, 0.14, MAT.sniperDark), 0, -0.3, 0), at(box(0.1, 0.5, 0.1, MAT.metal), 0, -0.8, 0.03), at(box(0.2, 0.08, 0.32, MAT.metal), 0, -1.02, 0.06));
    root.add(leg); legs.push(leg);
  }
  const torso = new THREE.Group(); torso.position.y = 1.1;
  torso.add(at(box(0.45, 0.55, 0.38, MAT.sniperBody), 0, 0.28, 0), at(box(0.32, 0.22, 0.3, MAT.sniperDark), 0, 0.66, 0),
    at(sph(0.08, MAT.eyeRed, 8, 6), 0.06, 0.68, 0.16), at(box(0.06, 0.06, 1.5, MAT.metal), 0.25, 0.4, 0.55),
    at(box(0.1, 0.1, 0.3, MAT.sniperDark), 0.25, 0.5, 0.25), at(cyl(0.02, 0.02, 0.5, MAT.metal), -0.12, 0.95, -0.08));
  root.add(torso);
  const laser = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), MAT.laser);
  laser.name = 'laser'; laser.visible = false; laser.position.set(0.25, 1.5, 0);
  root.add(laser);
  return { root, type: 'tirador', parts: robotParts(root), legs, head: torso, walk: 0, px: 0, pz: 0 };
}

/** Reparador: robot flotante blanco con una cruz verde y brazos de soldadura. */
function makeRepairBot(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(0.7));
  const body = new THREE.Group(); body.position.y = 1; root.add(body);
  const shell = sph(0.45, MAT.medicBody, 16, 12); shell.scale.set(1, 0.8, 1);
  body.add(shell, at(box(0.36, 0.1, 0.05, MAT.medicGreen), 0, 0.12, 0.42), at(box(0.1, 0.36, 0.05, MAT.medicGreen), 0, 0.12, 0.42),
    at(box(0.3, 0.06, 0.05, MAT.eyeGreen), 0, -0.1, 0.41), at(cyl(0.3, 0.42, 0.12, MAT.metal, 14), 0, -0.34, 0),
    at(cyl(0.02, 0.02, 0.4, MAT.metal), 0.15, 0.5, -0.1), at(sph(0.05, MAT.eyeGreen, 6, 4), 0.15, 0.72, -0.1));
  for (const x of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(x * 0.5, 0, 0.1);
    arm.add(at(box(0.08, 0.08, 0.4, MAT.metal), 0, 0, 0.15), at(cyl(0.05, 0.03, 0.12, MAT.eyeGreen, 6), 0, 0, 0.38).rotateX(Math.PI / 2));
    body.add(arm); legs.push(arm);
  }
  return { root, type: 'reparador', parts: robotParts(root), legs, head: body, walk: 0, px: 0, pz: 0 };
}

/** Tanque: orugas, casco y torreta que apunta al jugador. */
function makeTank(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(1.3));
  for (const x of [-0.72, 0.72]) {
    root.add(at(box(0.38, 0.45, 1.9, MAT.tread), x, 0.25, 0));
    for (let k = -2; k <= 2; k++) {
      const wheel = at(cyl(0.17, 0.17, 0.42, MAT.metal, 10), x, 0.2, k * 0.38); wheel.rotation.z = Math.PI / 2;
      root.add(wheel); legs.push(wheel);
    }
  }
  root.add(at(box(1.15, 0.45, 1.7, MAT.purple), 0, 0.62, 0), at(box(1.0, 0.12, 0.5, MAT.purpleDark), 0, 0.9, -0.55));
  const turret = new THREE.Group(); turret.position.y = 0.95;
  turret.add(at(cyl(0.48, 0.55, 0.38, MAT.purple, 8), 0, 0.15, 0), at(cyl(0.08, 0.08, 1.1, MAT.metal), 0, 0.2, 0.75).rotateX(Math.PI / 2),
    at(box(0.3, 0.12, 0.12, MAT.eyeYellow), 0, 0.25, 0.42), at(box(0.06, 0.4, 0.06, MAT.metal), -0.3, 0.45, -0.2));
  root.add(turret);
  return { root, type: 'tank', parts: robotParts(root), legs, head: turret, walk: 0, px: 0, pz: 0 };
}

/** Artillero: robot bípedo con un cañón en el brazo. */
function makeWalker(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(0.8));
  for (const x of [-0.25, 0.25]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.8, 0);
    leg.add(at(box(0.18, 0.45, 0.2, MAT.amberDark), 0, -0.22, 0), at(box(0.14, 0.4, 0.14, MAT.metal), 0, -0.58, 0.02), at(box(0.26, 0.1, 0.38, MAT.metal), 0, -0.78, 0.06));
    root.add(leg); legs.push(leg);
  }
  const torso = new THREE.Group(); torso.position.y = 0.85;
  torso.add(at(box(0.7, 0.55, 0.5, MAT.amber), 0, 0.3, 0), at(box(0.5, 0.2, 0.42, MAT.amberDark), 0, 0.02, 0),
    at(box(0.4, 0.18, 0.08, MAT.visor), 0, 0.42, 0.26), at(box(0.3, 0.06, 0.02, MAT.eyeYellow), 0, 0.42, 0.31),
    at(cyl(0.03, 0.03, 0.4, MAT.metal), 0.22, 0.75, -0.1),
    at(box(0.22, 0.22, 0.3, MAT.amberDark), -0.47, 0.32, 0), // hombro izquierdo
    at(cyl(0.11, 0.13, 0.8, MAT.metal), 0.5, 0.28, 0.3).rotateX(Math.PI / 2), at(box(0.25, 0.25, 0.3, MAT.amberDark), 0.5, 0.32, -0.02)); // cañón
  root.add(torso);
  return { root, type: 'gunner', parts: robotParts(root), legs, head: torso, walk: 0, px: 0, pz: 0 };
}

/** Kamikaze: rodante con carga explosiva amarilla y negra y una luz que parpadea. */
function makeKamikaze(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(0.65));
  const body = new THREE.Group(); body.position.y = 0.5; root.add(body);
  const ball = sph(0.42, MAT.hazardDark, 14, 10);
  const band1 = at(cyl(0.43, 0.43, 0.12, MAT.hazard, 16), 0, 0.12, 0), band2 = at(cyl(0.43, 0.43, 0.12, MAT.hazard, 16), 0, -0.12, 0);
  const wheel = at(cyl(0.3, 0.3, 0.7, MAT.metal, 12), 0, -0.22, 0); wheel.rotation.z = Math.PI / 2; legs.push(wheel);
  const fuse = at(cyl(0.035, 0.035, 0.3, MAT.metal), 0, 0.5, -0.05);
  const light = at(sph(0.08, MAT.eyeOrange, 8, 6), 0, 0.68, -0.05); light.name = 'light';
  body.add(ball, band1, band2, wheel, fuse, light, at(box(0.3, 0.07, 0.05, MAT.eyeRed), 0, 0.05, 0.42));
  return { root, type: 'kamikaze', parts: robotParts(root), legs, head: body, walk: 0, px: 0, pz: 0 };
}

/** Dron enemigo: cuadricóptero de ataque que vuela por encima de los obstáculos. */
function makeEnemyDrone(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(0.7));
  const body = new THREE.Group(); body.position.y = 1.7; root.add(body);
  body.add(at(box(0.55, 0.2, 0.7, MAT.teal), 0, 0, 0), at(box(0.35, 0.14, 0.4, MAT.tealDark), 0, 0.15, -0.05),
    at(box(0.3, 0.1, 0.06, MAT.eyeCyan), 0, 0.02, 0.36), at(cyl(0.05, 0.05, 0.4, MAT.metal), 0, -0.18, 0.2).rotateX(Math.PI / 2));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    body.add(at(box(0.5, 0.05, 0.06, MAT.metal), x * 0.3, 0.05, z * 0.32).rotateY((Math.PI / 4) * x * z));
    const rotor = at(cyl(0.24, 0.24, 0.02, MAT.metalLight, 14), x * 0.5, 0.12, z * 0.5);
    body.add(rotor); legs.push(rotor);
  }
  return { root, type: 'dron', parts: robotParts(root), legs, head: body, walk: 0, px: 0, pz: 0 };
}

/** Jefe: coloso blindado con dos cañones, hombreras y un núcleo rojo. */
function makeBoss(): Robot {
  const root = new THREE.Group(), legs: THREE.Object3D[] = [];
  root.add(blobShadow(2));
  for (const x of [-0.75, 0.75]) {
    const leg = new THREE.Group(); leg.position.set(x, 1.5, 0);
    leg.add(at(box(0.55, 0.8, 0.6, MAT.bossDark), 0, -0.4, 0), at(box(0.45, 0.7, 0.5, MAT.boss), 0, -1.05, 0.05), at(box(0.75, 0.22, 1.0, MAT.bossDark), 0, -1.38, 0.12));
    root.add(leg); legs.push(leg);
  }
  const torso = new THREE.Group(); torso.position.y = 1.55;
  torso.add(
    at(box(2.0, 1.2, 1.3, MAT.boss), 0, 0.6, 0), at(box(1.6, 0.4, 1.1, MAT.bossDark), 0, -0.05, 0),
    at(cyl(0.3, 0.3, 0.12, MAT.bossRed, 16), 0, 0.65, 0.66).rotateX(Math.PI / 2), at(sph(0.18, MAT.eyeRed, 10, 8), 0, 0.65, 0.7),
    at(box(0.9, 0.35, 0.6, MAT.bossDark), 0, 1.35, 0.1), at(box(0.7, 0.1, 0.05, MAT.eyeRed), 0, 1.38, 0.41),
    at(box(0.75, 0.5, 0.9, MAT.bossRed), -1.3, 1.0, 0), at(box(0.75, 0.5, 0.9, MAT.bossRed), 1.3, 1.0, 0), // hombreras
    at(cyl(0.2, 0.24, 1.6, MAT.metal, 10), -1.3, 0.35, 0.65).rotateX(Math.PI / 2), at(cyl(0.2, 0.24, 1.6, MAT.metal, 10), 1.3, 0.35, 0.65).rotateX(Math.PI / 2), // cañones
    at(box(0.55, 0.55, 0.7, MAT.bossDark), -1.3, 0.35, 0), at(box(0.55, 0.55, 0.7, MAT.bossDark), 1.3, 0.35, 0),
    at(cyl(0.05, 0.05, 0.8, MAT.metal), 0.6, 1.9, -0.3), at(cyl(0.05, 0.05, 0.6, MAT.metal), -0.6, 1.8, -0.3),
  );
  root.add(torso);
  return { root, type: 'jefe', parts: robotParts(root), legs, head: torso, walk: 0, px: 0, pz: 0 };
}

export function makeRobot(type: EnemyType): Robot {
  const r = type === 'chaser' ? makeSpider() : type === 'tank' ? makeTank() : type === 'gunner' ? makeWalker()
    : type === 'kamikaze' ? makeKamikaze() : type === 'dron' ? makeEnemyDrone() : type === 'enjambre' ? makeSpider('enjambre', MAT.swarm, MAT.swarmDark)
    : type === 'escudero' ? makeShieldbearer() : type === 'tirador' ? makeSniperBot() : type === 'reparador' ? makeRepairBot() : makeBoss();
  if (type === 'enjambre') r.root.scale.setScalar(0.55);
  castShadows(r.root);
  return r;
}

export function animateRobot(r: Robot, x: number, z: number, faceX: number, faceZ: number, dt: number, t: number, flash: boolean, stunned = false) {
  const moved = Math.hypot(x - r.px, z - r.pz);
  const speed = dt > 0 ? moved / dt : 0;
  const heading = moved > 0.001 ? Math.atan2(x - r.px, z - r.pz) : r.root.rotation.y;
  r.px = x; r.pz = z;
  r.root.position.set(x, 0, z);
  r.walk += speed * dt * (r.type === 'chaser' || r.type === 'enjambre' ? 4 : 2.2);
  const aim = Math.atan2(faceX - x, faceZ - z);
  if (r.type === 'chaser' || r.type === 'enjambre') {
    r.root.rotation.y = aim;
    r.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(r.walk + i * Math.PI * 0.5) * 0.5; leg.position.y = Math.max(0, Math.sin(r.walk + i * Math.PI * 0.5)) * 0.08; });
    r.root.children[0].position.y = 0.6 + Math.sin(r.walk * 2) * 0.04;
  } else if (r.type === 'tank') {
    // El casco gira hacia donde avanza; la torreta apunta al jugador.
    const diff = Math.atan2(Math.sin(heading - r.root.rotation.y), Math.cos(heading - r.root.rotation.y));
    r.root.rotation.y += diff * Math.min(1, dt * 3);
    r.head!.rotation.y = aim - r.root.rotation.y;
    r.legs.forEach((wheel) => (wheel.rotation.x = r.walk));
  } else if (r.type === 'kamikaze') {
    r.root.rotation.y = heading;
    r.legs[0].rotation.x = r.walk * 2; // la rueda gira al rodar
    r.head!.position.y = 0.5 + Math.abs(Math.sin(r.walk * 2)) * 0.05;
    r.head!.rotation.z = Math.sin(t * 20) * 0.04; // tiembla: va a explotar
    const light = r.head!.getObjectByName('light');
    if (light) light.visible = Math.floor(t * 8) % 2 === 0;
  } else if (r.type === 'reparador') {
    r.root.rotation.y = aim;
    r.head!.position.y = 1 + Math.sin(t * 2.5 + r.px) * 0.12; // flota
    r.legs.forEach((arm, i) => (arm.rotation.x = Math.sin(t * 6 + i) * 0.4));
  } else if (r.type === 'dron') {
    r.root.rotation.y = aim;
    r.head!.position.y = 1.7 + Math.sin(t * 3 + r.px) * 0.15;
    r.head!.rotation.x = Math.min(0.35, speed * 0.05); // se inclina al avanzar
    for (const rotor of r.legs) rotor.rotation.y += dt * 45;
  } else {
    r.root.rotation.y = aim;
    const k = Math.min(1, speed / (r.type === 'jefe' ? 1.5 : 3));
    r.legs[0].rotation.x = Math.sin(r.walk) * 0.6 * k; r.legs[1].rotation.x = -Math.sin(r.walk) * 0.6 * k;
    const baseY = r.type === 'jefe' ? 1.55 : r.type === 'tirador' ? 1.1 : 0.85;
    r.head!.position.y = baseY + Math.abs(Math.cos(r.walk)) * 0.05 * k + Math.sin(t * 3) * 0.01;
  }
  // Aturdido por el EMP: azul y parpadeando; si no, destello blanco al recibir daño
  for (const p of r.parts) p.material = flash ? MAT.flash : stunned && Math.floor(t * 8) % 2 === 0 ? MAT.stun : (p.userData.base as THREE.Material);
}

// ---------------- Equipo ----------------

export function makeTurret() {
  const g = new THREE.Group();
  g.add(blobShadow(0.7));
  for (let k = 0; k < 3; k++) {
    const leg = at(box(0.08, 0.7, 0.08, MAT.metal), Math.sin((k * Math.PI * 2) / 3) * 0.3, 0.3, Math.cos((k * Math.PI * 2) / 3) * 0.3);
    leg.rotation.set(Math.cos((k * Math.PI * 2) / 3) * 0.4, 0, -Math.sin((k * Math.PI * 2) / 3) * 0.4);
    g.add(leg);
  }
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.75;
  head.add(at(box(0.45, 0.3, 0.55, MAT.uniformDark), 0, 0, 0), at(cyl(0.05, 0.05, 0.7, MAT.metal), -0.08, 0.02, 0.55).rotateX(Math.PI / 2),
    at(cyl(0.05, 0.05, 0.7, MAT.metal), 0.08, 0.02, 0.55).rotateX(Math.PI / 2), at(box(0.2, 0.08, 0.05, MAT.eyeCyan), 0, 0.1, 0.28),
    at(box(0.12, 0.25, 0.3, MAT.metal), 0.3, -0.05, 0));
  g.add(head);
  return castShadows(g);
}

export function makeDrone() {
  const g = new THREE.Group();
  g.add(at(box(0.36, 0.12, 0.36, MAT.uniformDark), 0, 0, 0), at(sph(0.08, MAT.eyeCyan, 8, 6), 0, -0.06, 0.18));
  const rotors: THREE.Mesh[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(at(box(0.3, 0.04, 0.04, MAT.metal), x * 0.2, 0, z * 0.2).rotateY(Math.PI / 4 * x * z));
    const rotor = at(cyl(0.16, 0.16, 0.015, MAT.metalLight, 12), x * 0.3, 0.07, z * 0.3);
    g.add(rotor); rotors.push(rotor);
  }
  g.userData.rotors = rotors;
  return castShadows(g);
}

export function makeMine() {
  const g = new THREE.Group();
  g.add(at(cyl(0.38, 0.42, 0.12, MAT.uniformDark, 14), 0, 0.06, 0), at(cyl(0.12, 0.12, 0.08, MAT.metal, 10), 0, 0.15, 0));
  const light = at(sph(0.05, MAT.eyeRed, 6, 4), 0, 0.2, 0); light.name = 'light';
  g.add(light);
  return castShadows(g);
}

// ---------------- Obstáculos ----------------

const G = {
  rock: new THREE.DodecahedronGeometry(1, 0), rockSmall: new THREE.IcosahedronGeometry(1, 0),
  trunk: new THREE.CylinderGeometry(0.18, 0.28, 1.6, 7), crown: new THREE.IcosahedronGeometry(1, 0),
  bag: new THREE.CapsuleGeometry(0.28, 0.75, 4, 8), crate: new THREE.BoxGeometry(1.2, 1.2, 1.2),
  pine: new THREE.ConeGeometry(1, 1.6, 8),
};

export function makeObstacle(kind: ObstacleKind, r: number, rot: number, crateMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const seed = Math.abs(Math.sin(rot * 999));
  if (kind === 'rock') {
    const a = new THREE.Mesh(G.rock, MAT.rock); a.scale.set(r * 1.05, r * 0.72, r); a.position.y = r * 0.3; a.rotation.set(rot, rot * 2, 0);
    const b = new THREE.Mesh(G.rockSmall, MAT.rockDark); b.scale.setScalar(r * 0.45); b.position.set(r * 0.75, r * 0.15, r * 0.3); b.rotation.y = rot;
    g.add(a, b);
  } else if (kind === 'tree') {
    g.add(at(new THREE.Mesh(G.trunk, MAT.bark), 0, 0.8, 0));
    if (seed > 0.5) { // pino
      for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(G.pine, k % 2 ? MAT.leaves : MAT.leavesDark); c.scale.set(1.25 - k * 0.3, 1, 1.25 - k * 0.3); c.position.y = 1.6 + k * 0.7; g.add(c); }
    } else { // frondoso
      for (const [x, y, z, s] of [[0, 2.1, 0, 1.15], [0.55, 1.85, 0.2, 0.75], [-0.45, 1.9, -0.3, 0.8], [0.1, 2.65, -0.15, 0.7]]) {
        const c = new THREE.Mesh(G.crown, s < 0.8 ? MAT.leavesDark : MAT.leaves); c.position.set(x, y, z); c.scale.setScalar(s); c.rotation.y = rot + x; g.add(c);
      }
    }
  } else if (kind === 'crate') {
    const c = new THREE.Mesh(G.crate, crateMat); c.position.y = 0.6; c.rotation.y = rot; g.add(c);
  } else if (kind === 'wall') {
    // Empalizada: troncos verticales afilados con dos travesaños
    for (let k = -2; k <= 2; k++) {
      const h = 1.35 + ((k * 7 + 3) % 3) * 0.08;
      const log = at(cyl(0.15, 0.17, h, k % 2 ? MAT.plankDark : MAT.plank, 7), k * 0.31, h / 2, 0);
      const tip = at(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.28, 7), MAT.plankDark), k * 0.31, h + 0.14, 0);
      g.add(log, tip);
    }
    for (const y of [0.45, 1.05]) g.add(at(box(1.6, 0.1, 0.08, MAT.plankDark), 0, y, 0.18));
    g.rotation.y = -rot;
  } else if (kind === 'tower') {
    // Torre de guardia de madera: cuatro patas, plataforma y barandilla (la ametralladora va encima)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(cyl(0.08, 0.1, 2, MAT.plankDark, 6), x * 0.55, 1, z * 0.55));
    g.add(at(box(1.5, 0.12, 1.5, MAT.plank), 0, 2, 0));
    for (const [x, z, w, d] of [[0, -0.72, 1.5, 0.08], [0, 0.72, 1.5, 0.08], [-0.72, 0, 0.08, 1.5], [0.72, 0, 0.08, 1.5]]) g.add(at(box(w, 0.35, d, MAT.plankDark), x, 2.25, z));
    g.add(at(box(1.2, 0.06, 0.06, MAT.rope), 0, 1, 0.56).rotateZ(0.6), at(box(1.2, 0.06, 0.06, MAT.rope), 0, 1, -0.56).rotateZ(-0.6));
  } else if (kind === 'medic') {
    // Puesto médico: tienda blanca con cruz roja
    const tent = at(new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.4, 4), MAT.canvas), 0, 0.7, 0); tent.rotation.y = Math.PI / 4;
    const cross1 = at(box(0.42, 0.12, 0.02, MAT.redCross), 0, 0.75, 0.52), cross2 = at(box(0.12, 0.42, 0.02, MAT.redCross), 0, 0.75, 0.52);
    cross1.rotation.x = cross2.rotation.x = -0.6;
    g.add(tent, cross1, cross2, at(cyl(0.03, 0.03, 1.8, MAT.plankDark, 5), 0, 0.9, 0));
    g.rotation.y = -rot;
  } else {
    // sacos terreros (los de barricada son algo más oscuros)
    const mats = kind === 'barricade' ? [MAT.bagDark, MAT.bag] : [MAT.bag, MAT.bagDark];
    for (const [y, off, i] of [[0.28, -0.24, 0], [0.28, 0.24, 1], [0.75, 0, 0]]) {
      const b = new THREE.Mesh(G.bag, mats[i]); b.rotation.z = Math.PI / 2; b.rotation.x = (seed - 0.5) * 0.2; b.position.set(0, y, off); g.add(b);
    }
    g.rotation.y = -rot;
  }
  return castShadows(g);
}

/** Pinchos: tabla con púas metálicas (trampa; no bloquea el paso). */
export function makeSpikes(r: number, rot: number) {
  const g = new THREE.Group();
  g.add(at(box(r * 1.6, 0.08, r * 1.2, MAT.plankDark), 0, 0.04, 0));
  const spike = new THREE.ConeGeometry(0.07, 0.42, 5);
  for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
    const m = new THREE.Mesh(spike, MAT.steel);
    m.position.set(i * r * 0.3 + (j % 2 ? 0.12 : 0), 0.28, j * r * 0.35);
    m.rotation.z = (i - j) * 0.06;
    g.add(m);
  }
  g.rotation.y = -rot;
  return castShadows(g);
}

/** Cartel con el nombre que flota sobre otro jugador (modo en línea). */
export function makeLabel(text: string, color: number, muted = false): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = `${muted ? '600 italic' : '700'} 30px Oswald, 'Arial Narrow', sans-serif`;
  const w = Math.min(312, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(20, 24, 14, 0.78)';
  g.beginPath(); g.roundRect((320 - w) / 2, 10, w, 44, 4); g.fill();
  g.fillStyle = muted ? '#b3b199' : '#' + new THREE.Color(color).offsetHSL(0, 0, 0.28).getHexString();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 160, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sp.scale.set(3.6, 0.72, 1);
  sp.renderOrder = 8;
  return sp;
}
