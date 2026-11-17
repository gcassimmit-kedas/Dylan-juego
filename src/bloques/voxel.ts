// Motor de vóxeles de Bloques: tipos de bloque, generación del mundo por semilla (relieve, cuevas, minerales,
// árboles), rayo para apuntar a un bloque y física de cuerpos (gravedad, salto y choque con los bloques).
// Lógica pura, sin Three.js ni DOM: la usan el navegador (un jugador) y el servidor (mundos compartidos).

// ---------- Bloques ----------

export const B = {
  Aire: 0, Hierba: 1, Tierra: 2, Piedra: 3, Adoquin: 4, Tronco: 5, Hojas: 6, Tablas: 7, Arena: 8, Grava: 9,
  Carbon: 10, Hierro: 11, Oro: 12, Diamante: 13, RocaBase: 14, Mesa: 15, Antorcha: 16, Horno: 17,
} as const;
export type Tex =
  | 'grass' | 'grassSide' | 'dirt' | 'stone' | 'cobble' | 'planks' | 'log' | 'logTop' | 'leaves' | 'sand' | 'gravel'
  | 'oreCoal' | 'oreIron' | 'oreGold' | 'oreDiamond' | 'bedrock' | 'tableTop' | 'tableSide' | 'torch' | 'furnace' | 'furnaceTop';
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
];
export const isSolid = (b: number) => BLOCKS[b]?.solid ?? false;
export const isSee = (b: number) => BLOCKS[b]?.see ?? true;

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

/** Tamaño del mundo en bloques: ancho y largo (x, z) y alto (y). */
export const W = 96, H = 64;
export const SEA = 30;

/** Altura del suelo en la columna (x, z) para una semilla. También vale fuera del mundo (paisaje del fondo). */
export function surfaceHeight(x: number, z: number, seed: number): number {
  const n = noise2(x / 48, z / 48, seed) * 0.6 + noise2(x / 18, z / 18, seed + 7) * 0.3 + noise2(x / 7, z / 7, seed + 13) * 0.1;
  const hills = Math.pow(noise2(x / 70, z / 70, seed + 21), 2) * 14;
  return Math.round(24 + n * 14 + hills);
}

export class World {
  readonly blocks = new Uint8Array(W * H * W);
  readonly seed: number;
  constructor(seed: number) { this.seed = seed; }
  static index(x: number, y: number, z: number) { return (y * W + z) * W + x; }
  inside(x: number, y: number, z: number) { return x >= 0 && z >= 0 && y >= 0 && x < W && z < W && y < H; }
  get(x: number, y: number, z: number): number {
    if (y < 0) return B.RocaBase;
    if (!this.inside(x, y, z)) return B.Aire;
    return this.blocks[World.index(x, y, z)];
  }
  set(x: number, y: number, z: number, b: number) {
    if (this.inside(x, y, z)) this.blocks[World.index(x, y, z)] = b;
  }
  /** Altura del bloque sólido más alto de la columna (o -1). */
  top(x: number, z: number): number {
    for (let y = H - 1; y >= 0; y--) if (isSolid(this.get(x, y, z))) return y;
    return -1;
  }
}

/** Genera el mundo entero a partir de su semilla: siempre igual en el servidor y en todos los dispositivos. */
export function generate(seed: number): World {
  const w = new World(seed);
  const heights: number[] = [];
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
    const h = surfaceHeight(x, z, seed);
    heights[x * W + z] = h;
    const beach = h <= SEA - 2;
    for (let y = 0; y <= h; y++) {
      let b: number;
      if (y === 0 || (y === 1 && hash3(x, y, z, seed) < 0.5)) b = B.RocaBase;
      else if (y === h) b = beach ? B.Arena : B.Hierba;
      else if (y > h - 4) b = beach ? B.Arena : B.Tierra;
      else b = B.Piedra;
      w.set(x, y, z, b);
    }
  }
  // Cuevas: túneles largos (donde dos ruidos se cruzan cerca de 0,5) y algunas salas grandes en lo profundo
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
    const h = heights[x * W + z];
    for (let y = 2; y < h; y++) {
      const a = noise3(x / 16, y / 11, z / 16, seed + 31), c = noise3(x / 16, y / 11, z / 16, seed + 47);
      const tunnel = Math.abs(a - 0.5) < 0.045 && Math.abs(c - 0.5) < 0.06;
      const room = y < 22 && noise3(x / 11, y / 7, z / 11, seed + 59) > 0.78;
      if ((tunnel || room) && !(y > h - 3 && !tunnel)) w.set(x, y, z, B.Aire);
    }
  }
  // Minerales en la piedra, en vetas pequeñas: más raros y más profundos cuanto más valiosos
  const ORES: [number, number, number, number][] = [ // bloque, altura máxima, probabilidad de veta, tamaño
    [B.Carbon, 60, 0.005, 6], [B.Hierro, 40, 0.0035, 4], [B.Oro, 22, 0.0018, 4], [B.Diamante, 13, 0.001, 3], [B.Grava, 50, 0.002, 8],
  ];
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < W - 1; z++) for (let y = 2; y < H; y++) {
    if (w.get(x, y, z) !== B.Piedra) continue;
    for (let k = 0; k < ORES.length; k++) {
      const [ore, maxY, p, size] = ORES[k];
      if (y > maxY || hash3(x, y, z, seed + 100 + k) >= p) continue;
      for (let i = 0; i < size; i++) {
        const ox = x + Math.floor(hash3(x, y, i, seed + 200 + k) * 3) - 1, oy = y + Math.floor(hash3(y, i, z, seed + 300 + k) * 3) - 1, oz = z + Math.floor(hash3(i, x, z, seed + 400 + k) * 3) - 1;
        if (w.get(ox, oy, oz) === B.Piedra) w.set(ox, oy, oz, ore);
      }
      break;
    }
  }
  // Árboles sobre la hierba
  for (let x = 3; x < W - 3; x++) for (let z = 3; z < W - 3; z++) {
    if (hash3(x, 7, z, seed + 500) > 0.007) continue;
    const y = heights[x * W + z];
    if (w.get(x, y, z) !== B.Hierba) continue;
    const trunk = 4 + Math.floor(hash3(x, 9, z, seed) * 2);
    w.set(x, y, z, B.Tierra);
    for (let i = 1; i <= trunk; i++) w.set(x, y + i, z, B.Tronco);
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === 1 || hash3(x + dx, top + dy, z + dz, seed) < 0.5)) continue;
        if (w.get(x + dx, top + dy, z + dz) === B.Aire) w.set(x + dx, top + dy, z + dz, B.Hojas);
      }
    }
  }
  return w;
}

/** Punto de aparición: el centro del mundo, encima del suelo. */
export function spawnPoint(w: World): [number, number, number] {
  const x = W / 2, z = W / 2;
  return [x + 0.5, w.top(x, z) + 1.01, z + 0.5];
}

// ---------- Apuntar a un bloque ----------

export interface Hit { x: number; y: number; z: number; /** Bloque vacío delante de la cara tocada (donde se colocaría uno nuevo). */ px: number; py: number; pz: number; dist: number }

/** Recorre los bloques que cruza un rayo (algoritmo DDA) y devuelve el primero sólido o visible a menos de `max`. */
export function raycast(w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): Hit | null {
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
    if (b !== B.Aire) return { x, y, z, px, py, pz, dist: t };
    px = x; py = y; pz = z;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; } else if (ty < tz) { y += sy; t = ty; ty += tdy; } else { z += sz; t = tz; tz += tdz; }
  }
  return null;
}

// ---------- Física ----------

export interface Body { x: number; y: number; z: number; vx: number; vy: number; vz: number; onGround: boolean; /** Altura desde la que empezó a caer (para el daño por caída). */ fallFrom: number }
export const GRAVITY = 28;
export const JUMP_SPEED = 8.6;

/** Choca la caja del cuerpo (ancho w, alto h, pies en y) contra los bloques sólidos y los bordes del mundo. */
function blocked(wd: World, x: number, y: number, z: number, hw: number, h: number): boolean {
  if (x - hw < 0 || z - hw < 0 || x + hw > W || z + hw > W) return true;
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
export function moveBody(wd: World, b: Body, wishX: number, wishZ: number, jump: boolean, dt: number, hw = 0.3, h = 1.8): number {
  // Aceleración horizontal rápida en el suelo, más lenta en el aire
  const k = Math.min(1, dt * (b.onGround ? 20 : 6));
  b.vx += (wishX - b.vx) * k; b.vz += (wishZ - b.vz) * k;
  if (jump && b.onGround) { b.vy = JUMP_SPEED; b.onGround = false; }
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
