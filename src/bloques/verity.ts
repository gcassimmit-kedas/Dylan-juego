// Verity: un personaje al que le escribes y te ayuda. Entiende frases en español sobre el juego
// ("dame 10 tablas", "¿dónde hay diamantes?", "hazlo de día", "¿cómo hago un pico de piedra?").
// Todo se entiende en el propio dispositivo: el texto no sale de él. Al servidor solo llega la orden.
// Lógica pura y testeable.
import { World, B, BLOCKS, H } from './voxel.ts';
import { ITEMS, RECIPES, I, toolId, itemName, TIERS, SMELT, type ToolType, type Tier } from './items.ts';
import { DAY_SECONDS, dayPhase, isNight, type VerityCmd } from './game.ts';

export interface VerityCtx { world: World; x: number; y: number; z: number; yaw: number; time: number }
export interface VerityReply { text: string; cmd?: VerityCmd; understood: boolean }

/** Minúsculas, sin tildes ni signos. */
export const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const NUM_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, cien: 64, muchos: 64, muchas: 64, todos: 64, todas: 64,
};

/** Nombres que entiende para cada objeto (en singular y sin tildes). */
const NAMES: [string, number][] = [
  ['tabla', B.Tablas], ['madera', B.Tablas], ['tronco', B.Tronco], ['palo', I.Palo], ['piedra', B.Adoquin], ['adoquin', B.Adoquin], ['roca', B.Adoquin],
  ['tierra', B.Tierra], ['arena', B.Arena], ['grava', B.Grava], ['hoja', B.Hojas], ['hierba', B.Hierba], ['cesped', B.Hierba],
  ['carbon', I.Carbon], ['lingote de hierro', I.LingoteHierro], ['hierro', I.LingoteHierro], ['lingote de oro', I.LingoteOro], ['oro', I.LingoteOro],
  ['diamante', I.Diamante], ['mesa de crafteo', B.Mesa], ['mesa', B.Mesa], ['horno', B.Horno], ['antorcha', B.Antorcha], ['cofre', B.Cofre], ['baul', B.Cofre], ['losa de piedra', B.LosaPiedra], ['losa de tabla', B.LosaTablas], ['losa de madera', B.LosaTablas], ['losa', B.LosaTablas], ['bayas', I.Bayas], ['baya', I.Bayas], ['flor de sol', B.FlorSol], ['flor de fuego', B.FlorFuego], ['flor', B.FlorSol],
  ['manzana', I.Manzana], ['carne asada', I.CarneAsada], ['carne', I.CarneAsada], ['comida', I.CarneAsada],
];
const TOOL_WORDS: [string, ToolType][] = [['pico', 'pico'], ['hacha', 'hacha'], ['pala', 'pala'], ['espada', 'espada']];
const TIER_WORDS: [string, Tier][] = [['madera', 'madera'], ['piedra', 'piedra'], ['hierro', 'hierro'], ['diamante', 'diamante'], ['oro', 'hierro']];
const ORE_FOR: [string, number][] = [['diamante', B.Diamante], ['oro', B.Oro], ['hierro', B.Hierro], ['carbon', B.Carbon], ['arbol', B.Tronco], ['madera', B.Tronco], ['tronco', B.Tronco], ['arena', B.Arena], ['cueva', B.Aire]];

/** Quita plurales sencillos para comparar ("tablas" -> "tabla", "antorchas" -> "antorcha"). */
const singular = (w: string) => w.split(' ').map((x) => {
  if (x.length <= 3 || !x.endsWith('s')) return x;
  // "carbones" -> "carbon", "palas" -> "pala", "diamantes" -> "diamante"
  return x.endsWith('es') && 'rlnd'.includes(x[x.length - 3]) ? x.slice(0, -2) : x.slice(0, -1);
}).join(' ');

/** Busca qué objeto se pide en la frase (herramientas con su material, o cualquier otro objeto). */
export function findItem(t: string): number | null {
  const s = ` ${singular(t)} `;
  for (const [w, type] of TOOL_WORDS) if (s.includes(` ${w} `)) {
    const tier = TIER_WORDS.find(([tw]) => s.includes(` de ${tw} `) || s.includes(` ${tw} `))?.[1] ?? 'madera';
    return toolId(type, tier);
  }
  for (const [w, id] of NAMES) if (s.includes(` ${w} `)) return id;
  return null;
}
function findNumber(t: string): number | null {
  const m = t.match(/\b(\d{1,4})\b/);
  if (m) return Number(m[1]);
  for (const w of t.split(' ')) if (NUM_WORDS[w] !== undefined) return NUM_WORDS[w];
  return null;
}
const has = (t: string, ...words: string[]) => words.some((w) => ` ${t} `.includes(` ${w} `) || (w.includes(' ') && t.includes(w)));

/** Dirección hacia un punto, dicha respecto a hacia dónde miras. */
function direction(ctx: VerityCtx, x: number, y: number, z: number): string {
  const dx = x + 0.5 - ctx.x, dz = z + 0.5 - ctx.z, dy = Math.floor(y - ctx.y);
  const dist = Math.round(Math.hypot(dx, dz));
  const rel = Math.atan2(dx, dz) - ctx.yaw, a = Math.atan2(Math.sin(rel), Math.cos(rel));
  const side = Math.abs(a) < Math.PI / 4 ? 'delante de ti' : Math.abs(a) > (3 * Math.PI) / 4 ? 'detrás de ti' : a < 0 ? 'a tu derecha' : 'a tu izquierda';
  const v = dy < -1 ? `, ${-dy} bloques más abajo` : dy > 1 ? `, ${dy} bloques más arriba` : '';
  return dist < 2 ? `justo aquí${v}` : `a ${dist} bloques ${side}${v}`;
}
function nearest(ctx: VerityCtx, block: number, radius = 40): [number, number, number] | null {
  let best: [number, number, number] | null = null, bd = Infinity;
  const cx = Math.floor(ctx.x), cy = Math.floor(ctx.y), cz = Math.floor(ctx.z);
  for (let x = cx - radius; x < cx + radius; x++) for (let z = cz - radius; z < cz + radius; z++) {
    const top = ctx.world.top(x, z);
    for (let y = 1; y < H; y++) {
      const b = ctx.world.get(x, y, z);
      // Una cueva: aire bajo el suelo
      const ok = block === B.Aire ? b === B.Aire && y < top - 4 : b === block;
      if (!ok) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
      if (d < bd) { bd = d; best = [x, y, z]; }
    }
  }
  return best;
}

/** Respuesta de Verity a lo que escribe el jugador. */
export function verity(text: string, ctx: VerityCtx): VerityReply {
  const t = norm(text);
  const r = (s: string, cmd?: VerityCmd): VerityReply => ({ text: s, cmd, understood: true });
  if (!t) return { text: 'Escríbeme algo. Por ejemplo: dame 10 tablas.', understood: false };

  // ¿Cómo se hace algo? (recetas)
  if (has(t, 'como hago', 'como se hace', 'como hacer', 'como fabrico', 'como creo', 'receta', 'craftear', 'como consigo')) {
    const id = findItem(t);
    const rec = id !== null ? RECIPES.find((x) => x.out === id) : undefined;
    if (rec) {
      const needs = rec.needs.map(([i, n]) => `${n} ${itemName(i).toLowerCase()}`).join(' y ');
      const where = rec.station === 'mano' ? 'Puedes hacerlo en cualquier sitio' : rec.station === 'mesa' ? 'Necesitas una mesa de crafteo cerca' : 'Necesitas un horno cerca';
      return r(`${itemName(rec.out)}: ${needs}. ${where}. Abre el inventario y pulsa Fabricar.`);
    }
    const from = id !== null ? Object.entries(SMELT).find(([, out]) => out === id) : undefined;
    if (from) return r(`${itemName(id!)}: pon ${itemName(Number(from[0])).toLowerCase()} en un horno con combustible (carbón o madera) y espera. Usa el horno para abrirlo.`);
    if (id !== null && ITEMS.get(id)?.block !== undefined) return r(`${itemName(id)} no se fabrica: se consigue rompiendo bloques en el mundo.`);
    if (id === I.Diamante) return r('Los diamantes se sacan del mineral de diamante, muy abajo, con un pico de hierro.');
  }
  // ¿Dónde hay algo?
  if (has(t, 'donde', 'busca', 'encuentra', 'buscar', 'encontrar')) {
    const target = ORE_FOR.find(([w]) => ` ${singular(t)} `.includes(` ${w} `));
    if (target) {
      const p = nearest(ctx, target[1]);
      const what = target[1] === B.Aire ? 'una cueva' : BLOCKS[target[1]].name.toLowerCase();
      return p ? r(`Hay ${what} ${direction(ctx, ...p)}.`) : r(`No veo ${what} cerca. Prueba a explorar más lejos o a cavar más hondo.`);
    }
  }
  // Pedir cosas
  if (has(t, 'dame', 'quiero', 'necesito', 'regalame', 'consigueme', 'dar', 'pasame', 'trae', 'traeme', 'me das', 'puedes darme')) {
    const id = findItem(t);
    if (id !== null) {
      const n = Math.max(1, Math.min(64, findNumber(t) ?? (ITEMS.get(id)?.stack === 1 ? 1 : 16)));
      const realN = ITEMS.get(id)?.stack === 1 ? 1 : n;
      return r(`Toma: ${realN} ${itemName(id).toLowerCase()}.`, { k: 'dar', id, n: realN });
    }
    if (has(t, 'vida', 'corazon', 'corazones', 'salud')) return r('Te curo. Tienes los 10 corazones.', { k: 'curar' });
  }
  if (has(t, 'curame', 'cura', 'curar', 'sana', 'me muero', 'ayudame que me muero')) return r('Te curo. Tienes los 10 corazones.', { k: 'curar' });
  if (has(t, 'tengo hambre', 'hambre')) return r('Aquí no se pasa hambre: la comida te cura. Toma unas manzanas.', { k: 'dar', id: I.Manzana, n: 4 });
  // Hora del día
  if (has(t, 'de dia', 'que amanezca', 'amanecer', 'dia')) return r('Que salga el sol.', { k: 'dia' });
  if (has(t, 'de noche', 'que anochezca', 'anochecer', 'noche')) return r('Que llegue la noche. Cuidado con las criaturas.', { k: 'noche' });
  if (has(t, 'que hora', 'hora es', 'cuanto falta')) {
    const p = dayPhase({ time: ctx.time });
    const night = isNight({ time: ctx.time });
    const left = Math.round(((night ? 0.98 - p : (p < 0.52 ? 0.52 - p : 1.52 - p)) * DAY_SECONDS) / 60);
    return r(night ? `Es de noche. Amanece en unos ${Math.max(1, left)} minutos.` : `Es de día. Anochece en unos ${Math.max(1, left)} minutos.`);
  }
  // Salir de un apuro
  if (has(t, 'sacame', 'superficie', 'atrapado', 'perdido', 'subeme', 'arriba', 'no puedo salir')) return r('Te subo a la superficie.', { k: 'superficie' });
  // Consejos
  if (has(t, 'mascota', 'amigo', 'domar', 'domesticar', 'compañero', 'companero')) return r('De día salen brincones mansos a la hierba. Acércate con bayas en la mano y dáselas (como si colocaras un bloque): se hará tu amigo, te seguirá y te defenderá de noche. Puedes tener hasta 3.');
  if (has(t, 'monstruo', 'criatura', 'bicho', 'pedrusco', 'espino', 'brincon', 'miedo')) return r('De noche y en las cuevas salen tres criaturas: el pedrusco embiste, el espino lanza púas desde lejos y el brincón es pequeño y muy rápido. Construye un refugio, pon antorchas y lleva una espada. Con el sol, pedruscos y espinos se deshacen.');
  if (has(t, 'como empiezo', 'que hago', 'empezar', 'consejo', 'consejos')) return r('Rompe un tronco, haz tablas y una mesa de crafteo. Con la mesa haz un pico de madera y busca piedra. Antes de la noche, haz antorchas con carbón y palos.');
  // Quién es
  if (has(t, 'quien eres', 'como te llamas', 'eres', 'hola', 'buenas', 'hey')) return r('Hola, soy Verity. Pídeme cosas o pregúntame sobre el juego.');
  if (has(t, 'ayuda', 'que puedes hacer', 'que sabes hacer', 'opciones')) return r('Puedo darte objetos (dame 10 tablas), curarte, cambiar la hora (hazlo de día), decirte dónde hay minerales (¿dónde hay diamantes?), explicarte recetas (¿cómo hago un pico de piedra?) y sacarte a la superficie.');
  if (has(t, 'gracias')) return r('De nada.');
  return { text: 'No te he entendido. Prueba con: dame 10 tablas, ¿dónde hay hierro?, hazlo de día o ayuda.', understood: false };
}
void TIERS;
