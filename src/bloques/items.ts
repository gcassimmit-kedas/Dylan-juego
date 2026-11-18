// Objetos de Bloques: bloques que se llevan en el inventario, materiales y herramientas; recetas de crafteo
// (a mano, en la mesa de crafteo o en el horno) e inventario. Lógica pura y testeable.
import { B, BLOCKS } from './voxel.ts';

export const I = {
  Palo: 100, Carbon: 101, LingoteHierro: 102, LingoteOro: 103, Diamante: 104,
  Manzana: 105, CarnePodrida: 106, CarneAsada: 107,
} as const;
/** Comida: cuánto quita el hambre (en medios muslos, de 20). */
export const FOOD: Partial<Record<number, number>> = { 105: 4, 106: 2, 107: 8 };
export type ToolType = 'pico' | 'hacha' | 'pala' | 'espada';
export const TOOL_TYPES: ToolType[] = ['pico', 'hacha', 'pala', 'espada'];
export const TIERS = ['madera', 'piedra', 'hierro', 'diamante'] as const;
export type Tier = (typeof TIERS)[number];
/** Id de una herramienta: 110 + tipo x 4 + material (0 madera ... 3 diamante). */
export const toolId = (type: ToolType, tier: Tier) => 110 + TOOL_TYPES.indexOf(type) * 4 + TIERS.indexOf(tier);

export interface ItemDef { id: number; name: string; stack: number; block?: number; tool?: { type: ToolType; tier: number } }
const TIER_NAME: Record<Tier, string> = { madera: 'de madera', piedra: 'de piedra', hierro: 'de hierro', diamante: 'de diamante' };
const TYPE_NAME: Record<ToolType, string> = { pico: 'Pico', hacha: 'Hacha', pala: 'Pala', espada: 'Espada' };

export const ITEMS = new Map<number, ItemDef>();
BLOCKS.forEach((b, id) => { if (id !== B.Aire && id !== B.RocaBase && id !== B.HornoEncendido) ITEMS.set(id, { id, name: b.name, stack: 64, block: id }); });
for (const [id, name] of [[I.Palo, 'Palo'], [I.Carbon, 'Carbón'], [I.LingoteHierro, 'Lingote de hierro'], [I.LingoteOro, 'Lingote de oro'], [I.Diamante, 'Diamante'],
  [I.Manzana, 'Manzana'], [I.CarnePodrida, 'Carne podrida'], [I.CarneAsada, 'Carne asada']] as const)
  ITEMS.set(id, { id, name, stack: 64 });
for (const type of TOOL_TYPES) for (const tier of TIERS) {
  const id = toolId(type, tier);
  ITEMS.set(id, { id, name: `${TYPE_NAME[type]} ${TIER_NAME[tier]}`, stack: 1, tool: { type, tier: TIERS.indexOf(tier) + 1 } });
}
export const itemName = (id: number) => ITEMS.get(id)?.name ?? 'Objeto';

// ---------- Minar y luchar ----------

const SPEED = [1, 2, 4, 6, 8]; // a mano, madera, piedra, hierro, diamante
/** Segundos que se tarda en romper un bloque con lo que se lleva en la mano (Infinity si no se puede). */
export function breakTime(block: number, held: number | null): number {
  const def = BLOCKS[block];
  if (!def || !Number.isFinite(def.hardness)) return Infinity;
  const tool = held !== null ? ITEMS.get(held)?.tool : undefined;
  const right = !!tool && tool.type === def.tool;
  const canHarvest = def.needs === 0 || (right && tool!.type === 'pico' && tool!.tier >= def.needs);
  const speed = right ? SPEED[tool!.tier] : 1;
  return (def.hardness * (canHarvest ? 1.5 : 5)) / speed;
}
/** Qué suelta un bloque al romperlo con lo que se lleva (null = nada). */
export function dropOf(block: number, held: number | null): number | null {
  const def = BLOCKS[block];
  const tool = held !== null ? ITEMS.get(held)?.tool : undefined;
  if (def.needs > 0 && !(tool && tool.type === 'pico' && tool.tier >= def.needs)) return null;
  return def.drop === undefined ? block : def.drop;
}
/** Daño de un golpe (en medios corazones) según lo que se lleva. */
export function attackDamage(held: number | null): number {
  const tool = held !== null ? ITEMS.get(held)?.tool : undefined;
  if (!tool) return 1;
  return tool.type === 'espada' ? 3 + tool.tier : tool.type === 'hacha' ? 2 + tool.tier : 1 + Math.ceil(tool.tier / 2);
}

// ---------- Recetas ----------

export type Station = 'mano' | 'mesa' | 'horno';
export interface Recipe { id: string; out: number; n: number; needs: [number, number][]; station: Station }
const R = (id: string, out: number, n: number, needs: [number, number][], station: Station = 'mano'): Recipe => ({ id, out, n, needs, station });
const TOOL_COST: Record<ToolType, number> = { pico: 3, hacha: 3, pala: 1, espada: 2 };
const TOOL_STICKS: Record<ToolType, number> = { pico: 2, hacha: 2, pala: 2, espada: 1 };
const TIER_MAT: Record<Tier, number> = { madera: B.Tablas, piedra: B.Adoquin, hierro: I.LingoteHierro, diamante: I.Diamante };

export const RECIPES: Recipe[] = [
  R('tablas', B.Tablas, 4, [[B.Tronco, 1]]),
  R('palos', I.Palo, 4, [[B.Tablas, 2]]),
  R('mesa', B.Mesa, 1, [[B.Tablas, 4]]),
  R('antorchas', B.Antorcha, 4, [[I.Carbon, 1], [I.Palo, 1]]),
  R('horno', B.Horno, 1, [[B.Adoquin, 8]], 'mesa'),
  ...TIERS.flatMap((tier) => TOOL_TYPES.map((type) => R(`${type}-${tier}`, toolId(type, tier), 1, [[TIER_MAT[tier], TOOL_COST[type]], [I.Palo, TOOL_STICKS[type]]], 'mesa'))),
  R('cofre', B.Cofre, 1, [[B.Tablas, 8]], 'mesa'),
];
export const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

// ---------- Horno ----------

/** Lo que se funde en el horno: entrada -> resultado. */
export const SMELT: Partial<Record<number, number>> = {
  [B.Hierro]: I.LingoteHierro, [B.Oro]: I.LingoteOro, [I.CarnePodrida]: I.CarneAsada, [B.Adoquin]: B.Piedra, [B.Tronco]: I.Carbon,
};
/** Combustible: segundos que arde cada unidad. */
export const FUEL: Partial<Record<number, number>> = {
  [I.Carbon]: 80, [B.Tronco]: 15, [B.Tablas]: 15, [B.Mesa]: 15, [B.Cofre]: 15, [I.Palo]: 5,
};
export const SMELT_SECONDS = 8;

// ---------- Inventario ----------

export const SLOTS = 36; // 9 en la barra rápida + 27 en la mochila
export const HOTBAR = 9;
export type Slot = { id: number; n: number } | null;
export const newInventory = (): Slot[] => Array.from({ length: SLOTS }, () => null);

export function count(inv: Slot[], id: number): number {
  return inv.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0);
}
/** Mete objetos (llenando primero los montones que ya hay). Devuelve los que no caben. */
export function addItem(inv: Slot[], id: number, n: number): number {
  const max = ITEMS.get(id)?.stack ?? 64;
  for (const s of inv) if (n > 0 && s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
  for (let i = 0; i < inv.length && n > 0; i++) if (!inv[i]) { const k = Math.min(n, max); inv[i] = { id, n: k }; n -= k; }
  return n;
}
export function removeItem(inv: Slot[], id: number, n: number): boolean {
  if (count(inv, id) < n) return false;
  for (let i = inv.length - 1; i >= 0 && n > 0; i--) {
    const s = inv[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(n, s.n); s.n -= k; n -= k;
    if (s.n === 0) inv[i] = null;
  }
  return true;
}
/** Por qué no se puede fabricar una receta (o null si se puede). `near` = estaciones que hay cerca. */
export function cannotCraft(inv: Slot[], r: Recipe, near: Set<Station>): string | null {
  if (r.station !== 'mano' && !near.has(r.station)) return r.station === 'mesa' ? 'Necesitas una mesa de crafteo cerca' : 'Necesitas un horno cerca';
  for (const [id, n] of r.needs) if (count(inv, id) < n) return 'Te faltan materiales';
  return null;
}
export function craft(inv: Slot[], r: Recipe, near: Set<Station>): boolean {
  if (cannotCraft(inv, r, near)) return false;
  const copy = inv.map((s) => (s ? { ...s } : null));
  for (const [id, n] of r.needs) removeItem(copy, id, n);
  if (addItem(copy, r.out, r.n) > 0) return false; // sin sitio: no se gasta nada
  inv.splice(0, inv.length, ...copy);
  return true;
}
/** Intercambia dos casillas (ordenar el inventario). */
export function swapSlots(inv: Slot[], a: number, b: number) {
  if (a < 0 || b < 0 || a >= inv.length || b >= inv.length) return;
  const s = inv[a]; inv[a] = inv[b]; inv[b] = s;
}
