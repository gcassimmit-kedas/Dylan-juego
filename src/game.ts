// Lógica pura del tres en raya 3D (sin dependencias de renderizado).

export type Player = 1 | 2;
export type Cell = 0 | Player | -1; // -1 = casilla bloqueada

export interface GameState {
  n: number;
  cells: Cell[];
  turn: Player;
  winner: Player | 0;
  winLine: number[] | null;
  draw: boolean;
}

export const idx = (n: number, x: number, y: number, z: number) => x + y * n + z * n * n;

export function coords(n: number, i: number): [number, number, number] {
  return [i % n, Math.floor(i / n) % n, Math.floor(i / (n * n))];
}

const lineCache = new Map<number, number[][]>();

/** Todas las líneas ganadoras de longitud n en un cubo n×n×n. */
export function lines(n: number): number[][] {
  const cached = lineCache.get(n);
  if (cached) return cached;
  const dirs: [number, number, number][] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        const first = dx !== 0 ? dx : dy !== 0 ? dy : dz;
        if (first > 0) dirs.push([dx, dy, dz]); // una dirección por par opuesto
      }
  const inB = (v: number) => v >= 0 && v < n;
  const out: number[][] = [];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        for (const [dx, dy, dz] of dirs) {
          const ex = x + dx * (n - 1), ey = y + dy * (n - 1), ez = z + dz * (n - 1);
          if (!inB(ex) || !inB(ey) || !inB(ez)) continue;
          const line: number[] = [];
          for (let k = 0; k < n; k++) line.push(idx(n, x + dx * k, y + dy * k, z + dz * k));
          out.push(line);
        }
  lineCache.set(n, out);
  return out;
}

export function newGame(n: number): GameState {
  const cells: Cell[] = new Array(n * n * n).fill(0);
  // En 3×3×3 el centro gana casi solo: se bloquea (variante clásica).
  if (n === 3) cells[idx(3, 1, 1, 1)] = -1;
  return { n, cells, turn: 1, winner: 0, winLine: null, draw: false };
}

export function canPlay(s: GameState, i: number) {
  return !s.winner && !s.draw && s.cells[i] === 0;
}

export function play(s: GameState, i: number): GameState {
  if (!canPlay(s, i)) return s;
  const cells = s.cells.slice();
  cells[i] = s.turn;
  const winLine = lines(s.n).find((l) => l.includes(i) && l.every((c) => cells[c] === s.turn)) ?? null;
  const winner = winLine ? s.turn : 0;
  const draw = !winner && !cells.includes(0);
  return { ...s, cells, winner, winLine, draw, turn: s.turn === 1 ? 2 : 1 };
}

// ---------- IA ----------

function linesThrough(n: number): number[][][] {
  const ls = lines(n);
  const by: number[][][] = Array.from({ length: n * n * n }, () => []);
  for (const l of ls) for (const c of l) by[c].push(l);
  return by;
}
const throughCache = new Map<number, number[][][]>();
const through = (n: number) => {
  let t = throughCache.get(n);
  if (!t) throughCache.set(n, (t = linesThrough(n)));
  return t;
};

/** Cuántas líneas quedarían a una ficha de ganar para `p` si juega en `i`. */
function threatsAfter(s: GameState, i: number, p: Player): number {
  let t = 0;
  for (const l of through(s.n)[i]) {
    let mine = 0, empty = 0;
    for (const c of l) {
      const v = c === i ? p : s.cells[c];
      if (v === p) mine++;
      else if (v === 0) empty++;
    }
    if (mine === s.n - 1 && empty === 1) t++;
  }
  return t;
}

function completes(s: GameState, i: number, p: Player): boolean {
  return through(s.n)[i].some((l) => l.every((c) => c === i || s.cells[c] === p));
}

function positional(s: GameState, i: number, p: Player): number {
  const o: Player = p === 1 ? 2 : 1;
  let score = 0;
  for (const l of through(s.n)[i]) {
    let mine = 0, theirs = 0, blocked = false;
    for (const c of l) {
      if (s.cells[c] === p) mine++;
      else if (s.cells[c] === o) theirs++;
      else if (s.cells[c] === -1) blocked = true;
    }
    if (blocked) continue;
    if (theirs === 0) score += 1 + mine * mine * 3; // línea propia viva
    if (mine === 0) score += 1 + theirs * theirs * 2; // estorbar línea rival
  }
  return score;
}

export type Difficulty = 'facil' | 'dificil';

export function aiMove(s: GameState, level: Difficulty, rand = Math.random): number {
  const p = s.turn, o: Player = p === 1 ? 2 : 1;
  const free = s.cells.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (free.length === 0) return -1;

  const win = free.find((i) => completes(s, i, p));
  if (win !== undefined) return win;
  const block = free.find((i) => completes(s, i, o));
  if (block !== undefined) return block;

  if (level === 'facil' && rand() < 0.5) return free[Math.floor(rand() * free.length)];

  if (level === 'dificil') {
    const fork = free.find((i) => threatsAfter(s, i, p) >= 2);
    if (fork !== undefined) return fork;
    const oppFork = free.find((i) => threatsAfter(s, i, o) >= 2);
    if (oppFork !== undefined) return oppFork;
  }

  let best = -Infinity, choices: number[] = [];
  for (const i of free) {
    const sc = positional(s, i, p) + (level === 'dificil' ? threatsAfter(s, i, p) * 8 : 0);
    if (sc > best) { best = sc; choices = [i]; }
    else if (sc === best) choices.push(i);
  }
  return choices[Math.floor(rand() * choices.length)];
}
