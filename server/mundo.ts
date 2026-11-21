// Mundos compartidos de Bloques en el servidor. Cada mundo es público (aparece en la lista de Multijugador),
// tiene nombre aleatorio y hasta MAX_PLAYERS jugadores. La simulación corre aquí: el cliente solo manda su entrada.
// Un mundo vacío se guarda 10 minutos en memoria por si alguien vuelve con el enlace; después desaparece.
import { WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { newGame, addPlayer, removePlayer, step, place, craft, selectSlot, moveSlot, respawn, getPlayer, verityCommand, boxMove, getBox, type Game, type Look, type VerityCmd } from '../src/bloques/game.ts';
import { encodeSnapshot, clampMInput, MAX_PLAYERS, TICK_HZ, type MClientMsg, type MServerMsg, type WorldInfo } from '../src/bloques/protocol.ts';
import { randomServerName, roomPaused, reportsToKick } from '../src/shooter/protocol.ts';

export interface MClient { ws: WebSocket; pid: string; name: string; look: Look; world: WorldRoom | null; paused: boolean; lastInput: number;
  /** Horno o cofre que tiene abierto (para mandarle lo que hay dentro). */
  open?: [number, number, number] | null }
export interface WorldRoom { id: string; name: string; game: Game; clients: Map<string, MClient>; tick: number; emptySince: number; reports: Map<string, Set<string>> }

const worlds = new Map<string, WorldRoom>();
const MAX_WORLDS = 40;
const KEEP_EMPTY_MS = 10 * 60 * 1000;

function send(c: MClient, m: MServerMsg) { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(m)); }
const info = (r: WorldRoom): WorldInfo => ({ id: r.id, name: r.name, players: r.clients.size, max: MAX_PLAYERS });
export const worldList = () => [...worlds.values()].filter((r) => r.clients.size > 0).map(info).sort((a, b) => b.players - a.players);

function createWorld(): WorldRoom {
  const taken = new Set([...worlds.values()].map((r) => r.name));
  const r: WorldRoom = { id: randomBytes(5).toString('hex'), name: randomServerName(Math.random, taken), game: newGame(Math.floor(Math.random() * 2 ** 31), Math.random), clients: new Map(), tick: 0, emptySince: 0, reports: new Map() };
  worlds.set(r.id, r);
  return r;
}

function join(c: MClient, r: WorldRoom) {
  if (c.world) leave(c);
  if (r.clients.size >= MAX_PLAYERS) return send(c, { t: 'error', msg: `${r.name} está lleno (${MAX_PLAYERS}/${MAX_PLAYERS}). Elige otro mundo.` });
  // Nadie elige nada: el servidor reparte los dos aspectos por turnos y numera a los jugadores
  const used = new Set([...r.clients.values()].map((x) => x.name));
  let n = 1; while (used.has(`Jugador ${n}`)) n++;
  c.name = `Jugador ${n}`;
  c.look = n % 2 ? 'coloso' : 'halcon';
  r.clients.set(c.pid, c); c.world = r; c.paused = false; c.lastInput = Date.now();
  addPlayer(r.game, c.pid, c.name, c.look);
  r.emptySince = 0;
  send(c, { t: 'mjoined', you: c.pid, world: { id: r.id, name: r.name, seed: r.game.seed }, edits: [...r.game.world.edits].flat() });
}

export function leave(c: MClient) {
  const r = c.world;
  if (!r) return;
  r.clients.delete(c.pid);
  removePlayer(r.game, c.pid);
  c.world = null; c.paused = false; c.open = null;
  if (r.clients.size === 0) { r.emptySince = Date.now(); r.game.events.length = 0; r.game.changes.length = 0; }
}

function tick(r: WorldRoom) {
  if (r.clients.size === 0) {
    if (r.emptySince && Date.now() - r.emptySince > KEEP_EMPTY_MS) worlds.delete(r.id);
    return;
  }
  const g = r.game, now = Date.now();
  for (const c of r.clients.values()) {
    const p = getPlayer(g, c.pid);
    if (!p) continue;
    p.away = c.paused;
    if (now - c.lastInput > 1500) { p.input.mx = 0; p.input.mz = 0; p.input.attack = false; p.input.jump = false; } // red caída o pestaña oculta
  }
  // Si todos los que están en el mundo han pausado, el mundo se detiene de verdad.
  if (!roomPaused([...r.clients.values()].map((x) => x.paused))) step(g, 1 / TICK_HZ);
  r.tick++;
  // Cada 10 s, olvidar los trozos lejos de todos (el mundo no tiene bordes; los cambios se guardan aparte)
  if (r.tick % (TICK_HZ * 10) === 0) g.world.unloadAwayFrom(g.players.map((p) => [p.body.x, p.body.z]), 8);
  const events = g.events.splice(0), changes = g.changes.splice(0);
  for (const c of r.clients.values())
    if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 512 * 1024)
      c.ws.send(JSON.stringify({ t: 'ms', s: encodeSnapshot(g, r.tick, c.pid, events, changes, openBox(c)) } satisfies MServerMsg));
}
setInterval(() => { for (const r of worlds.values()) tick(r); }, 1000 / TICK_HZ);

/** El horno o cofre que tiene abierto el jugador, si sigue existiendo. */
function openBox(c: MClient) {
  const g = c.world?.game;
  if (!g || !c.open) return undefined;
  const [x, y, z] = c.open;
  const box = getBox(g, x, y, z);
  if (!box) { c.open = null; return undefined; }
  return { x, y, z, ...box };
}

/** Denuncias: se guarda lo mínimo (nombre denunciado, mundo, fecha). Con varias de jugadores distintos, se le retira. */
function report(c: MClient, targetPid: string, save: (entry: object) => void) {
  const r = c.world;
  if (!r || targetPid === c.pid) return;
  const target = r.clients.get(targetPid);
  if (!target) return;
  save({ date: new Date().toISOString(), room: r.name, reportedName: target.name, reason: 'conducta' });
  let set = r.reports.get(targetPid);
  if (!set) r.reports.set(targetPid, (set = new Set()));
  set.add(c.pid);
  send(c, { t: 'notice', msg: 'Denuncia enviada. Gracias por ayudar a que el juego sea un buen sitio.' });
  if (set.size >= reportsToKick(r.clients.size, true) && r.clients.size > 1) {
    send(target, { t: 'kicked', msg: 'Has sido retirado del mundo por denuncias de otros jugadores.' });
    leave(target);
    for (const o of r.clients.values()) send(o, { t: 'notice', msg: `${target.name} ha sido retirado del mundo.` });
  }
}

/** Mensajes de Bloques ('m...'). Devuelve false si el mensaje no es de este juego. */
export function onWorldMessage(c: MClient, m: MClientMsg, save: (entry: object) => void): boolean {
  const r = c.world, g = r?.game;
  switch (m.t) {
    case 'mlist': send(c, { t: 'mrooms', rooms: worldList() }); return true;
    case 'mhost':
      if (worlds.size >= MAX_WORLDS) { send(c, { t: 'error', msg: 'No hay sitio para más mundos ahora. Únete a uno de la lista.' }); return true; }
      join(c, createWorld()); return true;
    case 'mjoin': {
      const target = worlds.get(String(m.world));
      if (!target) { send(c, { t: 'error', msg: 'Ese mundo ya no existe. Crea uno nuevo o elige otro de la lista.' }); return true; }
      if (c.world !== target) join(c, target);
      return true;
    }
    case 'min': { const p = g && getPlayer(g, c.pid); if (p) { p.input = clampMInput(m.i); c.lastInput = Date.now(); } return true; }
    case 'mplace': if (g) place(g, c.pid); return true;
    case 'mcraft': if (g && typeof m.r === 'string') craft(g, c.pid, m.r); return true;
    case 'mslot': if (g) selectSlot(g, c.pid, Number(m.s)); return true;
    case 'mswap': if (g) moveSlot(g, c.pid, Math.floor(Number(m.a)), Math.floor(Number(m.b))); return true;
    case 'mrespawn': if (g) respawn(g, c.pid); return true;
    case 'mpause': c.paused = !!m.v; return true;
    case 'mleave': leave(c); return true;
    case 'mcmd': if (g && m.c && typeof m.c === 'object') verityCommand(g, c.pid, m.c as VerityCmd); return true;
    case 'mopen': {
      const [x, y, z] = [m.x, m.y, m.z].map((v) => Math.floor(Number(v)));
      c.open = g && [x, y, z].every(Number.isFinite) && getBox(g, x, y, z) ? [x, y, z] : null;
      return true;
    }
    case 'mclose': c.open = null; return true;
    case 'mbox': if (g && (m.op === 'put' || m.op === 'take')) boxMove(g, c.pid, Math.floor(Number(m.x)), Math.floor(Number(m.y)), Math.floor(Number(m.z)), m.op, Math.floor(Number(m.i))); return true;
    case 'mreport': if (typeof m.pid === 'string') report(c, m.pid, save); return true;
  }
  return false;
}

export { worlds };
