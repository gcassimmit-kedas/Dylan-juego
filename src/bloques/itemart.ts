// Arte de los objetos: icono pixelado (para el inventario) y modelo 3D (para la mano).
// Los bloques usan su textura; herramientas y materiales se dibujan en 16 x 16 y, en la mano,
// cada píxel se convierte en un cubito (se ve con volumen, como un objeto real).
import * as THREE from 'three';
import { BLOCKS } from './voxel.ts';
import { ITEMS, I } from './items.ts';
import type { Atlas, TexName } from './textures.ts';

const TIER_COLOR = ['#a8834e', '#8e8e90', '#e2e2e6', '#5ee8df']; // madera, piedra, hierro, diamante
const HANDLE = '#6b4a2b';

/** Píxeles (16 x 16, null = transparente) de una herramienta o material. */
function pixels(id: number): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: 16 }, () => Array(16).fill(null));
  const put = (x: number, y: number, c: string) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = c; };
  const def = ITEMS.get(id);
  const handle = () => { for (let i = 0; i < 11; i++) { put(3 + i, 12 - i, HANDLE); put(3 + i, 13 - i, '#4a321c'); } };
  if (def?.tool) {
    const c = TIER_COLOR[def.tool.tier - 1], d = shadeHex(c, 0.7);
    switch (def.tool.type) {
      case 'pico': handle(); for (let i = 0; i < 9; i++) { put(6 + i, 2 + Math.round(Math.abs(i - 4) * 0.5), c); put(6 + i, 3 + Math.round(Math.abs(i - 4) * 0.5), d); } break;
      case 'hacha': handle(); for (let y = 1; y < 7; y++) for (let x = 9; x < 14; x++) if (x + y > 11 && !(x === 13 && y === 6)) put(x, y, y > 4 ? d : c); break;
      case 'pala': handle(); for (let y = 0; y < 5; y++) for (let x = 11; x < 16; x++) if (Math.hypot(x - 13, y - 2) < 2.6) put(x, y, y > 2 ? d : c); break;
      case 'espada':
        for (let i = 0; i < 10; i++) { put(5 + i, 10 - i, c); put(6 + i, 10 - i, d); put(5 + i, 9 - i, shadeHex(c, 1.15)); }
        for (let i = -2; i <= 2; i++) put(4 + i, 11 + i, '#3a2a18');
        for (let i = 0; i < 4; i++) put(1 + i, 14 - i, HANDLE);
        break;
    }
    return g;
  }
  switch (id) {
    case I.Palo: for (let i = 0; i < 12; i++) { put(2 + i, 13 - i, HANDLE); put(3 + i, 13 - i, '#4a321c'); } break;
    case I.Carbon: for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, y - 8.5) < 4.6) put(x, y, (x + y) % 3 ? '#2a2a2c' : '#4a4a50'); break;
    case I.Diamante: for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if (Math.abs(x - 7.5) + Math.abs(y - 7.5) < 5) put(x, y, x + y < 14 ? '#b8fff9' : '#3ec8c0'); break;
    case I.Bayas: for (const [bx, by] of [[5, 9], [10, 8], [8, 12]]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y) < 2.4) put(bx + x, by + y, x + y < -1 ? '#ff7f9c' : x + y > 1 ? '#a81f46' : '#e2345a');
      for (let i = 0; i < 4; i++) { put(7 + i, 5 - i, '#4e9638'); put(6, 6 + (i % 2), '#4e9638'); }
      break;
    case I.Esmeralda: for (let y = 2; y < 14; y++) for (let x = 4; x < 12; x++) if (Math.abs(x - 7.5) * 1.6 + Math.abs(y - 7.5) < 6.5) put(x, y, x + y < 15 ? '#9dffc0' : '#1f9e55'); break;
    default: { // lingotes
      const c = id === I.LingoteOro ? '#ffd23a' : '#d8d8dc';
      for (let y = 6; y < 11; y++) for (let x = 2 + (10 - y); x < 14 - (10 - y) + 2; x++) put(x, y, y === 6 ? shadeHex(c, 1.1) : y === 10 ? shadeHex(c, 0.7) : c);
    }
  }
  return g;
}
function shadeHex(c: string, k: number) {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const iconCache = new Map<number, string>();
/** Icono del objeto como imagen (data URL), para el inventario. */
export function itemIcon(id: number, atlas: Atlas): string {
  let u = iconCache.get(id);
  if (u) return u;
  const def = ITEMS.get(id);
  if (def?.block !== undefined) u = atlas.icon(BLOCKS[def.block].tex[1] as TexName);
  else {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d')!;
    pixels(id).forEach((row, y) => row.forEach((col, x) => { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
    u = c.toDataURL();
  }
  iconCache.set(id, u);
  return u;
}

const pixelGeo = new THREE.BoxGeometry(1, 1, 1);
const pixelMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
/** Modelo 3D del objeto, de 1 x 1 de tamaño, centrado. */
export function itemModel(id: number, atlas: Atlas): THREE.Object3D {
  const def = ITEMS.get(id);
  if (def?.block !== undefined && BLOCKS[def.block].plant) {
    // Planta en la mano: su dibujo en dos planos cruzados
    const [u0, v0, u1, v1] = atlas.uv(BLOCKS[def.block].tex[1] as TexName);
    const mat = new THREE.MeshStandardMaterial({ map: atlas.map, roughness: 0.9, alphaTest: 0.5, side: THREE.DoubleSide });
    const g = new THREE.Group();
    for (const rot of [Math.PI / 4, -Math.PI / 4]) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < 4; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v0 : v1);
      const m = new THREE.Mesh(geo, mat); m.rotation.y = rot; g.add(m);
    }
    return g;
  }
  if (def?.block !== undefined) {
    const b = BLOCKS[def.block];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    // Caras de BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada una)
    const texOf = [b.tex[1], b.tex[1], b.tex[0], b.tex[2], b.tex[1], b.tex[1]];
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = atlas.uv(texOf[f] as TexName);
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v0 : v1);
      }
    }
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: atlas.map, roughness: 0.9, alphaTest: 0.5, transparent: false }));
    if (b.height) { const g = new THREE.Group(); m.scale.y = b.height; g.add(m); return g; } // losa: medio bloque
    return m;
  }
  const px = pixels(id);
  const cells: [number, number, string][] = [];
  px.forEach((row, y) => row.forEach((c, x) => { if (c) cells.push([x, y, c]); }));
  const im = new THREE.InstancedMesh(pixelGeo, pixelMat, cells.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  cells.forEach(([x, y, c], i) => {
    m4.makeScale(1 / 16, 1 / 16, 1 / 16).setPosition((x - 7.5) / 16, (7.5 - y) / 16, 0);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col.set(c));
  });
  return im;
}
