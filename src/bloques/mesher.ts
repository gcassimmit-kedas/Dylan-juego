// Convierte un trozo del mundo (16 x 16 columnas) en mallas: solo las caras que se ven, con sombra en las
// esquinas (oclusión ambiental) y luz: a cielo abierto, a oscuras bajo tierra, o iluminado por antorchas.
// Lógica pura: devuelve listas de números que el cliente convierte en geometría.
import { World, B, BLOCKS, H, isSee, lightOf, CHUNK, type Tex } from './voxel.ts';

export { CHUNK };
export type UV = (t: Tex) => [number, number, number, number];
/** col: luz de cada vértice (sombra de esquina x luz); glow: la parte que viene de antorchas (brilla también de noche). */
export interface MeshData { pos: number[]; nrm: number[]; uv: number[]; col: number[]; glow: number[]; idx: number[] }
const empty = (): MeshData => ({ pos: [], nrm: [], uv: [], col: [], glow: [], idx: [] });

/** Las 6 caras: normal, 4 esquinas (desde el bloque) y qué textura usa (0 arriba, 1 lado, 2 abajo). */
const FACES: { n: [number, number, number]; c: [number, number, number][]; t: 0 | 1 | 2; ao: number[][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t: 1, ao: [] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t: 1, ao: [] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t: 0, ao: [] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t: 2, ao: [] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t: 1, ao: [] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t: 1, ao: [] },
];
const AO = [0.5, 0.68, 0.84, 1];
const AO_TMP = [0, 0, 0, 0];
// Para cada esquina de cada cara: los dos vecinos que pueden hacerle sombra (x, y, z del primero y del segundo)
for (const f of FACES) (f as { ao?: number[][] }).ao = f.c.map(([ox, oy, oz]) => {
  const sx = ox * 2 - 1, sy = oy * 2 - 1, sz = oz * 2 - 1;
  return f.n[0] !== 0 ? [0, sy, 0, 0, 0, sz] : f.n[1] !== 0 ? [sx, 0, 0, 0, 0, sz] : [sx, 0, 0, 0, sy, 0];
});
export const DARK = 0.16;
/** Luz de cada tipo de bloque (tabla para leerla deprisa). */
const LIGHT = BLOCKS.map((b) => b.light ?? 0);

/** Luz de las antorchas en un punto (0 a 1): baja con la distancia y no atraviesa la piedra en esta versión simple. */
function torchLight(torches: [number, number, number, number][], x: number, y: number, z: number) {
  let l = 0;
  for (const [tx, ty, tz, k] of torches) {
    const d = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tz - z);
    if (d < 9) l = Math.max(l, (1 - d / 9) * k);
  }
  return l;
}

export function meshChunk(w: World, cx: number, cz: number, uvOf: UV): { solid: MeshData; see: MeshData } {
  const solid = empty(), see = empty();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  // Los 3 x 3 trozos de alrededor, leídos directamente (mucho más rápido que pedir bloque a bloque)
  const near: Uint8Array[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(w.chunkData(cx + dx, cz + dz));
  const get = (x: number, y: number, z: number) => {
    if (y < 0) return B.RocaBase;
    if (y >= H) return B.Aire;
    const lx = x - x0, lz = z - z0;
    if (lx < -CHUNK || lz < -CHUNK || lx >= 2 * CHUNK || lz >= 2 * CHUNK) return w.get(x, y, z);
    const ix = lx < 0 ? 0 : lx < CHUNK ? 1 : 2, iz = lz < 0 ? 0 : lz < CHUNK ? 1 : 2;
    return near[iz * 3 + ix][(y * CHUNK + (lz - (iz - 1) * CHUNK)) * CHUNK + (lx - (ix - 1) * CHUNK)];
  };
  // Altura de la cubierta de cada columna (para saber qué está a cielo abierto) y luces cercanas (antorchas, hornos)
  const topOf = new Map<number, number>();
  const top = (x: number, z: number) => {
    const k = (x - x0 + 64) * 256 + (z - z0 + 64);
    let t = topOf.get(k);
    if (t === undefined) { t = -1; for (let y = H - 1; y >= 0; y--) { const b = get(x, y, z); if (b !== B.Aire && b !== B.Antorcha) { t = y; break; } } topOf.set(k, t); }
    return t;
  };
  const torches: [number, number, number, number][] = [];
  near.forEach((c, i) => {
    const bx = x0 + ((i % 3) - 1) * CHUNK, bz = z0 + (Math.floor(i / 3) - 1) * CHUNK;
    for (let j = 0; j < c.length; j++) {
      if (!c[j] || !LIGHT[c[j]]) continue;
      const lx = j % CHUNK, lz = Math.floor(j / CHUNK) % CHUNK, y = Math.floor(j / (CHUNK * CHUNK));
      const x = bx + lx, z = bz + lz;
      if (x >= x0 - 8 && x < x0 + CHUNK + 8 && z >= z0 - 8 && z < z0 + CHUNK + 8) torches.push([x + 0.5, y + 0.5, z + 0.5, LIGHT[c[j]]]);
    }
  });
  const light = (x: number, y: number, z: number) => Math.max(y > top(x, z) ? 1 : DARK, torches.length ? torchLight(torches, x + 0.5, y + 0.5, z + 0.5) : 0);
  const opaque = (x: number, y: number, z: number) => { const b = get(x, y, z); return b !== B.Aire && !isSee(b); };

  for (let x = x0; x < x0 + CHUNK; x++) for (let z = z0; z < z0 + CHUNK; z++) for (let y = 0; y < H; y++) {
    const b = get(x, y, z);
    if (b === B.Aire) continue;
    const def = BLOCKS[b];
    if (b === B.Antorcha) { torchMesh(see, x, y, z, uvOf(def.tex[1])); continue; }
    const out = def.see ? see : solid;
    for (const f of FACES) {
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      const nb = get(nx, ny, nz);
      if (nb !== B.Aire && !isSee(nb)) continue; // tapada
      if (b === B.Hojas && nb === B.Hojas && f.n[1] === 0 && (x + z) % 2) continue; // menos caras internas de hojas
      const L = light(nx, ny, nz), T = torches.length ? torchLight(torches, nx + 0.5, ny + 0.5, nz + 0.5) : 0;
      const [u0, v0, u1, v1] = uvOf(def.tex[f.t]);
      const base = out.pos.length / 3;
      const ao = AO_TMP;
      for (let v = 0; v < 4; v++) {
        const [ox, oy, oz] = f.c[v], o = f.ao[v];
        out.pos.push(x + ox, y + oy, z + oz);
        out.nrm.push(f.n[0], f.n[1], f.n[2]);
        // Oclusión ambiental: los dos vecinos de lado y el de la esquina, por fuera de la cara (precalculados)
        const s1 = opaque(nx + o[0], ny + o[1], nz + o[2]) ? 1 : 0, s2 = opaque(nx + o[3], ny + o[4], nz + o[5]) ? 1 : 0;
        const corner = opaque(nx + o[0] + o[3], ny + o[1] + o[4], nz + o[2] + o[5]) ? 1 : 0;
        const occ = s1 && s2 ? 0 : 3 - s1 - s2 - corner;
        const k = AO[occ] * L;
        ao[v] = occ;
        out.col.push(k, k, k);
        out.glow.push(AO[occ] * T);
      }
      // UV: abajo-izquierda, abajo-derecha, arriba-derecha, arriba-izquierda (la textura no está volteada)
      out.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      // Girar la diagonal según la sombra para que no se vean triángulos raros
      if (ao[0] + ao[2] < ao[1] + ao[3]) out.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { solid, see };
}

/** Antorcha: dos planos cruzados con la textura (con transparencia). */
function torchMesh(m: MeshData, x: number, y: number, z: number, [u0, v0, u1, v1]: [number, number, number, number]) {
  for (const [ax, az, bx, bz] of [[0.15, 0.15, 0.85, 0.85], [0.85, 0.15, 0.15, 0.85]]) {
    for (const flip of [false, true]) {
      const base = m.pos.length / 3;
      const p = [[ax, 0, az], [bx, 0, bz], [bx, 1, bz], [ax, 1, az]];
      for (const [px, py, pz] of p) { m.pos.push(x + px, y + py, z + pz); m.nrm.push(0, 1, 0); m.col.push(1, 1, 1); m.glow.push(1); }
      m.uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      if (flip) m.idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
}
