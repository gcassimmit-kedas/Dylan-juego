// Texturas de bloques dibujadas por código (16 x 16 píxeles, estilo pixel art), con su mapa de relieve.
// Todo se genera en el dispositivo: no hay imágenes externas y funciona sin conexión.
import * as THREE from 'three';

export type TexName =
  | 'grass' | 'grassSide' | 'dirt' | 'stone' | 'cobble' | 'planks' | 'log' | 'logTop' | 'leaves'
  | 'sand' | 'crate' | 'metal' | 'metalDark' | 'gold' | 'brick' | 'glow'
  | 'gravel' | 'oreCoal' | 'oreIron' | 'oreGold' | 'oreDiamond' | 'bedrock' | 'tableTop' | 'tableSide' | 'torch' | 'furnace' | 'furnaceTop'
  | 'furnaceOn' | 'chest' | 'chestTop';

const N = 16;
type RGB = [number, number, number];

/** Generador pseudoaleatorio con semilla: las texturas salen iguales en todos los dispositivos. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Cada textura: color por píxel y altura por píxel (para el relieve). Alfa 0 = hueco (hojas). */
interface Px { c: RGB; h: number; a?: number }
type Painter = (x: number, y: number, r: () => number) => Px;

const PAINT: Record<TexName, Painter> = {
  grass: (_x, _y, r) => {
    const v = r();
    const base: RGB = v < 0.15 ? [70, 112, 44] : v < 0.6 ? [82, 126, 50] : v < 0.9 ? [94, 138, 56] : [112, 154, 66];
    return { c: shade(base, 0.92 + r() * 0.12), h: v };
  },
  grassSide: (_x, y, r) => {
    const edge = 3 + Math.floor(r() * 3);
    if (y < edge) return PAINT.grass(_x, y, r);
    return PAINT.dirt(_x, y, r);
  },
  dirt: (_x, _y, r) => {
    const v = r();
    const base: RGB = v < 0.2 ? [104, 74, 50] : v < 0.75 ? [122, 88, 60] : v < 0.95 ? [138, 102, 70] : [92, 92, 92];
    return { c: shade(base, 0.92 + r() * 0.12), h: v * 0.8 };
  },
  stone: (x, y, r) => {
    const v = r();
    const crack = (x * 7 + y * 3) % 23 === 0 || (x + y * 5) % 29 === 0;
    const base: RGB = crack ? [92, 94, 96] : v < 0.3 ? [118, 120, 122] : v < 0.85 ? [132, 134, 136] : [150, 152, 154];
    return { c: shade(base, 0.94 + r() * 0.1), h: crack ? 0 : 0.5 + v * 0.5 };
  },
  cobble: (x, y, r) => {
    // Piedras redondeadas separadas por juntas oscuras
    const cx = Math.floor((x + (Math.floor(y / 5) % 2) * 3) / 5), cy = Math.floor(y / 5);
    const lx = (x + (Math.floor(y / 5) % 2) * 3) % 5, ly = y % 5;
    const joint = lx === 0 || ly === 0;
    const tint = 0.85 + ((cx * 31 + cy * 17) % 7) / 30;
    const c: RGB = joint ? [70, 72, 74] : shade([136, 138, 140], tint * (0.95 + r() * 0.1));
    return { c, h: joint ? 0 : 0.6 + r() * 0.3 - (lx === 4 || ly === 4 ? 0.2 : 0) };
  },
  planks: (x, y, r) => {
    const row = Math.floor(y / 4), seam = y % 4 === 3;
    const cut = (x + row * 6) % 16 === 0;
    const base: RGB = [168, 128, 78];
    const k = 0.86 + ((row * 13) % 5) / 25 + (r() - 0.5) * 0.08;
    const grain = (x * 3 + row * 7) % 5 === 0 ? 0.92 : 1;
    return { c: seam || cut ? shade(base, 0.62) : shade(base, k * grain), h: seam || cut ? 0 : 0.7 + r() * 0.2 };
  },
  log: (x, _y, r) => {
    const stripe = (x * 5 + Math.floor(r() * 2)) % 4 === 0;
    const base: RGB = [104, 76, 48];
    return { c: shade(base, stripe ? 0.7 : 0.9 + r() * 0.15), h: stripe ? 0.1 : 0.6 + r() * 0.3 };
  },
  logTop: (x, y, r) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 7) return PAINT.log(x, y, r);
    const ring = Math.floor(d) % 2 === 0;
    return { c: shade([182, 146, 96], ring ? 0.82 : 1), h: ring ? 0.4 : 0.6 };
  },
  leaves: (_x, _y, r) => {
    const v = r();
    if (v < 0.12) return { c: [0, 0, 0], h: 0, a: 0 };
    const base: RGB = v < 0.4 ? [52, 108, 40] : v < 0.85 ? [64, 126, 46] : [86, 150, 58];
    return { c: shade(base, 0.9 + r() * 0.15), h: v };
  },
  sand: (_x, _y, r) => {
    const v = r();
    const base: RGB = v < 0.3 ? [206, 190, 140] : v < 0.9 ? [220, 204, 152] : [190, 172, 124];
    return { c: shade(base, 0.96 + r() * 0.06), h: v * 0.5 };
  },
  crate: (x, y, r) => {
    const frame = x < 2 || y < 2 || x > 13 || y > 13;
    const brace = Math.abs(x - y) < 1.5;
    const p = PAINT.planks(x, y, r);
    if (frame || brace) return { c: shade([126, 90, 52], 0.9 + r() * 0.1), h: 1 };
    return { c: shade(p.c, 0.92), h: p.h * 0.6 };
  },
  metal: (x, y, r) => {
    const panel = x % 8 === 0 || y % 8 === 0;
    const rivet = (x % 8 === 2 || x % 8 === 6) && (y % 8 === 2 || y % 8 === 6);
    const base: RGB = [150, 158, 166];
    return { c: panel ? shade(base, 0.62) : rivet ? shade(base, 1.18) : shade(base, 0.92 + r() * 0.08), h: panel ? 0 : rivet ? 1 : 0.6 };
  },
  metalDark: (x, y, r) => {
    const p = PAINT.metal(x, y, r);
    return { c: shade(p.c, 0.45), h: p.h };
  },
  gold: (x, y, r) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    const shine = x + y < 8 && (x + y) % 3 === 0;
    const base: RGB = [255, 200, 61];
    return { c: edge ? shade(base, 0.7) : shine ? mix(base, [255, 250, 220], 0.6) : shade(base, 0.9 + r() * 0.1), h: edge ? 0.2 : 0.8 };
  },
  brick: (x, y, r) => {
    const row = Math.floor(y / 4), joint = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
    return { c: joint ? [176, 168, 150] : shade([150, 72, 52], 0.88 + r() * 0.16), h: joint ? 0 : 0.8 };
  },
  glow: () => ({ c: [255, 255, 255], h: 1 }),
  gravel: (x, y, r) => {
    const v = r(), pebble = ((x * 5 + y * 3) % 7 === 0) || ((x + y * 7) % 11 === 0);
    const base: RGB = pebble ? [150, 140, 132] : v < 0.4 ? [104, 98, 94] : v < 0.8 ? [124, 118, 112] : [88, 84, 80];
    return { c: shade(base, 0.94 + r() * 0.1), h: pebble ? 1 : v * 0.6 };
  },
  oreCoal: (x, y, r) => ore(x, y, r, [40, 40, 42], 3),
  oreIron: (x, y, r) => ore(x, y, r, [216, 168, 128], 5),
  oreGold: (x, y, r) => ore(x, y, r, [252, 222, 80], 7),
  oreDiamond: (x, y, r) => ore(x, y, r, [96, 232, 226], 9),
  bedrock: (_x, _y, r) => {
    const v = r();
    const base: RGB = v < 0.3 ? [40, 40, 42] : v < 0.7 ? [70, 70, 72] : [102, 102, 104];
    return { c: base, h: v };
  },
  tableTop: (x, y, r) => {
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    const grid = (x === 5 || x === 10 || y === 5 || y === 10) && !frame;
    const p = PAINT.planks(x, y, r);
    return frame ? { c: shade([126, 90, 52], 0.85), h: 1 } : grid ? { c: shade(p.c, 0.7), h: 0.2 } : p;
  },
  tableSide: (x, y, r) => {
    const p = PAINT.planks(x, y, r);
    // Herramientas colgadas: una sierra y un martillo dibujados en la tabla
    const saw = y >= 3 && y <= 6 && x >= 2 && x <= 7;
    const hammer = (x === 11 && y >= 3 && y <= 9) || (y === 3 && x >= 9 && x <= 13);
    if (y < 2) return { c: shade([126, 90, 52], 0.85), h: 1 };
    if (saw) return { c: y === 6 && x % 2 === 0 ? [90, 92, 96] : [168, 172, 176], h: 0.9 };
    if (hammer) return { c: x === 11 && y > 3 ? [92, 64, 36] : [120, 124, 128], h: 0.9 };
    return p;
  },
  torch: (x, y) => {
    // Palo con la llama arriba; el resto transparente
    if (x >= 7 && x <= 8 && y >= 6 && y <= 15) return { c: y <= 7 ? [255, 214, 90] : [120, 88, 50], h: 1 };
    if (x >= 6 && x <= 9 && y >= 4 && y <= 6) return { c: y === 4 ? [255, 250, 200] : [255, 170, 40], h: 1 };
    return { c: [0, 0, 0], h: 0, a: 0 };
  },
  furnace: (x, y, r) => {
    const p = PAINT.cobble(x, y, r);
    const mouth = x >= 4 && x <= 11 && y >= 8 && y <= 12;
    if (mouth) return { c: y >= 11 ? [255, 140, 40] : [24, 22, 22], h: 0 };
    return p;
  },
  furnaceTop: (x, y, r) => PAINT.stone(x, y, r),
  furnaceOn: (x, y, r) => {
    const mouth = x >= 4 && x <= 11 && y >= 8 && y <= 12;
    if (mouth) { const hot = (x * 7 + y * 3) % 5; return { c: y >= 10 ? [255, 190 + hot * 10, 60] : [255, 120 + hot * 15, 30], h: 0 }; }
    return PAINT.cobble(x, y, r);
  },
  chest: (x, y, r) => {
    const rim = x === 0 || x === 15 || y === 0 || y === 15 || y === 6;
    const latch = x >= 7 && x <= 8 && y >= 5 && y <= 8;
    if (latch) return { c: y === 7 ? [60, 60, 64] : [196, 196, 204], h: 1 };
    const p = PAINT.planks(x, y, r);
    return rim ? { c: shade([96, 66, 34], 0.9), h: 1 } : { c: shade(p.c, 0.9), h: p.h };
  },
  chestTop: (x, y, r) => {
    const rim = x === 0 || x === 15 || y === 0 || y === 15;
    const p = PAINT.planks(x, y, r);
    return rim ? { c: shade([96, 66, 34], 0.9), h: 1 } : { c: shade(p.c, 0.9), h: p.h };
  },
};
/** Mineral: piedra con manchas de color. */
function ore(x: number, y: number, r: () => number, color: RGB, k: number): Px {
  const spot = ((x * k + y * 3) % 13 < 3 && (x + y * k) % 5 < 3) || ((x * 3 + y * k) % 17 < 2);
  if (spot) return { c: shade(color, 0.85 + r() * 0.3), h: 1 };
  return PAINT.stone(x, y, r);
}

function paint(name: TexName, seed: number) {
  const r = rng(seed);
  const color = new Uint8ClampedArray(new ArrayBuffer(N * N * 4)), height = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const p = PAINT[name](x, y, r), i = y * N + x;
      color[i * 4] = clamp8(p.c[0]); color[i * 4 + 1] = clamp8(p.c[1]); color[i * 4 + 2] = clamp8(p.c[2]); color[i * 4 + 3] = (p.a ?? 1) * 255;
      height[i] = p.h;
    }
  return { color, height };
}

function canvasOf(data: Uint8ClampedArray<ArrayBuffer>) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  c.getContext('2d')!.putImageData(new ImageData(data, N, N), 0, 0);
  return c;
}

/** Mapa de relieve (normales) a partir de las alturas, con bordes que se repiten sin costura. */
function normalsOf(h: Float32Array, strength: number) {
  const out = new Uint8ClampedArray(new ArrayBuffer(N * N * 4));
  const H = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      out[i] = (dx / len * 0.5 + 0.5) * 255; out[i + 1] = (-dy / len * 0.5 + 0.5) * 255; out[i + 2] = (1 / len * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  return out;
}

function tex(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SEED: Record<TexName, number> = {
  grass: 11, grassSide: 12, dirt: 13, stone: 14, cobble: 15, planks: 16, log: 17, logTop: 18, leaves: 19,
  sand: 20, crate: 21, metal: 22, metalDark: 23, gold: 24, brick: 25, glow: 26,
  gravel: 27, oreCoal: 28, oreIron: 29, oreGold: 30, oreDiamond: 31, bedrock: 32, tableTop: 33, tableSide: 34, torch: 35, furnace: 36, furnaceTop: 37,
  furnaceOn: 38, chest: 39, chestTop: 40,
};
const RELIEF: Partial<Record<TexName, number>> = {
  oreCoal: 2, oreIron: 2, oreGold: 2, oreDiamond: 2, gravel: 1.6, bedrock: 1.4, furnace: 1.8, cobble: 2.2, brick: 2, planks: 1.6, crate: 1.8, metal: 1.6, metalDark: 1.6, stone: 1.4, log: 1.6 };

const cache = new Map<string, THREE.MeshStandardMaterial>();
let anisotropy = 1;
export function setAnisotropy(a: number) { anisotropy = a; }

/**
 * Material de bloque: textura pixelada + relieve. `repeat` repite la textura (suelo grande).
 * Se reutiliza el mismo material para todo lo que lo pide igual.
 */
export function blockMat(name: TexName, opts: { repeat?: number; tint?: number; emissive?: number; rough?: number; metal?: number } = {}) {
  const key = `${name}|${opts.repeat ?? 1}|${opts.tint ?? ''}|${opts.emissive ?? ''}`;
  let m = cache.get(key);
  if (m) return m;
  const { color, height } = paint(name, SEED[name]);
  const map = tex(canvasOf(color), true);
  const rep = opts.repeat ?? 1;
  map.repeat.set(rep, rep);
  map.anisotropy = anisotropy;
  const strength = RELIEF[name] ?? 1;
  const normalMap = tex(canvasOf(normalsOf(height, strength)), false);
  normalMap.repeat.set(rep, rep);
  m = new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: opts.rough ?? (name === 'metal' || name === 'metalDark' ? 0.45 : name === 'gold' ? 0.3 : 0.92),
    metalness: opts.metal ?? (name === 'metal' || name === 'metalDark' ? 0.55 : name === 'gold' ? 0.8 : 0),
    color: opts.tint ?? 0xffffff,
    transparent: false, alphaTest: name === 'leaves' ? 0.5 : 0,
    side: name === 'leaves' ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (opts.emissive !== undefined) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = 1.6; }
  cache.set(key, m);
  return m;
}

// ---------- Atlas: todas las texturas en una sola imagen (para el mundo de bloques) ----------

/** Lado de cada casilla del atlas: la textura de 16 px más un borde repetido para que no sangren los colores al alejarse. */
const PAD = 4, CELL = N + PAD * 2;
export interface Atlas { map: THREE.Texture; normal: THREE.Texture; uv: (name: TexName) => [number, number, number, number]; cols: number; icon: (name: TexName) => string }

/** Construye el atlas (color y relieve) con las texturas pedidas. */
export function buildAtlas(names: TexName[]): Atlas {
  const cols = Math.ceil(Math.sqrt(names.length)), size = cols * CELL;
  const color = document.createElement('canvas'), normal = document.createElement('canvas');
  color.width = color.height = normal.width = normal.height = size;
  const gc = color.getContext('2d')!, gn = normal.getContext('2d')!;
  const pos = new Map<TexName, number>();
  const icons = new Map<TexName, string>();
  names.forEach((name, i) => {
    pos.set(name, i);
    const { color: c, height } = paint(name, SEED[name]);
    const n = normalsOf(height, RELIEF[name] ?? 1);
    const cx = (i % cols) * CELL, cy = Math.floor(i / cols) * CELL;
    for (const [g, data] of [[gc, c], [gn, n]] as const) {
      const tile = canvasOf(data as Uint8ClampedArray<ArrayBuffer>);
      // Borde: la propia textura repetida alrededor, recortada a su casilla
      g.save(); g.beginPath(); g.rect(cx, cy, CELL, CELL); g.clip();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.drawImage(tile, cx + PAD + dx * N, cy + PAD + dy * N);
      g.restore();
    }
    const ic = document.createElement('canvas'); ic.width = ic.height = N;
    ic.getContext('2d')!.drawImage(canvasOf(c), 0, 0);
    icons.set(name, ic.toDataURL());
  });
  const mk = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = anisotropy; t.flipY = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return {
    map: mk(color, true), normal: mk(normal, false), cols,
    uv: (name) => { const i = pos.get(name) ?? 0, u0 = ((i % cols) * CELL + PAD) / size, v0 = (Math.floor(i / cols) * CELL + PAD) / size; return [u0, v0, u0 + N / size, v0 + N / size]; },
    icon: (name) => icons.get(name) ?? '',
  };
}
