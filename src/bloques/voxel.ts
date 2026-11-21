// Motor de vóxeles de Bloques: tipos de bloque, generación del mundo por semilla (relieve, cuevas, minerales,
// árboles), rayo para apuntar a un bloque y física de cuerpos (gravedad, salto y choque con los bloques).
// Lógica pura, sin Three.js ni DOM: la usan el navegador (un jugador) y el servidor (mundos compartidos).

// ---------- Bloques ----------

export const B = {
  Aire: 0, Hierba: 1, Tierra: 2, Piedra: 3, Adoquin: 4, Tronco: 5, Hojas: 6, Tablas: 7, Arena: 8, Grava: 9,
  Carbon: 10, Hierro: 11, Oro: 12, Diamante: 13, RocaBase: 14, Mesa: 15, Antorcha: 16, Horno: 17, Cofre: 18, HornoEncendido: 19,
  Esmeralda: 20, Nieve: 21, PiedraNevada: 22, HierbaAlta: 23, FlorSol: 24, FlorFuego: 25, ArbustoBayas: 26,
} as const;
export type Tex =
  | 'grass' | 'grassSide' | 'dirt' | 'stone' | 'cobble' | 'planks' | 'log' | 'logTop' | 'leaves' | 'sand' | 'gravel'
  | 'oreCoal' | 'oreIron' | 'oreGold' | 'oreDiamond' | 'bedrock' | 'tableTop' | 'tableSide' | 'torch' | 'furnace' | 'furnaceTop'
  | 'furnaceOn' | 'chest' | 'chestTop' | 'oreEmerald' | 'snow' | 'snowSide' | 'tallGrass' | 'flowerSun' | 'flowerFire' | 'berryBush';
/** Herramienta que va mejor para cada bloque. */
export type ToolKind = 'pico' | 'hacha' | 'pala' | null;

export interface BlockDef {
  name: string;
  /** Dureza: a mano se tarda dureza x 1,5 s (x 5 si hace falta un pico que no llevas). Tierra 0,5 (0,75 s); piedra 1,5. */
  hardness: number;
  tool: ToolKind;
  /** Nivel mínimo de pico para que suelte algo (0 = cualquiera, 1 = madera, 2 = piedra, 3 = hierro). */
  needs: number;
  /** Objeto que suelta al romperse (si no se indica, el propio bloque). */
  drop?: number | null;
  /** Texturas: [arriba, lados, abajo]. */
  tex: [Tex, Tex, Tex];
  solid: boolean;
  /** Deja pasar la vista (no tapa las caras de al lado). */
  see: boolean;
  /** Luz que da (antorcha). */
  light?: number;
  /** Planta: se dibuja como dos planos cruzados, se atraviesa, se rompe al instante y solo vive sobre hierba o tierra. */
  plant?: boolean;
}
const D = (name: string, hardness: number, tool: ToolKind, tex: Tex | [Tex, Tex, Tex], o: Partial<BlockDef> = {}): BlockDef =>
  ({ name, hardness, tool, needs: 0, tex: typeof tex === 'string' ? [tex, tex, tex] : tex, solid: true, see: false, ...o });

export const BLOCKS: BlockDef[] = [
  D('Aire', 0, null, 'stone', { solid: false, see: true }),
  D('Hierba', 0.6, 'pala', ['grass', 'grassSide', 'dirt'], { drop: B.Tierra }),
  D('Tierra', 0.5, 'pala', 'dirt'),
  D('Piedra', 1.5, 'pico', 'stone', { needs: 1, drop: B.Adoquin }),
  D('Adoquín', 2, 'pico', 'cobble', { needs: 1 }),
  D('Tronco', 2, 'hacha', ['logTop', 'log', 'logTop']),
  D('Hojas', 0.2, null, 'leaves', { see: true, drop: null }),
  D('Tablas', 2, 'hacha', 'planks'),
  D('Arena', 0.5, 'pala', 'sand'),
  D('Grava', 0.6, 'pala', 'gravel'),
  D('Mineral de carbón', 3, 'pico', 'oreCoal', { needs: 1, drop: 101 }), // suelta carbón
  D('Mineral de hierro', 3, 'pico', 'oreIron', { needs: 2 }),
  D('Mineral de oro', 3, 'pico', 'oreGold', { needs: 3 }),
  D('Mineral de diamante', 3, 'pico', 'oreDiamond', { needs: 3, drop: 104 }), // suelta un diamante
  D('Roca base', Infinity, null, 'bedrock'),
  D('Mesa de crafteo', 2.5, 'hacha', ['tableTop', 'tableSide', 'planks']),
  D('Antorcha', 0, null, 'torch', { solid: false, see: true, light: 1 }),
  D('Horno', 3.5, 'pico', ['furnaceTop', 'furnace', 'furnaceTop'], { needs: 1 }),
  D('Cofre', 2.5, 'hacha', ['chestTop', 'chest', 'chestTop']),
  D('Horno encendido', 3.5, 'pico', ['furnaceTop', 'furnaceOn', 'furnaceTop'], { needs: 1, drop: 17, light: 0.8 }),
  D('Mineral de esmeralda', 3, 'pico', 'oreEmerald', { needs: 3, drop: 108 }), // suelta una esmeralda
  D('Nieve', 0.2, 'pala', 'snow'),
  D('Piedra nevada', 1.5, 'pico', ['snow', 'snowSide', 'stone'], { needs: 1, drop: B.Adoquin }),
  D('Hierba alta', 0, null, 'tallGrass', { solid: false, see: true, plant: true, drop: null }),
  D('Flor de sol', 0, null, 'flowerSun', { solid: false, see: true, plant: true }),
  D('Flor de fuego', 0, null, 'flowerFire', { solid: false, see: true, plant: true }),
  D('Arbusto de bayas', 0, null, 'berryBush', { solid: false, see: true, plant: true, drop: 109 }), // suelta bayas
];
/** Bloques que se usan (se abren) en vez de colocar algo encima. */
export const USABLE = new Set<number>([B.Mesa, B.Horno, B.HornoEncendido, B.Cofre]);
export const lightOf = (b: number) => BLOCKS[b]?.light ?? 0;
export const isSolid = (b: number) => BLOCKS[b]?.solid ?? false;
export const isSee = (b: number) => BLOCKS[b]?.see ?? true;
export const isPlant = (b: number) => BLOCKS[b]?.plant ?? false;
/** Hueco libre: aire o una planta (las plantas se atraviesan y se pueden sustituir por otro bloque). */
export const isFree = (b: number) => b === B.Aire || isPlant(b);
/** Suelo donde vive una planta. */
export const growsOn = (b: number) => b === B.Hierba || b === B.Tierra;

// ---------- Ruido determinista ----------

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Ruido suave en 2D (de 0 a 1). */
export function noise2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), tx = fade(x - xi), tz = fade(z - zi);
  const a = hash3(xi, 0, zi, seed), b = hash3(xi + 1, 0, zi, seed), c = hash3(xi, 0, zi + 1, seed), d = hash3(xi + 1, 0, zi + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
/** Ruido suave en 3D (de 0 a 1). */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), tx = fade(x - xi), ty = fade(y - yi), tz = fade(z - zi);
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k, seed);
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), tx), lerp(h(0, 1, 0), h(1, 1, 0), tx), ty),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), tx), lerp(h(0, 1, 1), h(1, 1, 1), tx), ty), tz);
}

// ---------- Mundo ----------

/** El mundo no tiene bordes: se genera por trozos de 16 x 16 columnas a medida que alguien se acerca. */
export const CHUNK = 16;
/** Alto del mundo (de la roca base al cielo). */
export const H = 112;
/** Hasta dónde se puede ir (muy lejos: a efectos de juego, sin límite). */
export const LIMIT = 30000;
const CH_SIZE = CHUNK * CHUNK * H;

/** Número único de una casilla del mundo (sirve de clave para guardar cambios). */
export const key = (x: number, y: number, z: number) => ((x + 32768) * 65536 + (z + 32768)) * 128 + y;
export function unkey(k: number): [number, number, number] {
  const y = k % 128, r = (k - y) / 128, z = (r % 65536) - 32768, x = Math.floor(r / 65536) - 32768;
  return [x, y, z];
}
const chunkKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

/** Clima de la zona: llanura, bosque, desierto o montaña. */
export type Biome = 'llanura' | 'bosque' | 'desierto' | 'montana';
export function biomeAt(x: number, z: number, seed: number): Biome {
  const mount = noise2(x / 160, z / 160, seed + 3);
  if (mount > 0.62) return 'montana';
  const temp = noise2(x / 260, z / 260, seed + 9), wet = noise2(x / 140, z / 140, seed + 11);
  if (temp > 0.66) return 'desierto';
  return wet > 0.52 ? 'bosque' : 'llanura';
}

/** Altura del suelo en la columna (x, z): colinas suaves, valles y montañas altas. */
export function surfaceHeight(x: number, z: number, seed: number): number {
  const n = noise2(x / 90, z / 90, seed) * 0.55 + noise2(x / 35, z / 35, seed + 7) * 0.3 + noise2(x / 12, z / 12, seed + 13) * 0.15;
  const mount = noise2(x / 160, z / 160, seed + 3);
  // Cimas escarpadas: un ruido de crestas hace picos y quebradas en vez de mesetas
  const ridge = 1 - Math.abs(noise2(x / 28, z / 28, seed + 17) * 2 - 1);
  const peaks = mount > 0.5 ? Math.pow((mount - 0.5) * 2, 1.5) * 46 * (0.45 + ridge * 0.75) : 0;
  const valleys = noise2(x / 200, z / 200, seed + 5) * 10;
  return Math.max(8, Math.min(H - 6, Math.round(50 + n * 22 + valleys - 6 + peaks)));
}

/** Genera un trozo del mundo: siempre igual para la misma semilla, en el servidor y en todos los dispositivos. */
export function generateChunk(seed: number, cx: number, cz: number): Uint8Array {
  const c = new Uint8Array(CH_SIZE);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const idx = (lx: number, y: number, lz: number) => (y * CHUNK + lz) * CHUNK + lx;
  const heights = new Int16Array(CHUNK * CHUNK);
  const biomes: Biome[] = [];
  for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
    const x = x0 + lx, z = z0 + lz, h = surfaceHeight(x, z, seed), bio = biomeAt(x, z, seed);
    heights[lx * CHUNK + lz] = h; biomes[lx * CHUNK + lz] = bio;
    const snowy = bio === 'montana' && h > 88 + Math.floor(hash3(x, 1, z, seed) * 3);
    for (let y = 0; y <= h; y++) {
      let b: number;
      if (y === 0 || (y <= 2 && hash3(x, y, z, seed) < 0.5)) b = B.RocaBase;
      else if (y === h) b = bio === 'desierto' ? B.Arena : snowy ? B.PiedraNevada : bio === 'montana' && h > 70 ? B.Piedra : B.Hierba;
      else if (y > h - 4) b = bio === 'desierto' ? B.Arena : bio === 'montana' && h > 70 ? B.Piedra : B.Tierra;
      else b = B.Piedra;
      c[idx(lx, y, lz)] = b;
    }
  }
  // Cuevas: túneles largos que serpentean, salas grandes en lo profundo y alguna entrada en la superficie.
  for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
    const x = x0 + lx, z = z0 + lz, h = heights[lx * CHUNK + lz];
    for (let y = 3; y < h; y++) {
      const depth = h - y;
      const a = noise3(x / 22, y / 13, z / 22, seed + 31), b2 = noise3(x / 22, y / 13, z / 22, seed + 47);
      const width = 0.05 + (y < 40 ? 0.025 : 0);
      const tunnel = Math.abs(a - 0.5) < width && Math.abs(b2 - 0.5) < width * 1.3;
      const room = y < 45 && noise3(x / 16, y / 9, z / 16, seed + 59) > 0.74 - (45 - y) * 0.002;
      // Cerca de la superficie solo quedan los túneles (son las entradas); las salas se quedan bajo tierra
      if (tunnel ? depth > 1 || noise2(x / 9, z / 9, seed + 61) > 0.6 : room && depth > 6) c[idx(lx, y, lz)] = B.Aire;
    }
  }
  // Minerales en vetas, por profundidad: carbón arriba, hierro y oro más abajo, diamante y esmeralda en lo más hondo.
  const ORES: [number, number, number, number][] = [ // bloque, altura máxima, probabilidad de veta, tamaño
    [B.Carbon, 100, 0.0045, 7], [B.Hierro, 64, 0.0035, 5], [B.Oro, 32, 0.0016, 4], [B.Diamante, 16, 0.0012, 4], [B.Esmeralda, 22, 0.0006, 2], [B.Grava, 70, 0.0015, 9],
  ];
  for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) for (let y = 3; y < H; y++) {
    if (c[idx(lx, y, lz)] !== B.Piedra) continue;
    const x = x0 + lx, z = z0 + lz;
    for (let k = 0; k < ORES.length; k++) {
      const [ore, maxY, p, size] = ORES[k];
      if (y > maxY || hash3(x, y, z, seed + 100 + k) >= p) continue;
      for (let i = 0; i < size; i++) {
        const ox = lx + Math.floor(hash3(x, y, i, seed + 200 + k) * 3) - 1, oy = y + Math.floor(hash3(y, i, z, seed + 300 + k) * 3) - 1, oz = lz + Math.floor(hash3(i, x, z, seed + 400 + k) * 3) - 1;
        if (ox >= 0 && oz >= 0 && ox < CHUNK && oz < CHUNK && oy > 0 && c[idx(ox, oy, oz)] === B.Piedra) c[idx(ox, oy, oz)] = ore;
      }
      break;
    }
  }
  // Árboles (también los que nacen en el trozo de al lado y meten hojas en este)
  for (let x = x0 - 3; x < x0 + CHUNK + 3; x++) for (let z = z0 - 3; z < z0 + CHUNK + 3; z++) {
    const bio = biomeAt(x, z, seed);
    const density = bio === 'bosque' ? 0.018 : bio === 'llanura' ? 0.003 : 0;
    if (!density || hash3(x, 7, z, seed + 500) > density) continue;
    const y = surfaceHeight(x, z, seed);
    if (y > 74) continue;
    const trunk = 4 + Math.floor(hash3(x, 9, z, seed) * 3);
    const put = (px: number, py: number, pz: number, b: number, onlyAir: boolean) => {
      const lx = px - x0, lz = pz - z0;
      if (lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK || py < 0 || py >= H) return;
      if (!onlyAir || c[idx(lx, py, lz)] === B.Aire) c[idx(lx, py, lz)] = b;
    };
    // El tronco solo si el suelo sigue ahí (no lo ha comido una cueva)
    const lx0 = x - x0, lz0 = z - z0;
    if (lx0 >= 0 && lz0 >= 0 && lx0 < CHUNK && lz0 < CHUNK && c[idx(lx0, y, lz0)] !== B.Hierba) continue;
    put(x, y, z, B.Tierra, false);
    for (let i = 1; i <= trunk; i++) put(x, y + i, z, B.Tronco, false);
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || hash3(x + dx, top + dy, z + dz, seed) < 0.5)) continue;
        put(x + dx, top + dy, z + dz, B.Hojas, true);
      }
    }
  }
  // Plantas sobre la hierba: hierba alta suelta, flores en corros y algún arbusto de bayas en el bosque.
  for (let lx = 0; lx < CHUNK; lx++) for (let lz = 0; lz < CHUNK; lz++) {
    const h = heights[lx * CHUNK + lz], bio = biomes[lx * CHUNK + lz];
    if (h + 1 >= H || c[idx(lx, h, lz)] !== B.Hierba || c[idx(lx, h + 1, lz)] !== B.Aire) continue;
    const x = x0 + lx, z = z0 + lz, r = hash3(x, 11, z, seed + 600);
    const meadow = noise2(x / 13, z / 13, seed + 71);
    let plant: number = B.Aire;
    if (meadow > 0.7 && r < 0.3) plant = noise2(x / 40, z / 40, seed + 73) > 0.5 ? B.FlorSol : B.FlorFuego;
    else if (bio === 'bosque' && r > 0.992) plant = B.ArbustoBayas;
    else if (r < (bio === 'bosque' ? 0.07 : 0.13)) plant = B.HierbaAlta;
    if (plant !== B.Aire) c[idx(lx, h + 1, lz)] = plant;
  }
  return c;
}

export class World {
  readonly seed: number;
  /** Trozos generados (se pueden descargar: se regeneran igual y se les vuelven a poner los cambios). */
  readonly chunks = new Map<number, Uint8Array>();
  /** Cambios hechos por los jugadores (clave de casilla -> bloque). */
  readonly edits = new Map<number, number>();
  private editsByChunk = new Map<number, number[]>();
  private gen: (seed: number, cx: number, cz: number) => Uint8Array;
  constructor(seed: number, gen: (seed: number, cx: number, cz: number) => Uint8Array = generateChunk) { this.seed = seed; this.gen = gen; }
  /** Mundo vacío (todo aire) para pruebas. */
  static empty(seed = 1) { return new World(seed, () => new Uint8Array(CH_SIZE)); }
  private chunk(cx: number, cz: number): Uint8Array {
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = this.gen(this.seed, cx, cz);
      for (const e of this.editsByChunk.get(k) ?? []) { const [x, y, z] = unkey(e); c[((y * CHUNK) + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)] = this.edits.get(e)!; }
      this.chunks.set(k, c);
    }
    return c;
  }
  hasChunk(cx: number, cz: number) { return this.chunks.has(chunkKey(cx, cz)); }
  /** Datos crudos de un trozo (lo genera si hace falta): para leer muchos bloques deprisa. Índice: (y * 16 + z local) * 16 + x local. */
  chunkData(cx: number, cz: number) { return this.chunk(cx, cz); }
  get(x: number, y: number, z: number): number {
    if (y < 0) return B.RocaBase;
    if (y >= H) return B.Aire;
    if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return B.RocaBase; // muy, muy lejos
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    return this.chunk(cx, cz)[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)];
  }
  /** Cambia un bloque. `record` = false para cambios de prueba que se deshacen enseguida. */
  set(x: number, y: number, z: number, b: number, record = true) {
    if (y < 0 || y >= H || Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.chunk(cx, cz)[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)] = b;
    if (!record) return;
    const k = key(x, y, z), ck = chunkKey(cx, cz);
    if (!this.edits.has(k)) { let list = this.editsByChunk.get(ck); if (!list) this.editsByChunk.set(ck, (list = [])); list.push(k); }
    this.edits.set(k, b);
  }
  /** Aplica cambios recibidos (clave, bloque, clave, bloque...). */
  applyEdits(flat: number[]) { for (let i = 0; i < flat.length; i += 2) { const [x, y, z] = unkey(flat[i]); this.set(x, y, z, flat[i + 1]); } }
  /** Olvida los trozos lejanos (ahorra memoria; los cambios se conservan). */
  unloadFar(x: number, z: number, radiusChunks: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (const k of this.chunks.keys()) {
      const kx = Math.floor(k / 8192) - 4096, kz = (k % 8192) - 4096;
      if (Math.abs(kx - cx) > radiusChunks || Math.abs(kz - cz) > radiusChunks) this.chunks.delete(k);
    }
  }
  /** Olvida los trozos que están lejos de todos esos puntos (servidor con varios jugadores). */
  unloadAwayFrom(points: [number, number][], radiusChunks: number) {
    const centers = points.map(([x, z]) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)]);
    for (const k of this.chunks.keys()) {
      const kx = Math.floor(k / 8192) - 4096, kz = (k % 8192) - 4096;
      if (!centers.some(([cx, cz]) => Math.abs(kx - cx) <= radiusChunks && Math.abs(kz - cz) <= radiusChunks)) this.chunks.delete(k);
    }
  }
  /** Altura del bloque sólido más alto de la columna (o -1). */
  top(x: number, z: number): number {
    for (let y = H - 1; y >= 0; y--) if (isSolid(this.get(x, y, z))) return y;
    return -1;
  }
}

/** Crea el mundo de una semilla (los trozos se generan cuando hacen falta). */
export function generate(seed: number): World { return new World(seed); }

/** Punto de aparición: cerca del centro, sobre hierba (no en el desierto ni en lo alto de una montaña). */
export function spawnPoint(w: World): [number, number, number] {
  for (let r = 0; r < 400; r += 8) for (let a = 0; a < 8; a++) {
    const x = Math.round(Math.cos(a * Math.PI / 4) * r), z = Math.round(Math.sin(a * Math.PI / 4) * r);
    const t = w.top(x, z);
    if (w.get(x, t, z) === B.Hierba && t < 75) return [x + 0.5, t + 1.01, z + 0.5];
    if (r === 0) break;
  }
  return [0.5, w.top(0, 0) + 1.01, 0.5];
}

// ---------- Apuntar a un bloque ----------

export interface Hit { x: number; y: number; z: number; /** Bloque vacío delante de la cara tocada (donde se colocaría uno nuevo). */ px: number; py: number; pz: number; dist: number }

/** Recorre los bloques que cruza un rayo (algoritmo DDA) y devuelve el primero sólido o visible a menos de `max`. */
export function raycast(w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, skipPlants = false): Hit | null {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tx = dx > 0 ? (x + 1 - ox) * tdx : (ox - x) * tdx;
  let ty = dy > 0 ? (y + 1 - oy) * tdy : (oy - y) * tdy;
  let tz = dz > 0 ? (z + 1 - oz) * tdz : (oz - z) * tdz;
  let px = x, py = y, pz = z, t = 0;
  while (t <= max) {
    const b = w.get(x, y, z);
    if (b !== B.Aire && !(skipPlants && isPlant(b))) return isPlant(b) ? { x, y, z, px: x, py: y, pz: z, dist: t } : { x, y, z, px, py, pz, dist: t }; // sobre una planta se coloca en su sitio
    px = x; py = y; pz = z;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
  }
  return null;
}

// ---------- Física ----------

export interface Body { x: number; y: number; z: number; vx: number; vy: number; vz: number; onGround: boolean; /** Altura desde la que empezó a caer (para el daño por caída). */ fallFrom: number }
export const GRAVITY = 28;
export const JUMP_SPEED = 8.6;

/** Choca la caja del cuerpo (ancho w, alto h, pies en y) contra los bloques sólidos. */
function blocked(wd: World, x: number, y: number, z: number, hw: number, h: number): boolean {
  for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 1e-6); bx++)
    for (let by = Math.floor(y); by <= Math.floor(y + h - 1e-6); by++)
      for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 1e-6); bz++)
        if (isSolid(wd.get(bx, by, bz))) return true;
  return false;
}
export const bodyBlocked = blocked;

/**
 * Mueve un cuerpo: `wishX/wishZ` es la velocidad horizontal deseada (bloques/s), `jump` salta si está en el suelo.
 * Cada eje se resuelve por separado para deslizar por las paredes. Devuelve los bloques de caída al aterrizar.
 */
export function moveBody(wd: World, b: Body, wishX: number, wishZ: number, jump: boolean, dt: number, hw = 0.3, h = 1.8, jumpSpeed = JUMP_SPEED): number {
  // Aceleración horizontal rápida en el suelo, más lenta en el aire
  const k = Math.min(1, dt * (b.onGround ? 20 : 6));
  b.vx += (wishX - b.vx) * k; b.vz += (wishZ - b.vz) * k;
  if (jump && b.onGround) { b.vy = jumpSpeed; b.onGround = false; }
  b.vy = Math.max(-40, b.vy - GRAVITY * dt);
  let landed = 0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy), Math.abs(b.vz)) * dt / 0.25));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = b.x + b.vx * sdt;
    if (!blocked(wd, nx, b.y, b.z, hw, h)) b.x = nx; else b.vx = 0;
    const nz = b.z + b.vz * sdt;
    if (!blocked(wd, b.x, b.y, nz, hw, h)) b.z = nz; else b.vz = 0;
    const ny = b.y + b.vy * sdt;
    if (!blocked(wd, b.x, ny, b.z, hw, h)) {
      if (b.onGround && b.vy <= 0) b.fallFrom = b.y;
      b.y = ny; b.onGround = false;
      if (b.vy > 0) b.fallFrom = b.y;
    } else {
      if (b.vy < 0) {
        b.y = Math.floor(ny) + 1; // apoyado justo encima del bloque
        if (!b.onGround) { landed = Math.max(0, b.fallFrom - b.y); b.fallFrom = b.y; }
        b.onGround = true;
      }
      b.vy = 0;
    }
  }
  if (b.onGround) b.fallFrom = b.y;
  if (b.y < -20) { b.y = H; b.vy = 0; } // por si acaso: nunca se cae del mundo para siempre
  return landed;
}
