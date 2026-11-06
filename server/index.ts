// Servidor multijugador de "Frente de Batalla".
// - Sirve la web compilada (dist/) y un WebSocket en /ws.
// - Cada sala ejecuta la MISMA simulación que el modo un jugador (src/shooter/sim.ts): el servidor manda.
// - Salas: una pública principal (siempre existe), públicas creadas por jugadores y privadas con código.
//
// Uso:  npm run build && npm run server      (PORT=8080 por defecto)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  newWorld, step, addPlayer, removePlayer, buy, selectWeapon, useTool, nextWave, IDLE,
  SHOP, WEAPON_ORDER, TOOL_ORDER, type World, type GameEvent,
} from '../src/shooter/sim.ts';
import {
  encode, sanitizeName, clampInput, MAX_PLAYERS, SIM_HZ, SNAPSHOT_EVERY, SHOP_SECONDS, RESTART_SECONDS,
  type ClientMsg, type ServerMsg, type RoomInfo,
} from '../src/shooter/protocol.ts';

const PORT = Number(process.env.PORT) || 8080;
const DIST = resolve(process.env.DIST_DIR || join(import.meta.dirname, '..', 'dist'));
const MAX_ROOMS = 200;
const EMPTY_ROOM_TTL = 60_000;

// ---------------- Salas ----------------

interface Client { ws: WebSocket; pid: string; name: string; room: Room | null; msgs: number; lastInput: number }
interface Room {
  id: string; name: string; code: string | null; isPublic: boolean; main: boolean;
  world: World; clients: Map<string, Client>; ready: Set<string>;
  tick: number; events: GameEvent[]; shopLeft: number; restartLeft: number;
  obstacleSig: string; lastObstacleSend: number; emptySince: number;
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

function roomInfo(r: Room): RoomInfo {
  return { id: r.id, name: r.name, players: r.clients.size, max: MAX_PLAYERS, wave: r.world.wave, main: r.main };
}
const publicRooms = () => [...rooms.values()].filter((r) => r.isPublic).map(roomInfo)
  .sort((a, b) => Number(b.main) - Number(a.main) || b.players - a.players);

function send(c: Client, msg: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function joinRoom(c: Client, room: Room) {
  if (c.room) leaveRoom(c);
  if (room.clients.size >= MAX_PLAYERS) return send(c, { t: 'error', msg: 'La sala está llena.' });
  // Si la partida había terminado y no queda nadie, empieza una nueva.
  if (room.clients.size === 0) resetRoom(room);
  room.clients.set(c.pid, c);
  c.room = room;
  room.emptySince = 0;
  const p = addPlayer(room.world, c.pid, c.name);
  if (room.world.over || room.world.phase === 'shop') { /* entra igualmente; jugará la próxima oleada */ }
  if (room.world.phase === 'fight' && room.world.wave > 0) p.invuln = 3;
  room.obstacleSig = ''; // fuerza a mandar obstáculos al nuevo
  send(c, { t: 'joined', you: c.pid, room: { id: room.id, name: room.name, code: room.code, public: room.isPublic } });
}

function leaveRoom(c: Client) {
  const room = c.room;
  if (!room) return;
  room.clients.delete(c.pid);
  room.ready.delete(c.pid);
  removePlayer(room.world, c.pid);
  c.room = null;
  if (room.clients.size === 0) room.emptySince = Date.now();
}

function resetRoom(room: Room) {
  const keep = [...room.clients.values()].map((c) => ({ id: c.pid, name: c.name }));
  room.world = newWorld(Math.random, true, keep);
  room.ready.clear();
  room.shopLeft = 0; room.restartLeft = 0;
  room.obstacleSig = '';
}

function startWave(room: Room) {
  room.ready.clear();
  room.shopLeft = 0;
  nextWave(room.world);
  room.events.push(...room.world.events);
  room.world.events.length = 0;
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

  // Obstáculos: solo cuando cambian (cajas rotas, barricadas) o cada 3 s por si acaso
  const sig = w.obstacles.length + ':' + w.obstacles.reduce((a, o) => a + (Number.isFinite(o.hp) ? o.hp : 0), 0);
  const now = Date.now();
  const withObstacles = sig !== room.obstacleSig || now - room.lastObstacleSend > 3000;
  if (withObstacles) { room.obstacleSig = sig; room.lastObstacleSend = now; }
  const msg = JSON.stringify({ t: 's', s: encode(w, room.tick, { ready: room.ready, shopLeft: room.shopLeft, restartLeft: room.restartLeft, events: room.events, withObstacles }) } satisfies ServerMsg);
  room.events = [];
  for (const c of room.clients.values()) if (c.ws.readyState === WebSocket.OPEN && c.ws.bufferedAmount < 512 * 1024) c.ws.send(msg);
}

setInterval(() => {
  for (const room of rooms.values()) tickRoom(room);
}, 1000 / SIM_HZ);

// Limpieza de salas vacías (la principal se queda)
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.clients.size === 0 && r.emptySince && now - r.emptySince > EMPTY_ROOM_TTL) {
      if (r.main && [...rooms.values()].filter((x) => x.main).length === 1) continue;
      rooms.delete(r.id);
    }
  }
}, 10_000);

// ---------------- Mensajes ----------------

const VALID_ITEMS = new Set<string>(SHOP.map((s) => s.id));
const VALID_WEAPONS = new Set<string>(WEAPON_ORDER);
const VALID_TOOLS = new Set<string>(TOOL_ORDER);

function onMessage(c: Client, raw: string) {
  if (++c.msgs > 200) return; // límite por segundo (se reinicia abajo)
  let m: ClientMsg;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  const room = c.room, w = room?.world;
  switch (m.t) {
    case 'list': return send(c, { t: 'rooms', rooms: publicRooms() });
    case 'join': {
      c.name = sanitizeName(m.name);
      if (m.main) return joinRoom(c, mainRoom());
      const target = m.code
        ? [...rooms.values()].find((r) => r.code && r.code === String(m.code).toUpperCase().trim())
        : rooms.get(String(m.room));
      if (!target || (!m.code && !target.isPublic)) return send(c, { t: 'error', msg: m.code ? 'No existe ninguna sala con ese código.' : 'Esa sala ya no existe.' });
      return joinRoom(c, target);
    }
    case 'create': {
      c.name = sanitizeName(m.name);
      if (rooms.size >= MAX_ROOMS) return send(c, { t: 'error', msg: 'El servidor está lleno de salas. Prueba más tarde.' });
      const name = sanitizeName(m.roomName) === 'Soldado' ? `Sala de ${c.name}` : sanitizeName(m.roomName);
      return joinRoom(c, createRoom(name, !!m.public));
    }
    case 'leave': return leaveRoom(c);
    case 'in': { const p = w?.players.find((q) => q.id === c.pid); if (p) { p.input = clampInput(m.i); c.lastInput = Date.now(); } return; }
    case 'buy': if (w && w.phase === 'shop' && VALID_ITEMS.has(m.id)) buy(w, m.id, c.pid); return;
    case 'weapon': if (w && VALID_WEAPONS.has(m.id)) selectWeapon(w, m.id, c.pid); return;
    case 'tool':
      if (w && VALID_TOOLS.has(m.id) && useTool(w, m.id, c.pid)) { room!.events.push(...w.events.splice(0)); }
      return;
    case 'ready': if (room && w?.phase === 'shop') room.ready.add(c.pid); return;
  }
}

// ---------------- HTTP + WebSocket ----------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify(publicRooms()));
  }
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  const file = resolve(DIST, path);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); } // nada fuera de dist/
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': path.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado. ¿Has ejecutado "npm run build"?');
  }
}

const http = createServer((req, res) => { void serveStatic(req, res); });
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  const c: Client = { ws, pid: makeId(), name: 'Soldado', room: null, msgs: 0, lastInput: 0 };
  const reset = setInterval(() => (c.msgs = 0), 1000);
  ws.on('message', (data) => onMessage(c, data.toString()));
  ws.on('close', () => { clearInterval(reset); leaveRoom(c); });
  ws.on('error', () => ws.close());
});

mainRoom(); // la sala principal existe desde el arranque
http.listen(PORT, () => {
  console.log(`Frente de Batalla: servidor en http://localhost:${PORT}  (WebSocket en /ws, sirviendo ${DIST})`);
});

export { rooms }; // para pruebas
