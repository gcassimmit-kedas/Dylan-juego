// Construye las mallas de los trozos del mundo en segundo plano, para que el juego no se pare al caminar.
// Recibe los datos de un trozo y sus 8 vecinos y devuelve las listas de vértices (transferidas, sin copiar).
import { World, CHUNK } from './voxel.ts';
import { meshChunk, type MeshData } from './mesher.ts';
import type { Tex } from './voxel.ts';

let uvTable: Record<string, [number, number, number, number]> = {};
const uvOf = (t: Tex) => uvTable[t] ?? [0, 0, 1, 1];

export interface MeshJob { id: number; cx: number; cz: number; seed: number; near: Uint8Array[] }
export interface MeshResult { id: number; cx: number; cz: number; solid: Packed; see: Packed }
export interface Packed { pos: Float32Array; nrm: Float32Array; uv: Float32Array; col: Float32Array; glow: Float32Array; idx: Uint32Array }

const pack = (d: MeshData): Packed => ({
  pos: new Float32Array(d.pos), nrm: new Float32Array(d.nrm), uv: new Float32Array(d.uv),
  col: new Float32Array(d.col), glow: new Float32Array(d.glow), idx: new Uint32Array(d.idx),
});

self.onmessage = (e: MessageEvent<{ uv?: typeof uvTable; job?: MeshJob }>) => {
  if (e.data.uv) { uvTable = e.data.uv; return; }
  const job = e.data.job;
  if (!job) return;
  const { cx, cz, near } = job;
  // Un mundo de 3 x 3 trozos con los datos recibidos (lo de más allá, vacío)
  const w = new World(job.seed, (_s, x, z) => {
    const dx = x - cx + 1, dz = z - cz + 1;
    return dx >= 0 && dz >= 0 && dx < 3 && dz < 3 ? near[dz * 3 + dx] : new Uint8Array(near[0].length);
  });
  const { solid, see } = meshChunk(w, cx, cz, uvOf);
  const res: MeshResult = { id: job.id, cx, cz, solid: pack(solid), see: pack(see) };
  const buffers = [res.solid, res.see].flatMap((p) => [p.pos.buffer, p.nrm.buffer, p.uv.buffer, p.col.buffer, p.glow.buffer, p.idx.buffer]);
  (self as unknown as Worker).postMessage(res, buffers);
};
void CHUNK;
