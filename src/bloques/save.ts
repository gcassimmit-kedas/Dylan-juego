// Mundos guardados de Bloques (un jugador): cada mundo se crea antes de jugar, con nombre automático, y se
// guarda en el propio dispositivo (bloques cambiados, cofres y hornos, inventario, posición y hora).
// Lógica pura: quien la usa decide dónde se guarda el texto. No hay datos personales ni nada sale del dispositivo.
import { newGame, addPlayer, getPlayer, MAX_HP, MAX_PETS, type Game, type Box } from './game.ts';
import { ITEMS, SLOTS, type Slot } from './items.ts';
import { BLOCKS } from './voxel.ts';

/** Ficha de un mundo en la lista de la pantalla de inicio. */
export interface WorldCard { id: string; name: string; seed: number; peaceful: boolean; created: number; played: number; days: number }
/** Lo que se guarda de una partida. */
export interface WorldSave {
  v: 1; time: number; edits: number[]; boxes: [number, Box][];
  player: { x: number; y: number; z: number; hp: number; sel: number; inv: Slot[]; armor?: (number | null)[] };
  /** Dónde estaban tus brincones amigos. */
  pets?: [number, number, number][];
}

const PLACES = ['Valle', 'Colina', 'Bosque', 'Prado', 'Cerro', 'Ribera', 'Llano', 'Risco', 'Claro', 'Monte'];
const TRAITS = ['Dorado', 'Sereno', 'Alto', 'Verde', 'Escondido', 'Azul', 'Lejano', 'Tranquilo', 'Bravo', 'Viejo', 'Nuevo', 'Soleado'];
/** Nombre automático de un mundo (nadie escribe nada): "Valle Dorado", "Cerro Escondido"... sin repetir los que ya hay. */
export function worldName(rand: () => number, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (let i = 0; i < 40; i++) {
    const n = `${PLACES[Math.floor(rand() * PLACES.length)]} ${TRAITS[Math.floor(rand() * TRAITS.length)]}`;
    if (!used.has(n)) return n;
  }
  let k = 2; while (used.has(`Valle Nuevo ${k}`)) k++;
  return `Valle Nuevo ${k}`;
}

export function newCard(rand: () => number, name: string, peaceful: boolean, now: number): WorldCard {
  return { id: Math.floor(rand() * 2 ** 40).toString(36) + Math.floor(now).toString(36), name, seed: Math.floor(rand() * 2 ** 31), peaceful, created: now, played: now, days: 0 };
}

/** Empieza la partida de un mundo recién creado. */
export function startWorld(card: WorldCard, pid: string, rand: () => number = Math.random): Game {
  const g = newGame(card.seed, rand, { peaceful: card.peaceful });
  addPlayer(g, pid, 'Tú');
  g.events.length = 0;
  return g;
}

export function saveGame(g: Game, pid: string): WorldSave | null {
  const p = getPlayer(g, pid);
  if (!p) return null;
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    v: 1, time: r(g.time), edits: [...g.world.edits].flat(),
    boxes: [...g.boxes].map(([k, b]) => [k, { ...b, slots: b.slots.map((s) => (s ? { ...s } : null)) }]),
    player: { x: r(p.body.x), y: r(p.body.y), z: r(p.body.z), hp: p.alive ? p.hp : MAX_HP, sel: p.sel, inv: p.inv.map((s) => (s ? { ...s } : null)), armor: [...p.armor] },
    pets: g.mobs.filter((m) => m.owner === pid).map((m) => [r(m.body.x), r(m.body.y), r(m.body.z)]),
  };
}

const okSlot = (s: unknown): Slot => {
  const o = s as { id?: unknown; n?: unknown } | null;
  if (!o || typeof o.id !== 'number' || typeof o.n !== 'number' || !ITEMS.has(o.id)) return null;
  const n = Math.floor(o.n);
  return n >= 1 ? { id: o.id, n: Math.min(n, ITEMS.get(o.id)!.stack) } : null;
};

/** Reanuda un mundo guardado. Lo guardado se revisa entero: si algo no encaja, se ignora esa parte y el mundo sigue valiendo. */
export function loadGame(card: WorldCard, save: unknown, pid: string, rand: () => number = Math.random): Game {
  const g = startWorld(card, pid, rand);
  const s = save as Partial<WorldSave> | null;
  if (!s || s.v !== 1) return g;
  if (Array.isArray(s.edits)) {
    const flat = s.edits.filter((v) => Number.isInteger(v));
    for (let i = 0; i + 1 < flat.length; i += 2) if (flat[i + 1] >= 0 && flat[i + 1] < BLOCKS.length) g.world.applyEdits([flat[i], flat[i + 1]]);
  }
  if (Array.isArray(s.boxes)) for (const e of s.boxes) {
    const [k, b] = (Array.isArray(e) ? e : []) as [unknown, Partial<Box> | undefined];
    if (typeof k !== 'number' || !b || (b.kind !== 'horno' && b.kind !== 'cofre') || !Array.isArray(b.slots)) continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    g.boxes.set(k, { kind: b.kind, slots: b.slots.slice(0, 27).map(okSlot), burn: num(b.burn), burnMax: num(b.burnMax), prog: num(b.prog) });
  }
  if (typeof s.time === 'number' && Number.isFinite(s.time) && s.time >= 0) g.time = s.time;
  const p = getPlayer(g, pid)!, sp = s.player;
  if (sp && [sp.x, sp.y, sp.z].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    Object.assign(p.body, { x: sp.x, y: sp.y + 0.01, z: sp.z, vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: sp.y });
    if (typeof sp.hp === 'number') p.hp = Math.max(1, Math.min(MAX_HP, Math.floor(sp.hp)));
    if (typeof sp.sel === 'number') p.sel = Math.max(0, Math.min(8, Math.floor(sp.sel)));
    if (Array.isArray(sp.inv)) p.inv = Array.from({ length: SLOTS }, (_v, i) => okSlot(sp.inv[i]));
    // Cada pieza, solo en su sitio (un casco nunca vale de botas)
    if (Array.isArray(sp.armor)) p.armor = [0, 1, 2].map((i) => { const id = sp.armor![i]; return typeof id === 'number' && ITEMS.get(id)?.armor?.piece === i ? id : null; });
  }
  if (Array.isArray(s.pets)) for (const e of s.pets.slice(0, MAX_PETS)) {
    if (!Array.isArray(e) || e.length !== 3 || !e.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    g.mobs.push({ id: g.nextId++, kind: 'brincon', owner: pid, body: { x: e[0], y: e[1] + 0.01, z: e[2], vx: 0, vy: 0, vz: 0, onGround: false, fallFrom: e[1] }, yaw: 0, hp: 16, cd: 0, flash: 0, wanderT: 0, wx: 0, wz: 0, burn: 0 });
  }
  g.events.length = 0;
  return g;
}

/** Lista de mundos leída del almacenamiento (texto JSON); lo que no tenga forma de ficha se descarta. */
export function parseCards(text: string): WorldCard[] {
  try {
    const list = JSON.parse(text || '[]') as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((c): c is WorldCard => !!c && typeof c.id === 'string' && /^[a-z0-9]{1,24}$/.test(c.id) && typeof c.name === 'string' && c.name.length <= 40
      && Number.isInteger(c.seed) && typeof c.peaceful === 'boolean' && typeof c.created === 'number' && typeof c.played === 'number').map((c) => ({ ...c, days: Number(c.days) || 0 })).slice(0, MAX_WORLDS);
  } catch { return []; }
}
/** Cuántos mundos caben en la lista. */
export const MAX_WORLDS = 8;
