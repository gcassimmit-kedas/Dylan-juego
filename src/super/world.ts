// Mundo exterior: aparcamiento, calle, la casa del jugador (cama y ducha) y dos tiendas más
// (Mayorista y Frutería) donde también se compra género. Todo dibujado con figuras simples y
// texturas de textures.ts; las colisiones son rectángulos (más el plano de la tienda de sim.ts).
import * as THREE from 'three';
import { walkable as walkableTienda, type Point } from './sim.ts';
import * as T from './textures.ts';
import { MAT, person } from './models.ts';

interface Rect { x0: number; z0: number; x1: number; z1: number }

/** Límites del mundo (hay una valla). */
export const BOUNDS = { x0: -34, x1: 34, z0: -14, z1: 46 };
/** La tienda (con su acera delantera) usa la rejilla de los clientes. */
const TIENDA = { x0: -9.6, x1: 9.6, z0: -7.6, z1: 9.4 };
const RADIO = 0.3;

/** Sitios clave del exterior. */
export const LUGARES = {
  casa: { x0: -20, x1: -6, z0: 30, z1: 40, puerta: -12 },
  mayorista: { x0: 4, x1: 18, z0: 30, z1: 41, puerta: 11 },
  fruteria: { x0: 21, x1: 30, z0: 30, z1: 37, puerta: 25.5 },
};

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o;
};

export interface World {
  group: THREE.Group;
  /** Cosas que se pueden usar: userData.action = 'cama' | 'ducha' | 'mayorista' | 'fruteria'. */
  hits: THREE.Mesh[];
  /** ¿Se puede estar aquí? (tienda incluida). */
  walkable(p: Point): boolean;
  /** Agua de la ducha (se ve al ducharse). */
  shower: THREE.Object3D;
}

export function buildWorld(): World {
  const g = new THREE.Group();
  const obst: Rect[] = [];
  const hits: THREE.Mesh[] = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const solid = (x0: number, z0: number, x1: number, z1: number) => obst.push({ x0, z0, x1, z1 });

  // ---------- Suelo ----------
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(110, 90), std({ color: 0x4d6b32, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.03, 16); grass.receiveShadow = true; g.add(grass);
  const asphaltTex = T.asphaltTexture(); asphaltTex.repeat.set(3.2, 1.25);
  const parking = new THREE.Mesh(new THREE.PlaneGeometry(32, 12.4), std({ map: asphaltTex, roughness: 0.95 }));
  parking.rotation.x = -Math.PI / 2; parking.position.set(0, -0.01, 13.8); parking.receiveShadow = true; g.add(parking);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0, 6), std({ color: 0x2c2e30, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.005, 24); road.receiveShadow = true; g.add(road);
  const paint = std({ color: 0xf2efe2, roughness: 0.8 });
  for (let x = BOUNDS.x0 + 1; x < BOUNDS.x1; x += 4) { const d = box(2, 0.01, 0.15, paint, x, 0.002, 24); d.castShadow = false; g.add(d); }
  for (let i = 0; i < 7; i++) { const z = box(0.5, 0.01, 4.8, paint, 4.2 + i * 0.9, 0.003, 24); z.castShadow = false; g.add(z); } // paso de cebra
  const concrete = std({ color: 0xb9b5aa, roughness: 0.9 });
  for (const z of [20.5, 27.5]) { const s = box(BOUNDS.x1 - BOUNDS.x0, 0.12, 1, concrete, 0, 0.04, z); s.castShadow = false; g.add(s); }

  // ---------- Coches aparcados ----------
  const car = (x: number, z: number, color: number, ry: number) => {
    const c = new THREE.Group();
    c.add(box(1.8, 0.6, 4.2, std({ color, roughness: 0.35, metalness: 0.4 }), 0, 0.55, 0));
    c.add(box(1.6, 0.55, 2.2, std({ color: 0x1b2430, roughness: 0.1, metalness: 0.2 }), 0, 1.1, -0.2));
    for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16), MAT.black); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.34, wz); w.castShadow = true; c.add(w);
    }
    c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
    const side = Math.abs(Math.sin(ry)) > 0.5;
    solid(x - (side ? 2.1 : 0.9), z - (side ? 0.9 : 2.1), x + (side ? 2.1 : 0.9), z + (side ? 0.9 : 2.1));
  };
  car(-11, 14, 0xc8202a, 0); car(-7.5, 14.5, 0x2a6fd8, 0.05); car(13, 15, 0xf2f2ee, Math.PI / 2);

  // ---------- Árboles, farolas y valla ----------
  const trunk = std({ color: 0x5a3a1a, roughness: 0.9 }), leaves = std({ color: 0x3f7a35, roughness: 0.85 });
  const tree = (x: number, z: number, s = 1) => {
    g.add(box(0.3 * s, 2 * s, 0.3 * s, trunk, x, s, z));
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.3 * s, 12, 10), leaves); top.position.set(x, 2.6 * s, z); top.castShadow = true; g.add(top);
    solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
  };
  for (const [x, z, s] of [[-14, 10, 1.1], [16, 10, 1], [-30, 34, 1.2], [-24, 42, 1], [2, 43, 1.1], [32, 41, 1], [-28, 12, 1.3], [28, 14, 1], [-16, -10, 1.2], [14, -11, 1], [0, -12, 1.1]] as const) tree(x, z, s);
  const lamp = (x: number, z: number) => {
    g.add(box(0.12, 4.2, 0.12, MAT.metalDark, x, 2.1, z));
    g.add(box(0.8, 0.12, 0.3, MAT.metalDark, x, 4.2, z));
    g.add(box(0.5, 0.05, 0.22, std({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 1.6 }), x, 4.13, z));
    solid(x - 0.1, z - 0.1, x + 0.1, z + 0.1);
  };
  for (const x of [-24, -12, 0, 12, 24]) lamp(x, 20.6);
  const fence = std({ color: 0xd8d0b8, roughness: 0.8 });
  for (const [x0, z0, x1, z1] of [[BOUNDS.x0, BOUNDS.z0, BOUNDS.x1, BOUNDS.z0], [BOUNDS.x0, BOUNDS.z1, BOUNDS.x1, BOUNDS.z1], [BOUNDS.x0, BOUNDS.z0, BOUNDS.x0, BOUNDS.z1], [BOUNDS.x1, BOUNDS.z0, BOUNDS.x1, BOUNDS.z1]] as const) {
    const len = Math.hypot(x1 - x0, z1 - z0), f = box(x0 === x1 ? 0.08 : len, 0.9, x0 === x1 ? len : 0.08, fence, (x0 + x1) / 2, 0.45, (z0 + z1) / 2); g.add(f);
  }

  // ---------- Edificios ----------
  /** Edificio con 4 paredes, puerta en la fachada sur (hacia la calle), suelo y tejado. */
  const building = (r: { x0: number; x1: number; z0: number; z1: number; puerta: number }, wallColor: number, floor: THREE.Material, roofColor: number, H = 3.2, doorW = 1.6) => {
    const wall = std({ color: wallColor, roughness: 0.85 });
    const t = 0.2, w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    g.add(box(w, H, t, wall, cx, H / 2, r.z1)); solid(r.x0, r.z1 - t, r.x1, r.z1 + t);
    g.add(box(t, H, d, wall, r.x0, H / 2, cz)); solid(r.x0 - t, r.z0, r.x0 + t, r.z1);
    g.add(box(t, H, d, wall, r.x1, H / 2, cz)); solid(r.x1 - t, r.z0, r.x1 + t, r.z1);
    const lw = r.puerta - doorW / 2 - r.x0, rw = r.x1 - (r.puerta + doorW / 2);
    g.add(box(lw, H, t, wall, r.x0 + lw / 2, H / 2, r.z0)); solid(r.x0, r.z0 - t, r.puerta - doorW / 2, r.z0 + t);
    g.add(box(rw, H, t, wall, r.x1 - rw / 2, H / 2, r.z0)); solid(r.puerta + doorW / 2, r.z0 - t, r.x1, r.z0 + t);
    g.add(box(doorW, H - 2.3, t, wall, r.puerta, 2.3 + (H - 2.3) / 2, r.z0));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floor); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0.01, cz); fl.receiveShadow = true; g.add(fl);
    // Tejado (no da sombra dentro: el interior se ilumina con sus lámparas) y techo claro por dentro.
    const roof = box(w + 0.6, 0.25, d + 0.6, std({ color: roofColor, roughness: 0.8 }), cx, H + 0.12, cz); roof.receiveShadow = false; roof.castShadow = false; g.add(roof);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std({ color: 0xf2efe6, roughness: 0.95 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(cx, H - 0.01, cz); g.add(ceil);
    const lampM = std({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 2 });
    for (const fx of [0.3, 0.7]) { const l = box(0.9, 0.04, 0.9, lampM, r.x0 + w * fx, H - 0.03, cz); l.castShadow = false; g.add(l); }
    const glow = new THREE.PointLight(0xfff2dc, 6, Math.max(w, d) * 1.2, 1.6); glow.position.set(cx, H - 0.4, cz); g.add(glow);
    // Marco de la puerta
    g.add(box(0.1, 2.3, 0.26, MAT.metalWhite, r.puerta - doorW / 2, 1.15, r.z0)); g.add(box(0.1, 2.3, 0.26, MAT.metalWhite, r.puerta + doorW / 2, 1.15, r.z0));
  };
  const sign = (text: string, color: string, x: number, z: number, w = 4) => {
    const tex = T.signTexture(text, color);
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, w / 4, 0.08), [MAT.green, MAT.green, MAT.green, MAT.green, std({ map: tex }), std({ map: tex })]);
    s.position.set(x, 3.0, z - 0.2); g.add(s);
  };
  const interact = (action: string, x: number, z: number, w: number, d: number, h = 1.6) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat); m.position.set(x, h / 2, z); m.userData.action = action; g.add(m); hits.push(m);
  };
  const seller = (look: number, x: number, z: number) => { const p = person(look, true); p.group.position.set(x, 0, z); p.group.rotation.y = Math.PI; g.add(p.group); solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25); };

  // Casa
  const C = LUGARES.casa;
  const woodFloor = std({ map: T.woodTexture(), roughness: 0.7 });
  (woodFloor.map as THREE.Texture).wrapS = (woodFloor.map as THREE.Texture).wrapT = THREE.RepeatWrapping; (woodFloor.map as THREE.Texture).repeat.set(6, 4);
  building({ ...C, puerta: C.puerta }, 0xf0e2c8, woodFloor, 0x8a3a2a);
  // Cama (dormitorio, al fondo a la izquierda)
  const bed = new THREE.Group();
  bed.add(box(1.7, 0.35, 2.3, std({ map: T.woodTexture(), roughness: 0.7 }), 0, 0.18, 0));
  bed.add(box(1.6, 0.2, 2.1, std({ color: 0xf4f4f0, roughness: 0.9 }), 0, 0.45, 0.05));
  bed.add(box(1.62, 0.12, 1.3, std({ color: 0x2f6fd8, roughness: 0.9 }), 0, 0.56, 0.4));
  bed.add(box(1.2, 0.15, 0.4, std({ color: 0xffffff, roughness: 0.9 }), 0, 0.6, -0.8));
  bed.add(box(1.7, 0.9, 0.12, std({ map: T.woodTexture(), roughness: 0.7 }), 0, 0.45, -1.15));
  bed.position.set(-17.6, 0, 38.6); g.add(bed);
  solid(-18.45, 37.35, -16.75, 39.8);
  interact('cama', -17.6, 38.4, 2.2, 2.8, 1.2);
  g.add(box(0.5, 0.5, 0.5, std({ map: T.woodTexture() }), -19.3, 0.25, 39.4)); // mesilla
  // Baño (al fondo a la derecha) con tabique y ducha
  const tile = std({ color: 0xdfeef2, roughness: 0.5 });
  g.add(box(0.15, 3.2, 4.2, tile, -10.2, 1.6, 37.9)); solid(-10.3, 35.8, -10.1, 40);
  const tray = box(1.6, 0.12, 1.6, std({ color: 0xffffff, roughness: 0.3 }), -7.0, 0.06, 38.9); g.add(tray);
  for (const [x, z, w, d] of [[-7.8, 38.9, 0.04, 1.6], [-7.0, 38.1, 1.6, 0.04]] as const) { const gl = box(w, 2.1, d, MAT.glass, x, 1.17, z); gl.castShadow = false; g.add(gl); }
  g.add(box(0.06, 0.06, 0.35, MAT.steel, -7.0, 2.1, 39.55));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.04, 14), MAT.steel); head.position.set(-7.0, 2.08, 39.3); g.add(head);
  const water = new THREE.Group();
  for (let i = 0; i < 24; i++) { const d = box(0.012, 0.25, 0.012, std({ color: 0x9fd8ff, transparent: true, opacity: 0.6 }), -7.0 + Math.cos(i) * 0.07 * (i % 3), 1.2 + (i % 7) * 0.12, 39.3 + Math.sin(i) * 0.07 * (i % 3)); d.castShadow = false; water.add(d); }
  water.visible = false; g.add(water);
  solid(-7.8, 38.1, -6.2, 39.8);
  interact('ducha', -7.0, 38.8, 1.8, 1.8, 2);
  g.add(box(0.9, 0.85, 0.5, std({ color: 0xffffff, roughness: 0.3 }), -9.5, 0.43, 39.5)); solid(-9.95, 39.2, -9.05, 39.8); // lavabo
  // Salón: sofá, mesa, alfombra y tele
  const sofa = new THREE.Group();
  sofa.add(box(2.2, 0.45, 0.9, std({ color: 0x3f6b35, roughness: 0.9 }), 0, 0.25, 0));
  sofa.add(box(2.2, 0.55, 0.2, std({ color: 0x3f6b35, roughness: 0.9 }), 0, 0.6, 0.38));
  sofa.position.set(-15.5, 0, 32.2); sofa.rotation.y = Math.PI; g.add(sofa); solid(-16.6, 31.7, -14.4, 32.7);
  g.add(box(1.2, 0.4, 0.6, std({ map: T.woodTexture() }), -15.5, 0.2, 34)); solid(-16.1, 33.7, -14.9, 34.3);
  const rug = box(3.2, 0.01, 2.2, std({ color: 0xc8a272, roughness: 1 }), -15.5, 0.015, 33.4); rug.castShadow = false; g.add(rug);
  g.add(box(1.6, 0.9, 0.08, MAT.black, -15.5, 1.4, 35.9)); g.add(box(1.2, 0.5, 0.4, std({ map: T.woodTexture() }), -15.5, 0.25, 35.8)); solid(-16.1, 35.6, -14.9, 36.0);
  sign('Casa', '#8a3a2a', C.puerta, C.z0, 2.4);

  // Mayorista
  const Mz = LUGARES.mayorista;
  building(Mz, 0xd8d0c0, std({ color: 0x9a9a94, roughness: 0.9 }), 0x3a3d40, 4, 2.2);
  sign('Mayorista', '#1f4f8a', Mz.puerta, Mz.z0, 4.4);
  const card = std({ map: T.cardboardTexture('MAYOR'), roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const x = Mz.x0 + 1.2 + i * 1.4;
    for (let k = 0; k < 3; k++) g.add(box(1.1, 0.8, 0.9, card, x, 0.4 + k * 0.82, Mz.z1 - 0.7));
  }
  solid(Mz.x0, Mz.z1 - 1.25, Mz.x1, Mz.z1);
  g.add(box(3.4, 1.0, 0.8, std({ color: 0x1f4f8a, roughness: 0.6 }), Mz.puerta, 0.5, 36.5)); g.add(box(3.5, 0.05, 0.9, MAT.metalDark, Mz.puerta, 1.02, 36.5));
  solid(Mz.puerta - 1.7, 36.1, Mz.puerta + 1.7, 36.9);
  seller(31337, Mz.puerta, 37.6);
  interact('mayorista', Mz.puerta, 36.3, 3.6, 1.6);

  // Frutería
  const F = LUGARES.fruteria;
  building(F, 0xf2d8a0, std({ color: 0xc8b48a, roughness: 0.9 }), 0x2f6b3a, 3.2, 1.6);
  sign('Frutería', '#2f6b3a', F.puerta, F.z0, 3.4);
  // Toldo a rayas
  for (let i = 0; i < 6; i++) { const a = box(F.x1 - F.x0 + 0.4, 0.04, 0.3, std({ color: i % 2 ? 0xffffff : 0x3a9a5a, roughness: 0.8 }), (F.x0 + F.x1) / 2, 2.55 - i * 0.05, F.z0 - 0.3 - i * 0.28); a.rotation.x = 0.18; a.castShadow = false; g.add(a); }
  const fruitColors = [0xd9262e, 0xf2cf2e, 0x5b2a6e, 0xd91e2e, 0xff8a1a, 0x3a9a3e];
  const fruitGeo = new THREE.SphereGeometry(0.06, 8, 6);
  for (let c = 0; c < 6; c++) {
    const x = F.x0 + 1.2 + c * 1.3, z = F.z1 - 0.8;
    g.add(box(1.1, 0.7, 0.8, std({ map: T.woodTexture() }), x, 0.35, z));
    const m = std({ color: fruitColors[c], roughness: 0.4 });
    for (let k = 0; k < 18; k++) { const f = new THREE.Mesh(fruitGeo, m); f.position.set(x - 0.4 + (k % 6) * 0.16, 0.76 + Math.floor(k / 6) * 0.04, z - 0.25 + Math.floor(k / 6) * 0.2); g.add(f); }
  }
  solid(F.x0, F.z1 - 1.25, F.x1, F.z1);
  g.add(box(2.6, 1.0, 0.7, std({ map: T.woodTexture(), roughness: 0.7 }), F.puerta, 0.5, 34.2)); solid(F.puerta - 1.3, 33.85, F.puerta + 1.3, 34.55);
  seller(777, F.puerta, 35.2);
  interact('fruteria', F.puerta, 34, 2.8, 1.6);

  // La propia tienda vista desde fuera bloquea el paso (menos por la puerta, que lleva su rejilla).
  solid(-9.7, -7.7, 9.7, 7.55);

  const walkable = (p: Point): boolean => {
    if (p.x >= TIENDA.x0 && p.x <= TIENDA.x1 && p.z >= TIENDA.z0 && p.z <= TIENDA.z1) return walkableTienda(p);
    if (p.x < BOUNDS.x0 + RADIO || p.x > BOUNDS.x1 - RADIO || p.z < BOUNDS.z0 + RADIO || p.z > BOUNDS.z1 - RADIO) return false;
    for (const o of obst) if (p.x > o.x0 - RADIO && p.x < o.x1 + RADIO && p.z > o.z0 - RADIO && p.z < o.z1 + RADIO) return false;
    return true;
  };
  return { group: g, hits, walkable, shower: water };
}
