// Servidor del modo cooperativo en línea de Shooter 2027.
// - Sirve la web compilada (dist/) y un WebSocket en /ws.
// - Cada sala ejecuta la MISMA simulación que el modo de un jugador (src/shooter/sim.ts): el servidor manda.
// - Salas: una pública principal (siempre existe), públicas creadas por jugadores y privadas con código.
// - Moderación: nombres filtrados (jugadores y salas públicas), denuncias guardadas 30 días como máximo
//   (sin identidad ni IP del denunciante) y retirada automática tras varias denuncias de jugadores distintos.
//
// Uso:  npm run build && npm run server      (PORT=8080 por defecto; REPORTS_FILE para el fichero de denuncias)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat, appendFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  newWorld, step, addPlayer, removePlayer, buy, selectWeapon, useTool, nextWave, build, IDLE, isCharacter, type CharacterId,
  SHOP, WEAPON_ORDER, TOOL_ORDER, BUILDS, type World, type GameEvent,
} from '../src/shooter/sim.ts';
import {
  encode, clampInput, findFriendRooms, MAX_PLAYERS, SIM_HZ, SNAPSHOT_EVERY, SHOP_SECONDS, RESTART_SECONDS, reportsToKick,
  type ClientMsg, type ServerMsg, type RoomInfo,
} from '../src/shooter/protocol.ts';
import { checkName, normalizeForFilter, nameKey } from '../src/shooter/moderation.ts';

const PORT = Number(process.env.PORT) || 8080;
const DIST = resolve(process.env.DIST_DIR || join(import.meta.dirname, '..', 'dist'));
const REPORTS_FILE = resolve(process.env.REPORTS_FILE || join(import.meta.dirname, 'reports.jsonl'));
const REPORT_TTL_MS = 30 * 24 * 3600 * 1000; // la política de privacidad promete 30 días como máximo
const MAX_ROOMS = 200;
const EMPTY_ROOM_TTL = 60_000;

// ---------------- Salas ----------------

interface Client { ws: WebSocket; pid: string; name: string; character: CharacterId; room: Room | null; msgs: number; lastInput: number; lastFind: number }
interface Room {
  id: string; name: string; code: string | null; isPublic: boolean; main: boolean;
  world: World; clients: Map<string, Client>; ready: Set<string>;
  tick: number; events: GameEvent[]; shopLeft: number; restartLeft: number;
  obstacleSig: string; lastObstacleSend: number; emptySince: number;
  /** Denuncias recibidas en esta sala: pid denunciado -> pids que lo denunciaron. */
  reports: Map<string, Set<string>>;
  /** Nombres retirados de esta sala por denuncias (normalizados). */
  bannedNames: Set<string>;
}

const rooms = new Map<string, Room>();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para que no se confundan
const makeCode = () => Array.from(randomBytes(5), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const makeId = () => randomBytes(6).toString('hex');

function createRoom(name: string, isPublic: boolean, main = false): Room {
  const room: Room = {
    id: makeId(), name, code: isPublic ? null : makeCode(), isPublic, main,
    world: newWorld(Math.random, true, []), clients: new Map(), ready: new Set(),
    tick: 0, events: [], shopLeft: 0, restartLeft: 0, obstacleSig: '', lastObstacleSend: 0, emptySince: Date.now(),
    reports: new Map(), bannedNames: new Set(),
  };
  rooms.set(room.id, room);
  return room;
}

/** Sala pública principal con hueco (si está llena, abre otra). */
function mainRoom(): Room {
  const mains = [...rooms.values()].filter((r) => r.main);
  const free = mains.find((r) => r.clients.size < MAX_PLAYERS);
  return free ?? createRoom(mains.length ? `Servidor principal ${mains.length + 1}` : 'Servidor principal', true, true);
}

const roomInfo = (r: Room): RoomInfo => ({ id: r.id, name: r.name, players: r.clients.size, max: MAX_PLAYERS, wave: r.world.wave, main: r.main });
const publicRooms = () => [...rooms.values()].filter((r) => r.isPublic).map(roomInfo)
  .sort((a, b) => Number(b.main) - Number(a.main) || b.players - a.players);

function send(c: Client, msg: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function joinRoom(c: Client, room: Room) {
  if (c.room) leaveRoom(c);
  if (room.clients.size >= MAX_PLAYERS) return send(c, { t: 'error', msg: 'La sala está llena.' });
  if (room.bannedNames.has(normalizeForFilter(c.name))) return send(c, { t: 'error', msg: 'Ese nombre fue retirado de esta sala por denuncias. Usa otro.' });
  if (room.clients.size === 0) resetRoom(room); // sala vacía: partida nueva
  room.clients.set(c.pid, c);
  c.room = room;
  room.emptySince = 0;
  const p = addPlayer(room.world, c.pid, c.name, c.character);
  if (room.world.phase === 'fight' && room.world.wave > 0) p.invuln = 3;
  room.obstacleSig = ''; // fuerza a mandar los obstáculos al que entra
  send(c, { t: 'joined', you: c.pid, room: { id: room.id, name: room.name, code: room.code, public: room.isPublic } });
}

function leaveRoom(c: Client) {
  const room = c.room;
  if (!room) return;
  room.clients.delete(c.pid);
  room.ready.delete(c.pid);
  removePlayer(room.world, c.pid);
  room.events.push(...room.world.events.splice(0));
  c.room = null;
  if (room.clients.size === 0) room.emptySince = Date.now();
}

function resetRoom(room: Room) {
  const keep = [...room.clients.values()].map((c) => ({ id: c.pid, name: c.name, character: c.character }));
  room.world = newWorld(Math.random, true, keep);
  room.ready.clear();
  room.shopLeft = 0; room.restartLeft = 0;
  room.obstacleSig = '';
}

function startWave(room: Room) {
  room.ready.clear();
  room.shopLeft = 0;
  nextWave(room.world);
  room.events.push(...room.world.events.splice(0));
}

// ---------------- Denuncias ----------------

/** Borra las denuncias de más de 30 días (al arrancar y cada hora). */
async function purgeOldReports() {
  if (!existsSync(REPORTS_FILE)) return;
  const now = Date.now();
  const keep = readFileSync(REPORTS_FILE, 'utf8').split('\n').filter((line) => {
    try { return line && now - Date.parse(JSON.parse(line).date) < REPORT_TTL_MS; } catch { return false; }
  });
  await writeFile(REPORTS_FILE, keep.length ? keep.join('\n') + '\n' : '');
}

async function report(c: Client, targetPid: string, reason: string) {
  const room = c.room;
  if (!room || targetPid === c.pid) return;
  const target = room.clients.get(targetPid);
  if (!target) return;
  // Se guarda lo mínimo para revisar la denuncia: nombre denunciado, sala, motivo y fecha.
  // No se guarda quién denuncia ni ninguna dirección IP.
  const entry = { date: new Date().toISOString(), room: room.name, reportedName: target.name, reason: reason === 'conducta' ? 'conducta' : 'nombre' };
  await appendFile(REPORTS_FILE, JSON.stringify(entry) + '\n').catch(() => { /* sin disco: la denuncia cuenta igualmente en la sala */ });
  let set = room.reports.get(targetPid);
  if (!set) room.reports.set(targetPid, (set = new Set()));
  set.add(c.pid);
  send(c, { t: 'notice', msg: 'Denuncia enviada. Gracias por ayudar a que el juego sea un buen sitio.' });
  // Varias denuncias de jugadores distintos: se retira al jugador y su nombre queda vetado en esta sala.
  const needed = reportsToKick(room.clients.size, room.isPublic);
  if (set.size >= needed && room.clients.size > 1) {
    room.bannedNames.add(normalizeForFilter(target.name));
    send(target, { t: 'kicked', msg: 'Has sido retirado de la sala por denuncias de otros jugadores.' });
    leaveRoom(target);
    for (const other of room.clients.values()) send(other, { t: 'notice', msg: `${target.name} ha sido retirado de la sala.` });
  }
}

// ---------------- Bucle de simulación ----------------

const DT = 1 / SIM_HZ;
function tickRoom(room: Room) {
  if (room.clients.size === 0) return;
  const w = room.world;
  room.tick++;
  if (w.over) {
    room.restartLeft -= DT;
    if (room.restartLeft <= 0) resetRoom(room);
  } else if (w.phase === 'shop') {
    room.shopLeft -= DT;
    const allReady = [...room.clients.keys()].every((id) => room.ready.has(id));
    if (room.shopLeft <= 0 || allReady) startWave(room);
  } else {
    // Quien lleva >1 s sin mandar nada (pestaña oculta, red caída) se queda quieto y sin disparar.
    const now = Date.now();
    for (const c of room.clients.values()) if (now - c.lastInput > 1000) {
      const p = w.players.find((q) => q.id === c.pid);
      if (p) p.input = IDLE;
    }
    step(w, null, DT);
    for (const ev of w.events) {
      room.events.push(ev);
      if (ev.kind === 'waveCleared') room.shopLeft = SHOP_SECONDS;
      if (ev.kind === 'gameover') room.restartLeft = RESTART_SECONDS;
    }
  }
  if (room.tick % SNAPSHOT_EVERY !== 0) return;

  // Obstáculos: solo cuando cambian (cajas rotas, construcciones, daños) o cada 3 s por si acaso
  const sig = w.obstacles.length + ':' + w.obstacles.reduce((a, o) => a + (Number.isFinite(o.hp) ? Math.round(o.hp) : 0), 0);
  const now = Date.now();
  const withObstacles = sig !== room.obstacleSig || now - room.lastObstacleSend > 3000;
  if (withObstacles) { room.obstacleSig = sig; room.lastObstacleSend = now; }
  const msg = JSON.stringify({ t: 's', s: encode(w, room.tick, { ready: room.ready, shopLeft: room.shopLeft, restartLeft: room.restartLeft, events: room.events, withObstacles }) } satisfies ServerMsg);
  room.events = [];
  for (const c of room.clients.values()) if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 512 * 1024) c.ws.send(msg);
}

setInterval(() => { for (const room of rooms.values()) tickRoom(room); }, 1000 / SIM_HZ);

// Limpieza: salas vacías (la principal se queda) y denuncias caducadas
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.clients.size === 0 && r.emptySince && now - r.emptySince > EMPTY_ROOM_TTL) {
      if (r.main && [...rooms.values()].filter((x) => x.main).length === 1) continue;
      rooms.delete(r.id);
    }
  }
}, 10_000);
setInterval(() => void purgeOldReports(), 3600_000);

// ---------------- Mensajes ----------------

const VALID_ITEMS = new Set<string>(SHOP.map((s) => s.id));
const VALID_WEAPONS = new Set<string>(WEAPON_ORDER);
const VALID_TOOLS = new Set<string>(TOOL_ORDER);
const VALID_BUILDS = new Set<string>(BUILDS.map((b) => b.id));

/** Comprueba el nombre del jugador; si no vale, avisa y devuelve false. */
function acceptName(c: Client, raw: unknown): boolean {
  const check = checkName(raw, 'jugador');
  if (!check.ok) { send(c, { t: 'error', msg: check.reason }); return false; }
  c.name = check.name;
  return true;
}

function onMessage(c: Client, raw: string) {
  if (++c.msgs > 200) return; // límite de mensajes por segundo (se reinicia cada segundo)
  let m: ClientMsg;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  const room = c.room, w = room?.world;
  switch (m.t) {
    case 'list': return send(c, { t: 'rooms', rooms: publicRooms() });
    case 'find': {
      // Buscar a un amigo por su nombre (solo salas públicas; como mucho una búsqueda por segundo)
      const now = Date.now();
      if (now - c.lastFind < 1000) return;
      c.lastFind = now;
      const key = nameKey(m.name);
      const found = findFriendRooms([...rooms.values()].map((r) => ({
        info: roomInfo(r), isPublic: r.isPublic, playerKeys: [...r.clients.values()].filter((x) => x !== c).map((x) => nameKey(x.name)),
      })), key);
      return send(c, { t: 'found', name: String(m.name ?? '').slice(0, 16), rooms: found });
    }
    case 'join': {
      if (!acceptName(c, m.name)) return;
      c.character = isCharacter(m.character) ? m.character : 'sargento'; // nunca confiar en el cliente
      if (m.main) return joinRoom(c, mainRoom());
      const target = m.code
        ? [...rooms.values()].find((r) => r.code && r.code === String(m.code).toUpperCase().trim())
        : rooms.get(String(m.room));
      if (!target || (!m.code && !target.isPublic)) return send(c, { t: 'error', msg: m.code ? 'No existe ninguna sala con ese código.' : 'Esa sala ya no existe.' });
      return joinRoom(c, target);
    }
    case 'create': {
      if (!acceptName(c, m.name)) return;
      c.character = isCharacter(m.character) ? m.character : 'sargento'; // nunca confiar en el cliente
      if (rooms.size >= MAX_ROOMS) return send(c, { t: 'error', msg: 'El servidor tiene demasiadas salas. Prueba más tarde.' });
      let name = `Sala de ${c.name}`;
      if (String(m.roomName ?? '').trim()) {
        const check = checkName(m.roomName, 'sala'); // las salas públicas aparecen en la lista: también se filtran
        if (!check.ok) return send(c, { t: 'error', msg: check.reason });
        name = check.name;
      }
      return joinRoom(c, createRoom(name, !!m.public));
    }
    case 'leave': return leaveRoom(c);
    case 'in': { const p = w?.players.find((q) => q.id === c.pid); if (p) { p.input = clampInput(m.i); c.lastInput = Date.now(); } return; }
    case 'buy': if (w && w.phase === 'shop' && VALID_ITEMS.has(m.id)) buy(w, m.id, c.pid); return;
    case 'weapon': if (w && VALID_WEAPONS.has(m.id)) selectWeapon(w, m.id, c.pid); return;
    case 'tool': if (w && VALID_TOOLS.has(m.id) && useTool(w, m.id, c.pid)) room!.events.push(...w.events.splice(0)); return;
    case 'build': if (w && VALID_BUILDS.has(m.id) && build(w, m.id, c.pid)) room!.events.push(...w.events.splice(0)); return;
    case 'ready': if (room && w?.phase === 'shop') room.ready.add(c.pid); return;
    case 'report': if (typeof m.pid === 'string') void report(c, m.pid, String(m.reason)); return;
  }
}

// ---------------- HTTP + WebSocket ----------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  const file = resolve(DIST, path);
  if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403); return res.end(); } // nada fuera de dist/
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado. ¿Has ejecutado "npm run build"?');
  }
}

const http = createServer((req, res) => { void serveStatic(req, res); });
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  const c: Client = { ws, pid: makeId(), name: 'Soldado', character: 'sargento', room: null, msgs: 0, lastInput: 0, lastFind: 0 };
  const reset = setInterval(() => (c.msgs = 0), 1000);
  ws.on('message', (data) => onMessage(c, data.toString()));
  ws.on('close', () => { clearInterval(reset); leaveRoom(c); });
  ws.on('error', () => ws.close());
});

mainRoom(); // la sala principal existe desde el arranque
void purgeOldReports();
http.listen(PORT, () => {
  console.log(`Shooter 2027: servidor en http://localhost:${PORT}  (WebSocket en /ws, sirviendo ${DIST})`);
});

export { rooms }; // para pruebas
