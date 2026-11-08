// Moderación de nombres (jugadores y salas públicas). Lo comparten servidor y cliente:
// el servidor es quien decide; el cliente solo avisa antes de enviar.
//
// Detecta palabras ofensivas en español e inglés aunque se disfracen con números,
// símbolos, espacios o letras repetidas ("p3rr4", "p.u.t.a", "puuuta").

const BLOCKED = [
  // Español
  'puta', 'puto', 'putas', 'putos', 'puton', 'mierda', 'cabron', 'cabrona', 'gilipollas', 'pendejo', 'pendeja', 'verga', 'polla',
  'chocho', 'concha', 'culero', 'culera', 'marica', 'maricon', 'maricona', 'joto', 'zorra', 'perra', 'malparido', 'hijueputa',
  'hijoputa', 'hdp', 'carajo', 'cojones', 'follar', 'follo', 'coger', 'cogida', 'chupala', 'mamon', 'mamada', 'pajero', 'pajillero',
  'subnormal', 'retrasado', 'mongolo', 'idiota', 'imbecil', 'estupido', 'estupida', 'tonto', 'tonta', 'nazi', 'hitler', 'violar',
  'violador', 'negrata', 'sudaca', 'panchito', 'pedofilo', 'pederasta', 'porno', 'sexo', 'teta', 'tetas',
  // Inglés
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'fag',
  'faggot', 'nigger', 'nigga', 'retard', 'rape', 'rapist', 'porn', 'sex', 'nude', 'penis', 'vagina', 'boobs', 'kys', 'killyourself',
];

/** Palabras que contienen otras bloqueadas pero son inocentes (p. ej. "computadora" contiene "puta"). */
const ALLOWED = ['computadora', 'computador', 'disputa', 'reputacion', 'imputado', 'diputado', 'diputada', 'escupitajo', 'cocodrilo',
  'conejo', 'cocinero', 'escoger', 'recoger', 'acoger', 'escocer', 'sexto', 'sexteto', 'tetera', 'tetris', 'scunthorpe', 'cocktail',
  'peacock', 'cockpit', 'shitake', 'essex', 'sussex', 'sextante', 'dickens', 'pollito', 'pollino', 'apollo', 'polla de agua'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '€': 'e' };

/** Texto en minúsculas, sin tildes, sin números disfrazados y sin letras repetidas. */
export function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes (ñ queda en n)
    .replace(/[0-9@$!|€]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '') // fuera espacios, puntos, guiones...
    .replace(/(.)\1+/g, '$1'); // "puuuta" -> "puta"
}

const NORMALIZED_BLOCKED = [...new Set(BLOCKED.map(normalizeForFilter))];
const NORMALIZED_ALLOWED = ALLOWED.map(normalizeForFilter);

/** ¿Contiene el texto alguna palabra ofensiva? */
export function isOffensive(text: string): boolean {
  let t = normalizeForFilter(text);
  for (const ok of NORMALIZED_ALLOWED) t = t.split(ok).join('_'); // las palabras inocentes no cuentan
  return NORMALIZED_BLOCKED.some((w) => t.includes(w));
}

/** Limpia caracteres no permitidos y longitud. Solo letras, números, espacios y algunos signos. */
export function cleanName(raw: unknown, max = 16): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '') // fuera emojis, símbolos y caracteres de control
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** Valida un nombre de jugador o de sala. */
export function checkName(raw: unknown, what: 'jugador' | 'sala' = 'jugador'): NameCheck {
  const name = cleanName(raw);
  if (name.length < 2) return { ok: false, reason: `El nombre de ${what} debe tener al menos 2 letras.` };
  if (isOffensive(name)) return { ok: false, reason: `Ese nombre de ${what} no está permitido. Elige otro.` };
  return { ok: true, name };
}
