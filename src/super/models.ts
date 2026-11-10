// Modelos 3D del supermercado: edificio, muebles, envases, clientes y cajero.
// Los productos de cada mueble son InstancedMesh: cientos de envases con muy pocas llamadas de dibujo,
// y mostrar las existencias es solo cambiar cuántas instancias se dibujan.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PRODUCTS, type Display, type ProductId } from './sim.ts';
import * as T from './textures.ts';

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);

function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
}

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// ---------- Materiales comunes ----------
export const MAT = {
  metalWhite: std({ color: 0xeceae4, roughness: 0.45, metalness: 0.35 }),
  metalDark: std({ color: 0x3a3d40, roughness: 0.5, metalness: 0.6 }),
  steel: std({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.85 }),
  green: std({ color: 0x2f6b3a, roughness: 0.55 }),
  gold: std({ color: 0xffc83d, roughness: 0.4, metalness: 0.2 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.5, depthWrite: false }),
  black: std({ color: 0x1b1c1e, roughness: 0.6 }),
  priceStrip: std({ color: 0xffd34d, roughness: 0.6 }),
};

let woodMat: THREE.MeshStandardMaterial | null = null;
const wood = () => (woodMat ??= std({ map: T.woodTexture(), roughness: 0.75 }));
let cardMat: THREE.MeshStandardMaterial | null = null;
const cardboard = () => (cardMat ??= std({ map: T.cardboardTexture(), roughness: 0.9 }));

// ---------- Envases ----------

/** Una pieza de un envase: geometría + material + posición dentro del envase. */
interface Part { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; m: THREE.Matrix4 }
/** Envase de un producto: piezas y tamaño (ancho x, alto y, fondo z) con el origen en la base. */
export interface ItemTemplate { parts: Part[]; w: number; h: number; d: number }

const at = (x: number, y: number, z: number, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));

function boxItem(w: number, h: number, d: number, label: THREE.Texture, side: number, top = side): ItemTemplate {
  const geo = new THREE.BoxGeometry(w, h, d);
  const sideM = std({ color: side, roughness: 0.5 }), topM = std({ color: top, roughness: 0.5 });
  const labelM = std({ map: label, roughness: 0.45 });
  return { parts: [{ geo, mat: [sideM, sideM, topM, topM, labelM, labelM], m: at(0, h / 2, 0) }], w, h, d };
}

function bottle(height: number, radius: number, body: THREE.Material, label: THREE.Texture, capColor: number): ItemTemplate {
  const r = radius, h = height;
  const pts = [[0, 0], [r * 0.85, 0], [r, h * 0.04], [r, h * 0.6], [r * 0.92, h * 0.7], [r * 0.4, h * 0.86], [r * 0.32, h * 0.93], [r * 0.32, h * 0.96]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 18);
  const lab = new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.3, 18, 1, true);
  const cap = new THREE.CylinderGeometry(r * 0.36, r * 0.36, h * 0.06, 12);
  return {
    parts: [
      { geo, mat: body, m: at(0, 0, 0) },
      { geo: lab, mat: std({ map: label, roughness: 0.35 }), m: at(0, h * 0.32, 0, Math.PI / 2) },
      { geo: cap, mat: std({ color: capColor, roughness: 0.4 }), m: at(0, h * 0.99, 0) },
    ],
    w: r * 2, h, d: r * 2,
  };
}

function cartonItem(): ItemTemplate {
  const w = 0.085, h = 0.17;
  const body = boxItem(w, h, w, T.labelTexture('leche'), 0xffffff, 0xffffff).parts[0];
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, 0.04)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: w, bevelEnabled: false });
  gable.translate(0, 0, -w / 2);
  const cap = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10);
  return {
    parts: [body,
      { geo: gable, mat: std({ color: 0xf4f6fa, roughness: 0.5 }), m: at(0, h, 0, Math.PI / 2) },
      { geo: cap, mat: std({ color: 0x2d6fd2, roughness: 0.4 }), m: at(0.02, h + 0.02, 0) }],
    w, h: h + 0.04, d: w,
  };
}

function yogurtItem(): ItemTemplate {
  const cup = new THREE.CylinderGeometry(0.036, 0.029, 0.075, 16, 1, true);
  const lid = new THREE.CircleGeometry(0.037, 16); lid.rotateX(-Math.PI / 2);
  return {
    parts: [
      { geo: cup, mat: std({ map: T.labelTexture('yogur'), roughness: 0.45, side: THREE.DoubleSide }), m: at(0, 0.0375, 0, Math.PI / 2) },
      { geo: lid, mat: std({ color: 0xd8dde3, roughness: 0.25, metalness: 0.8 }), m: at(0, 0.075, 0) },
    ],
    w: 0.075, h: 0.075, d: 0.075,
  };
}

function cheeseItem(): ItemTemplate {
  const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.075, 28);
  const rind = std({ map: T.cheeseTexture(), roughness: 0.6 });
  const top = std({ map: T.labelTexture('queso'), roughness: 0.5 });
  return { parts: [{ geo, mat: [rind, top, rind], m: at(0, 0.0375, 0) }], w: 0.2, h: 0.075, d: 0.2 };
}

function breadItem(): ItemTemplate {
  const geo = new RoundedBoxGeometry(0.26, 0.12, 0.12, 3, 0.04);
  const bag = std({ color: 0xf2e7d0, roughness: 0.35 });
  const lab = std({ map: T.labelTexture('pan'), roughness: 0.35 });
  return { parts: [{ geo, mat: [bag, bag, bag, bag, lab, lab], m: at(0, 0.06, 0) }], w: 0.26, h: 0.12, d: 0.12 };
}

function appleItem(): ItemTemplate {
  const geo = new THREE.SphereGeometry(0.045, 14, 10); geo.scale(1, 0.9, 1);
  const stem = new THREE.CylinderGeometry(0.004, 0.004, 0.025, 5);
  return {
    parts: [
      { geo, mat: std({ map: T.appleTexture(), roughness: 0.35 }), m: at(0, 0.04, 0) },
      { geo: stem, mat: std({ color: 0x4a2f14, roughness: 0.8 }), m: at(0, 0.088, 0) },
    ],
    w: 0.09, h: 0.09, d: 0.09,
  };
}

const templates = new Map<ProductId, ItemTemplate>();
export function itemTemplate(p: ProductId): ItemTemplate {
  let t = templates.get(p);
  if (t) return t;
  switch (p) {
    case 'cereales': t = boxItem(0.22, 0.32, 0.07, T.labelTexture('cereales'), 0xe0601b, 0xf08a2a); break;
    case 'galletas': t = boxItem(0.17, 0.11, 0.05, T.labelTexture('galletas'), 0x2a4ea3, 0xffd34d); break;
    case 'refresco': t = bottle(0.3, 0.048, new THREE.MeshPhysicalMaterial({ color: 0x3a1408, roughness: 0.15, transparent: true, opacity: 0.92 }), T.labelTexture('refresco'), 0xd0202a); break;
    case 'agua': t = bottle(0.3, 0.046, new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.05, transparent: true, opacity: 0.55, depthWrite: false }), T.labelTexture('agua'), 0x1f6fb8); break;
    case 'leche': t = cartonItem(); break;
    case 'yogur': t = yogurtItem(); break;
    case 'queso': t = cheeseItem(); break;
    case 'pan': t = breadItem(); break;
    case 'manzanas': t = appleItem(); break;
  }
  templates.set(p, t);
  return t;
}

/** Envase suelto (para las cestas de los clientes y las miniaturas del catálogo). */
export function itemMesh(p: ProductId): THREE.Group {
  const g = new THREE.Group();
  for (const part of itemTemplate(p).parts) {
    const m = new THREE.Mesh(part.geo, part.mat);
    m.applyMatrix4(part.m);
    g.add(m);
  }
  return g;
}

/** Huecos donde se colocan las unidades de un mueble: matriz de cada unidad (en coordenadas del mueble). */
type Slots = THREE.Matrix4[][];

/** Productos expuestos en un mueble: una InstancedMesh por pieza del envase. */
class Stock {
  meshes: THREE.InstancedMesh[] = [];
  perUnit: number[] = [];
  constructor(parent: THREE.Object3D, p: ProductId, slots: Slots) {
    const tpl = itemTemplate(p);
    const flat = slots.flat();
    const tmp = new THREE.Matrix4();
    for (const part of tpl.parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, flat.length);
      flat.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, part.m)));
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
      this.meshes.push(im);
    }
    // Las unidades se guardan seguidas: mostrar N unidades es dibujar las primeras N·k instancias.
    let acc = 0;
    this.perUnit = slots.map((s) => (acc += s.length));
  }
  show(units: number) {
    const n = units <= 0 ? 0 : this.perUnit[Math.min(units, this.perUnit.length) - 1];
    for (const m of this.meshes) m.count = n;
  }
}

/** Reparte `cap` unidades en filas (niveles) y columnas; cada unidad es un frente de varios envases. */
function shelfSlots(p: ProductId, cap: number, levels: number[], width: number, depth: number, frontZ: number, tilt = 0): Slots {
  const tpl = itemTemplate(p);
  const cols = Math.ceil(cap / levels.length);
  const slotW = width / cols;
  const across = Math.max(1, Math.min(4, Math.floor((slotW * 0.94) / (tpl.w + 0.01))));
  const deep = Math.max(1, Math.min(3, Math.floor(depth / (tpl.d + 0.012))));
  const out: Slots = [];
  for (let u = 0; u < cap; u++) {
    const level = Math.floor(u / cols), col = u % cols;
    const y = levels[level];
    const x0 = -width / 2 + slotW * (col + 0.5);
    const unit: THREE.Matrix4[] = [];
    for (let k = 0; k < deep; k++) for (let a = 0; a < across; a++) {
      const x = x0 + (a - (across - 1) / 2) * (tpl.w + 0.01);
      const z = frontZ - tpl.d / 2 - k * (tpl.d + 0.012);
      unit.push(at(x, y + (frontZ - z) * tilt, z, (((u * 7 + a * 3 + k) % 5) - 2) * 0.02));
    }
    out.push(unit);
  }
  return out;
}

// ---------- Muebles ----------

export interface DisplayModel {
  group: THREE.Group;
  stock: Stock;
  /** Caja invisible para tocar el mueble. */
  hit: THREE.Mesh;
  /** Punto donde va la barra de existencias. */
  badgeY: number;
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false });

/** Media góndola de doble cara (cada cara es un producto). Frente hacia +z local. */
const GONDOLA_SIGN: Partial<Record<ProductId, string>> = { cereales: 'Desayuno', galletas: 'Dulces', refresco: 'Refrescos', agua: 'Agua' };

function gondola(p: ProductId): DisplayModel {
  const g = new THREE.Group();
  const L = 3.0, H = 1.9, D = 0.5;
  g.add(box(L, H, 0.04, MAT.metalWhite, 0, H / 2, -D / 2 + 0.02));
  g.add(box(L, 0.12, D, MAT.metalDark, 0, 0.06, 0));
  const levels = [0.12, 0.56, 1.0, 1.44];
  for (const y of levels.slice(1)) {
    g.add(box(L - 0.04, 0.025, D - 0.04, MAT.metalWhite, 0, y - 0.0125, 0));
    g.add(box(L - 0.04, 0.035, 0.012, MAT.priceStrip, 0, y - 0.03, D / 2 - 0.02));
  }
  g.add(box(L - 0.04, 0.035, 0.012, MAT.priceStrip, 0, 0.09, D / 2 - 0.005));
  for (const x of [-L / 2, L / 2]) g.add(box(0.04, H, D, MAT.metalWhite, x, H / 2, 0));
  // Copete superior verde con franja dorada
  g.add(box(L, 0.34, 0.06, MAT.green, 0, H + 0.17, -D / 2 + 0.03));
  g.add(box(L, 0.025, 0.062, MAT.gold, 0, H, -D / 2 + 0.03));
  const st = T.signTexture(GONDOLA_SIGN[p] ?? PRODUCTS[p].nombre);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.34), std({ map: st, roughness: 0.6 }));
  sign.position.set(0, H + 0.17, -D / 2 + 0.062); g.add(sign);
  // Trasera: chapa verde con franja, para que se vea acabada desde el pasillo de atrás
  g.add(box(L, H - 0.12, 0.012, MAT.green, 0, (H + 0.12) / 2, -D / 2 - 0.006));
  shadow(g);
  const stock = new Stock(g, p, shelfSlots(p, PRODUCTS[p].capacidad, levels, L - 0.2, D - 0.08, D / 2 - 0.03));
  const hit = new THREE.Mesh(new THREE.BoxGeometry(L, H, D + 0.6), hitMat); hit.position.set(0, H / 2, 0.3); g.add(hit);
  return { group: g, stock, hit, badgeY: H + 0.55 };
}

/** Nevera vertical con puertas de cristal y luz interior. Frente hacia +z local. */
function fridge(p: ProductId): DisplayModel {
  const g = new THREE.Group();
  const W = 2.2, H = 2.1, D = 0.75;
  const shell = std({ color: 0x2b2f33, roughness: 0.45, metalness: 0.5 });
  g.add(box(W, 0.18, D, shell, 0, 0.09, 0));
  g.add(box(W, 0.22, D, shell, 0, H - 0.11, 0));
  g.add(box(W, H, 0.04, std({ color: 0xf2f4f6, roughness: 0.5 }), 0, H / 2, -D / 2 + 0.02));
  for (const x of [-W / 2, W / 2]) g.add(box(0.05, H, D, shell, x + (x > 0 ? -0.025 : 0.025), H / 2, 0));
  const levels = [0.18, 0.6, 1.02, 1.44];
  for (const y of levels.slice(1)) {
    g.add(box(W - 0.1, 0.02, D - 0.12, MAT.glass, 0, y - 0.01, -0.03));
    g.add(box(W - 0.1, 0.03, 0.01, MAT.priceStrip, 0, y - 0.025, D / 2 - 0.1));
  }
  // Luz fría interior y rótulo luminoso
  g.add(box(W - 0.12, 0.03, 0.03, std({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 2.4 }), 0, H - 0.25, D / 2 - 0.12));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.18), std({ map: T.signTexture(PRODUCTS[p].nombre, '#1f4f8a'), emissive: 0xffffff, emissiveMap: T.signTexture(PRODUCTS[p].nombre, '#1f4f8a'), emissiveIntensity: 0.55 }));
  sign.position.set(0, H - 0.11, D / 2 + 0.002); g.add(sign);
  // Puertas de cristal con tirador
  const doors = 3, dw = (W - 0.1) / doors;
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + 0.05 + dw * (i + 0.5);
    g.add(box(dw - 0.02, H - 0.42, 0.015, MAT.glass, x, H / 2 - 0.02, D / 2 - 0.01));
    g.add(box(0.02, H - 0.42, 0.03, shell, x - dw / 2 + 0.01, H / 2 - 0.02, D / 2 - 0.01));
    g.add(box(0.025, 0.5, 0.04, MAT.steel, x + dw / 2 - 0.08, 1.05, D / 2 + 0.02));
  }
  shadow(g);
  g.traverse((m) => { if ((m as THREE.Mesh).material === MAT.glass) m.castShadow = false; });
  const stock = new Stock(g, p, shelfSlots(p, PRODUCTS[p].capacidad, levels, W - 0.3, D - 0.25, D / 2 - 0.1));
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W, H, D + 0.6), hitMat); hit.position.set(0, H / 2, 0.3); g.add(hit);
  return { group: g, stock, hit, badgeY: H + 0.45 };
}

/** Mesa de fruta con caja de madera inclinada. Frente hacia +z local. */
function fruitStand(p: ProductId): DisplayModel {
  const g = new THREE.Group();
  const W = 1.8, D = 1.1, H = 0.75, tilt = 0.22;
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) for (const z of [-D / 2 + 0.06, D / 2 - 0.06]) g.add(box(0.07, H, 0.07, wood(), x, H / 2, z));
  const top = new THREE.Group(); top.position.set(0, H, 0); top.rotation.x = tilt; g.add(top);
  top.add(box(W, 0.04, D, wood(), 0, 0, 0));
  for (const z of [-D / 2, D / 2]) top.add(box(W, 0.14, 0.03, wood(), 0, 0.07, z));
  for (const x of [-W / 2, W / 2]) top.add(box(0.03, 0.14, D, wood(), x, 0.07, 0));
  // Toldo verde con cartel
  g.add(box(0.05, 1.6, 0.05, MAT.metalDark, -W / 2 + 0.05, 0.8, -D / 2)); g.add(box(0.05, 1.6, 0.05, MAT.metalDark, W / 2 - 0.05, 0.8, -D / 2));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.32), std({ map: T.signTexture('Frutas'), roughness: 0.6 }));
  sign.position.set(0, 1.6, -D / 2 + 0.03); g.add(sign);
  shadow(g);
  // Montón de manzanas: unidades de dos piezas sobre la caja, apiladas hacia el centro.
  const cap = PRODUCTS[p].capacidad, slots: Slots = [];
  const cols = 10, rows = 6, r = rng(77);
  for (let u = 0; u < cap; u++) {
    const unit: THREE.Matrix4[] = [];
    for (let k = 0; k < 2; k++) {
      const i = u * 2 + k, layer = Math.floor(i / (cols * rows)), j = i % (cols * rows);
      const cx = (j % cols) - (cols - 1) / 2, cz = Math.floor(j / cols) - (rows - 1) / 2;
      const x = cx * 0.16 + (r() - 0.5) * 0.03 + (layer ? 0.08 : 0), z = cz * 0.16 + (r() - 0.5) * 0.03 + (layer ? 0.08 : 0);
      unit.push(at(x, 0.02 + layer * 0.07, z, r() * 6));
    }
    slots.push(unit);
  }
  // La primera mitad de las unidades queda abajo: al vaciarse se van primero las de encima.
  slots.reverse();
  const stock = new Stock(top, p, slots);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, D + 0.4), hitMat); hit.position.set(0, 0.8, 0.2); g.add(hit);
  return { group: g, stock, hit, badgeY: 2.2 };
}

/** Panera de madera contra la pared, con estantes inclinados. Frente hacia +z local. */
function breadRack(p: ProductId): DisplayModel {
  const g = new THREE.Group();
  const W = 2.6, H = 1.8, D = 0.6;
  g.add(box(W, H, 0.04, wood(), 0, H / 2, -D / 2 + 0.02));
  for (const x of [-W / 2, W / 2]) g.add(box(0.05, H, D, wood(), x, H / 2, 0));
  const levels = [0.3, 0.8, 1.3];
  const group = new THREE.Group(); g.add(group);
  for (const y of levels) {
    const s = box(W - 0.1, 0.03, D - 0.05, wood(), 0, y - 0.015, 0); s.rotation.x = 0.12; g.add(s);
    g.add(box(W - 0.1, 0.06, 0.02, wood(), 0, y + 0.0, D / 2 - 0.03));
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.34), std({ map: T.signTexture('Panadería', '#8a4b1f'), roughness: 0.6 }));
  sign.position.set(0, H + 0.2, -D / 2 + 0.05); g.add(sign);
  shadow(g);
  const stock = new Stock(group, p, shelfSlots(p, PRODUCTS[p].capacidad, levels, W - 0.3, D - 0.12, D / 2 - 0.06, 0.12));
  const hit = new THREE.Mesh(new THREE.BoxGeometry(W, H, D + 0.6), hitMat); hit.position.set(0, H / 2, 0.3); g.add(hit);
  return { group: g, stock, hit, badgeY: H + 0.75 };
}

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

export function displayModel(d: Display): DisplayModel {
  const m = d.tipo === 'gondola' ? gondola(d.product) : d.tipo === 'nevera' ? fridge(d.product) : d.tipo === 'fruta' ? fruitStand(d.product) : breadRack(d.product);
  m.group.position.set(d.x, 0, d.z);
  m.group.rotation.y = d.rot;
  m.hit.userData.product = d.product;
  return m;
}

// ---------- Edificio ----------

export interface Building {
  group: THREE.Group;
  /** Paredes que se recortan cuando la cámara está detrás (vista de casa de muñecas). */
  walls: { mesh: THREE.Object3D; normal: THREE.Vector3; point: THREE.Vector3 }[];
}

export const STORE = { minX: -9.5, maxX: 9.5, minZ: -7.5, maxZ: 7.5, H: 3.4 };

export function building(): Building {
  const g = new THREE.Group();
  const { minX, maxX, minZ, maxZ, H } = STORE;
  const W = maxX - minX, Dz = maxZ - minZ;
  // Suelo de terrazo
  const fl = T.floorTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, Dz), std({ map: fl.map, roughnessMap: fl.rough, roughness: 1, metalness: 0.0, envMapIntensity: 0.9 }));
  fl.map.repeat.set(W / 2, Dz / 2); fl.rough.repeat.set(W / 2, Dz / 2);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  // Aparcamiento y acera
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), std({ map: T.asphaltTexture(), roughness: 0.95 }));
  (asphalt.material as THREE.MeshStandardMaterial).map!.repeat.set(8, 6);
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(0, -0.02, 20); asphalt.receiveShadow = true; g.add(asphalt);
  const curb = box(W + 2, 0.12, 3, std({ color: 0xb9b5aa, roughness: 0.9 }), 0, 0.04, maxZ + 1.5); curb.receiveShadow = true; g.add(curb);
  const grass = box(80, 0.04, 60, std({ color: 0x4d6b32, roughness: 1 }), 0, -0.05, -26); grass.receiveShadow = true; g.add(grass);

  const wallMat = std({ map: T.wallTexture(), roughness: 0.85 });
  const walls: Building['walls'] = [];
  const addWall = (len: number, cx: number, cz: number, ry: number, normal: THREE.Vector3) => {
    const geo = new THREE.BoxGeometry(len, H, 0.2);
    const tex = (wallMat.map as THREE.Texture).clone(); tex.needsUpdate = true; tex.repeat.set(len / 2, 1);
    const mat = wallMat.clone(); mat.map = tex;
    const m = new THREE.Mesh(geo, [mat, mat, MAT.metalWhite, MAT.metalWhite, mat, mat]);
    m.position.set(cx, H / 2, cz); m.rotation.y = ry;
    shadow(m);
    g.add(m);
    walls.push({ mesh: m, normal, point: new THREE.Vector3(cx, 0, cz) });
    return m;
  };
  addWall(W + 0.2, 0, minZ - 0.1, 0, new THREE.Vector3(0, 0, 1));
  addWall(Dz, minX - 0.1, 0, Math.PI / 2, new THREE.Vector3(1, 0, 0));
  addWall(Dz, maxX + 0.1, 0, Math.PI / 2, new THREE.Vector3(-1, 0, 0));

  // Fachada: escaparates de cristal con montantes y la puerta automática.
  const front = new THREE.Group();
  const door = { x: 6, w: 2.4 };
  const frame = std({ color: 0x2b2f33, roughness: 0.4, metalness: 0.6 });
  front.add(box(W + 0.2, 0.5, 0.22, frame, 0, H - 0.25, 0));
  front.add(box(W + 0.2, 0.35, 0.22, frame, 0, 0.175, 0));
  for (let x = minX; x <= maxX + 0.01; x += 1.9) if (Math.abs(x - door.x) > door.w / 2) front.add(box(0.08, H, 0.2, frame, x, H / 2, 0));
  const glassL = door.x - door.w / 2 - minX, glassR = maxX - (door.x + door.w / 2);
  front.add(box(glassL, H - 0.85, 0.03, MAT.glass, minX + glassL / 2, H / 2 - 0.08, 0));
  front.add(box(glassR, H - 0.85, 0.03, MAT.glass, maxX - glassR / 2, H / 2 - 0.08, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.5), std({ map: T.storeSignTexture(), emissive: 0xffffff, emissiveMap: T.storeSignTexture(), emissiveIntensity: 0.6 }));
  sign.position.set(-2.5, H - 0.25, 0.115); front.add(sign);
  front.traverse((m) => { if ((m as THREE.Mesh).isMesh && (m as THREE.Mesh).material !== MAT.glass) { m.castShadow = true; m.receiveShadow = true; } });
  front.position.z = maxZ + 0.1;
  g.add(front);
  walls.push({ mesh: front, normal: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(0, 0, maxZ) });

  // Puertas automáticas (se abren cuando pasa alguien)
  const doorL = box(door.w / 2, H - 0.85, 0.04, MAT.glass, 0, 0, 0), doorR = doorL.clone();
  doorL.position.set(door.x - door.w / 4, (H - 0.85) / 2 + 0.35, maxZ + 0.1); doorR.position.set(door.x + door.w / 4, (H - 0.85) / 2 + 0.35, maxZ + 0.1);
  g.add(doorL, doorR);
  g.userData.doors = { left: doorL, right: doorR, x: door.x, w: door.w };

  // Felpudo de entrada
  const mat = box(2.4, 0.015, 1.4, std({ color: 0x2c3a26, roughness: 1 }), door.x, 0.008, maxZ - 0.8); mat.receiveShadow = true; g.add(mat);
  return { group: g, walls };
}

/** Cartel colgante de la caja. */
export function ceilingDecor(): THREE.Group {
  const g = new THREE.Group();
  const hanging = (text: string, x: number, z: number, ry = 0) => {
    const t = T.signTexture(text);
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.04), [MAT.green, MAT.green, MAT.green, MAT.green, std({ map: t }), std({ map: t })]);
    s.position.set(x, 2.75, z); s.rotation.y = ry; s.castShadow = true;
    g.add(s);
    for (const dx of [-0.8, 0.8]) g.add(box(0.012, 0.4, 0.012, MAT.metalDark, x + dx * Math.cos(ry), 3.2, z - dx * Math.sin(ry)));
  };
  hanging('Caja', 3.6, 4.25);
  return g;
}

// ---------- Caja registradora ----------

export interface Checkout { group: THREE.Group; belt: THREE.Texture; screen: THREE.CanvasTexture; hit: THREE.Mesh; scanner: THREE.Mesh }

/** Mostrador de caja con cinta, escáner y visor. El cliente se pone en z menor; el cajero detrás. */
export function checkout(x: number, z: number): Checkout {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const body = std({ color: 0x2f6b3a, roughness: 0.6 });
  const top = std({ color: 0x3a3d40, roughness: 0.35, metalness: 0.5 });
  g.add(box(2.2, 0.85, 0.7, body, -0.3, 0.425, 0));
  g.add(box(2.24, 0.04, 0.74, top, -0.3, 0.87, 0));
  g.add(box(2.2, 0.06, 0.02, MAT.gold, -0.3, 0.78, -0.36));
  const belt = T.beltTexture();
  const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), std({ map: belt, roughness: 0.8 }));
  b.rotation.x = -Math.PI / 2; b.position.set(-0.75, 0.895, 0); g.add(b);
  const scanner = box(0.36, 0.02, 0.36, std({ color: 0x111111, emissive: 0xff2a2a, emissiveIntensity: 0.25, roughness: 0.1 }), 0.25, 0.9, 0);
  g.add(scanner);
  // Terminal con visor hacia el cliente
  g.add(box(0.08, 0.35, 0.08, MAT.metalDark, 0.7, 1.05, 0.15));
  const screen = T.registerScreenTexture(0, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.06), [MAT.black, MAT.black, MAT.black, MAT.black, MAT.black, std({ map: screen, emissive: 0xffffff, emissiveMap: screen, emissiveIntensity: 0.9 })]);
  head.position.set(0.7, 1.3, 0.15); head.rotation.y = Math.PI; g.add(head);
  g.add(box(0.45, 0.12, 0.35, MAT.black, 0.6, 0.95, 0.15));
  shadow(g);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.6), hitMat); hit.position.set(-0.2, 0.8, 0.2); g.add(hit);
  return { group: g, belt, screen, hit, scanner };
}

// ---------- Oficina con el ordenador ----------

export function office(x: number, z: number): { group: THREE.Group; hit: THREE.Mesh; screen: THREE.Mesh } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const deskM = std({ map: T.woodTexture(), roughness: 0.6 });
  g.add(box(1.6, 0.04, 0.8, deskM, 0, 0.76, 0));
  for (const dx of [-0.75, 0.75]) g.add(box(0.05, 0.74, 0.74, MAT.metalDark, dx, 0.37, 0));
  // Monitor
  g.add(box(0.2, 0.02, 0.16, MAT.black, 0, 0.79, -0.15));
  g.add(box(0.05, 0.25, 0.04, MAT.black, 0, 0.9, -0.17));
  const tex = T.monitorTexture();
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.45, 0.04), [MAT.black, MAT.black, MAT.black, MAT.black, std({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1 }), MAT.black]);
  screen.position.set(0, 1.18, -0.15); g.add(screen);
  g.add(box(0.5, 0.02, 0.16, std({ color: 0x2a2b2e, roughness: 0.6 }), 0, 0.79, 0.12));
  g.add(box(0.07, 0.025, 0.11, std({ color: 0x2a2b2e, roughness: 0.5 }), 0.4, 0.79, 0.12));
  // Silla
  const chair = new THREE.Group();
  chair.add(box(0.5, 0.08, 0.5, std({ color: 0x1f2b1a, roughness: 0.8 }), 0, 0.48, 0));
  chair.add(box(0.5, 0.55, 0.07, std({ color: 0x1f2b1a, roughness: 0.8 }), 0, 0.8, 0.24));
  chair.add(box(0.05, 0.44, 0.05, MAT.steel, 0, 0.22, 0));
  chair.add(box(0.5, 0.03, 0.05, MAT.steel, 0, 0.02, 0)); chair.add(box(0.05, 0.03, 0.5, MAT.steel, 0, 0.02, 0));
  chair.position.set(0.1, 0, 0.75); chair.rotation.y = 0.25;
  g.add(chair);
  // Archivador y planta
  g.add(box(0.5, 1.1, 0.55, std({ color: 0x8a8f86, roughness: 0.5, metalness: 0.3 }), -1.2, 0.55, -0.05));
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 14), std({ color: 0xb35a2e, roughness: 0.8 }));
  pot.position.set(1.15, 0.15, -0.1); g.add(pot);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), std({ color: 0x3f7a35, roughness: 0.8 }));
    leaf.scale.set(0.6, 1.4, 0.35); leaf.position.set(1.15 + Math.cos(i) * 0.1, 0.55 + (i % 3) * 0.06, -0.1 + Math.sin(i) * 0.1); leaf.rotation.z = Math.cos(i * 2) * 0.5;
    g.add(leaf);
  }
  shadow(g);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 1.8), hitMat); hit.position.set(0, 0.8, 0.3); g.add(hit);
  return { group: g, hit, screen };
}

// ---------- Almacén: palés con las cajas que quedan ----------

export function storage(x: number, z: number): { group: THREE.Group; boxes: THREE.InstancedMesh; hit: THREE.Mesh; max: number } {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pallet = new THREE.Group();
  pallet.add(box(1.2, 0.03, 1.0, wood(), 0, 0.135, 0));
  for (const dz of [-0.45, 0, 0.45]) pallet.add(box(1.2, 0.1, 0.1, wood(), 0, 0.07, dz));
  pallet.add(box(1.2, 0.02, 1.0, wood(), 0, 0.01, 0));
  for (const dx of [-0.65, 0.65]) { const p = pallet.clone(); p.position.x = dx; g.add(p); }
  const geo = new THREE.BoxGeometry(0.4, 0.3, 0.32);
  const max = 48;
  const boxes = new THREE.InstancedMesh(geo, cardboard(), max);
  const r = rng(91);
  // Se apilan de abajo arriba: al vaciarse el almacén desaparecen las de encima.
  for (let i = 0; i < max; i++) {
    const layer = Math.floor(i / 18), j = i % 18;
    const px = j < 9 ? -0.65 : 0.65, k = j % 9;
    const bx = px + ((k % 3) - 1) * 0.4, bz = (Math.floor(k / 3) - 1) * 0.32;
    boxes.setMatrixAt(i, at(bx + (r() - 0.5) * 0.02, 0.15 + 0.15 + layer * 0.3, bz + (r() - 0.5) * 0.02, (r() - 0.5) * 0.08));
  }
  boxes.castShadow = true; boxes.receiveShadow = true;
  g.add(boxes);
  // Rótulo del almacén en la pared
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), std({ map: T.signTexture('Almacén', '#3a3d40') }));
  sign.position.set(1.28, 2.2, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
  shadow(pallet);
  g.traverse((m) => { if ((m as THREE.Mesh).isMesh && m !== boxes) { m.castShadow = true; m.receiveShadow = true; } });
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 1.6), hitMat); hit.position.set(0, 0.8, 0); g.add(hit);
  return { group: g, boxes, hit, max };
}

/** Pila de cestas de la compra junto a la entrada. */
export function basketStack(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) { const b = basket(); b.position.y = i * 0.07; b.rotation.y = (i % 2) * 0.05; g.add(b); }
  return shadow(g);
}

const basketMat = std({ color: 0xc8202a, roughness: 0.5 });
function basket(): THREE.Group {
  const g = new THREE.Group();
  const W = 0.42, D = 0.3, H = 0.22;
  g.add(box(W, 0.015, D, basketMat, 0, 0.01, 0));
  g.add(box(W, H, 0.012, basketMat, 0, H / 2, D / 2)); g.add(box(W, H, 0.012, basketMat, 0, H / 2, -D / 2));
  g.add(box(0.012, H, D, basketMat, W / 2, H / 2, 0)); g.add(box(0.012, H, D, basketMat, -W / 2, H / 2, 0));
  return g;
}

// ---------- Personas ----------

const SKIN = [0xf1c7a5, 0xe0ac86, 0xc68a5e, 0x9b6440, 0x6e4529];
const HAIR = [0x2b1d14, 0x4a2f1c, 0x8a5a2b, 0xd8b26a, 0x1a1a1a, 0x9a9a9a];
const SHIRT = [0x3d6fd8, 0xd8453d, 0x3a9a5a, 0xe0a020, 0x7a4ab0, 0x2aa5a5, 0xe86aa0, 0x5a5f66, 0xf2f2ee];
const PANTS = [0x23314d, 0x2b2b2e, 0x5a4a3a, 0x3f4f3a, 0x6a6f78];

export interface Person {
  group: THREE.Group;
  legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D;
  basket: THREE.Group; basketItems: THREE.Group;
}

const limbGeo = new THREE.CapsuleGeometry(0.065, 0.36, 4, 10);
const armGeo = new THREE.CapsuleGeometry(0.05, 0.36, 4, 10);
const torsoGeo = new THREE.CapsuleGeometry(0.19, 0.34, 6, 14);
const headGeo = new THREE.SphereGeometry(0.15, 20, 16);
const hairGeo = new THREE.SphereGeometry(0.158, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
const shoeGeo = new RoundedBoxGeometry(0.12, 0.07, 0.22, 2, 0.03);
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const colorMat = (c: number, rough = 0.7) => { let m = matCache.get(c); if (!m) { m = std({ color: c, roughness: rough }); matCache.set(c, m); } return m; };

/** Persona de estilo limpio y redondeado. `look` decide la ropa; `uniform` viste al cajero. */
export function person(look: number, uniform = false): Person {
  const pick = <T,>(a: T[], k: number) => a[Math.floor(look / k) % a.length];
  const skin = colorMat(pick(SKIN, 1), 0.6), hair = colorMat(pick(HAIR, 5)), shirt = colorMat(uniform ? 0x2f6b3a : pick(SHIRT, 31)), pants = colorMat(uniform ? 0x23281e : pick(PANTS, 7));
  const shoes = colorMat(0x1d1d1f, 0.5);
  const g = new THREE.Group();
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
  const leg = (x: number) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.86, 0);
    pivot.add(mk(limbGeo, pants, 0, -0.43, 0));
    pivot.add(mk(shoeGeo, shoes, 0, -0.82, 0.04));
    g.add(pivot); return pivot;
  };
  const arm = (x: number) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.42, 0);
    pivot.add(mk(armGeo, shirt, 0, -0.22, 0));
    pivot.add(mk(new THREE.SphereGeometry(0.055, 10, 8), skin, 0, -0.47, 0));
    g.add(pivot); return pivot;
  };
  const legL = leg(-0.1), legR = leg(0.1);
  const torso = mk(torsoGeo, shirt, 0, 1.18, 0); torso.scale.set(1, 1, 0.72); g.add(torso);
  if (uniform) {
    const apron = mk(new THREE.BoxGeometry(0.3, 0.42, 0.02), colorMat(0xffc83d, 0.6), 0, 1.08, 0.14); g.add(apron);
  }
  g.add(mk(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 10), skin, 0, 1.52, 0));
  const head = mk(headGeo, skin, 0, 1.68, 0); g.add(head);
  const h = mk(hairGeo, hair, 0, 1.7, -0.01); h.rotation.x = -0.25; g.add(h);
  for (const ex of [-0.05, 0.05]) g.add(mk(new THREE.SphereGeometry(0.018, 8, 6), colorMat(0x1a1a1a, 0.3), ex, 1.7, 0.135));
  const armL = arm(-0.26), armR = arm(0.26);
  const b = basket(); b.scale.setScalar(0.85); b.position.set(0.3, 0.62, 0.12); b.rotation.y = Math.PI / 2;
  const basketItems = new THREE.Group(); b.add(basketItems);
  b.visible = false; g.add(b);
  shadow(g, true, false);
  return { group: g, legL, legR, armL, armR, basket: b, basketItems };
}
