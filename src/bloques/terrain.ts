// Terreno de bloques fuera del campo de batalla, convertido en mallas con solo las caras que se ven
// (arriba de cada columna y los laterales que asoman sobre los vecinos). Lógica pura: se puede probar sin Three.js.

/** Altura en bloques de la columna (x, z). 0 = sin bloques (dentro del campo). */
export function terrainHeight(x: number, z: number, arena: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z)) - arena - 2;
  if (d <= 0) return 0;
  const n = Math.sin(x * 0.13) * Math.cos(z * 0.11) + Math.sin((x + z) * 0.07) * 0.8 + 1.8;
  return Math.max(1, Math.round(Math.min(d * 0.35, 3 + n * 3) + n));
}

/** Caras agrupadas por material: posiciones, normales y UV (cada cara usa la textura entera). */
export interface FaceSet { pos: number[]; nrm: number[]; uv: number[] }
export interface TerrainMesh { grass: FaceSet; side: FaceSet; dirt: FaceSet; faces: number }

const empty = (): FaceSet => ({ pos: [], nrm: [], uv: [] });

/** Añade un cuadrado (dos triángulos) con sus cuatro esquinas en orden antihorario visto desde fuera. */
function quad(f: FaceSet, a: number[], b: number[], c: number[], d: number[], n: number[]) {
  for (const p of [a, b, c, a, c, d]) f.pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < 6; i++) f.nrm.push(n[0], n[1], n[2]);
  f.uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
}

export function buildTerrain(radius: number, arena: number, height = terrainHeight): TerrainMesh {
  const H = (x: number, z: number) => height(x, z, arena);
  const m: TerrainMesh = { grass: empty(), side: empty(), dirt: empty(), faces: 0 };
  // Vecinos: dirección y las dos esquinas del lado que da a ese vecino (en coordenadas de la celda)
  const SIDES: { dx: number; dz: number; n: number[]; c: [number, number, number, number] }[] = [
    { dx: 1, dz: 0, n: [1, 0, 0], c: [1, 1, 1, 0] },
    { dx: -1, dz: 0, n: [-1, 0, 0], c: [0, 0, 0, 1] },
    { dx: 0, dz: 1, n: [0, 0, 1], c: [0, 1, 1, 1] },
    { dx: 0, dz: -1, n: [0, 0, -1], c: [1, 0, 0, 0] },
  ];
  for (let x = -radius; x < radius; x++) for (let z = -radius; z < radius; z++) {
    const h = H(x, z);
    if (!h) continue;
    // Cara de arriba (celda de x a x+1 y de z a z+1)
    quad(m.grass, [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z], [x, h, z], [0, 1, 0]);
    m.faces++;
    for (const s of SIDES) {
      const nh = H(x + s.dx, z + s.dz);
      for (let y = nh; y < h; y++) {
        const [ax, az, bx, bz] = s.c;
        const set = y === h - 1 ? m.side : m.dirt;
        quad(set, [x + ax, y, z + az], [x + bx, y, z + bz], [x + bx, y + 1, z + bz], [x + ax, y + 1, z + az], s.n);
        m.faces++;
      }
    }
  }
  return m;
}
