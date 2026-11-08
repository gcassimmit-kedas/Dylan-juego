// Servidor del modo cooperativo en línea de Shooter 2027.
// - Sirve la web compilada (dist/) y un WebSocket en /ws.
// - Cada sala ejecuta la MISMA simulación que el modo de un jugador (src/shooter/sim.ts): el servidor manda.
// - Servidores: una lista fija (Alfa, Bravo...) de hasta MAX_PLAYERS jugadores cada uno; se entra tocando uno.
// - Los jugadores no escriben nada: el nombre es automático (su soldado y un número).
// - Denuncias guardadas 30 días como máximo (sin identidad ni IP del denunciante) y retirada automática
//   tras varias denuncias de jugadores distintos.
//
// Uso:  npm run build && npm run server      (PORT=8080 por defecto; REPORTS_FILE para el fichero de denuncias)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat, appendFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  newWorld, step, addPlayer, removePlayer, buy, selectWeapon, useTool, nextWave, build, IDLE, isCharacter, CHARACTERS, type CharacterId,
  SHOP, WEAPON_ORDER, TOOL_ORDER, BUILDS, type World, type GameEvent,
} from '../src/shooter/sim.ts';
import {
  encode, clampInput, roomState, MAX_PLAYERS, SIM_HZ, SNAPSHOT_EVERY, SHOP_SECONDS, RESTART_SECONDS, reportsToKick,
  type ClientMsg, type ServerMsg, type RoomInfo,
} from '../src/shooter/protocol.ts';

const PORT = Number(process.env.PORT) || 8080;
const DIST = resolve(process.env.DIST_DIR || join(import.meta.dirname, '..', 'dist'));
const REPORTS_FILE = resolve(process.env.REPORTS_FILE || join(import.meta.dirname, 'reports.jsonl'));
const REPORT_TTL_MS = 30 * 24 * 3600 * 1000; // la política de privacidad promete 30 días como máximo

// ---------------- Salas ----------------

interface Client { ws: WebSocket; pid: string; name: string; character: CharacterId; room: Room | null; msgs: number; lastInput: number }
interface Room {
  id: string; name: string;
  world: World; clients: Map<string, Client>; ready: Set<string>;
  tick: number; events: GameEvent[]; shopLeft: number; restartLeft: number;
  obstacleSig: string; lastObstacleSend: number;
  /** Denuncias recibidas en esta sala: pid denunciado -> pids que lo denunciaron. */
  reports: Map<string, Set<string>>;
}

const rooms = new Map<string, Room>();
const makeId = () => randomBytes(6).toString('hex');

/** Lista fija de servidores (SERVERS=Alfa,Bravo,... para cambiarla). */
const SERVER_NAMES = (process.env.SERVERS || 'Alfa,Bravo,Charlie,Delta,Eco,Foxtrot').split(',').map((n) => n.trim()).filter(Boolean).slice(0, 20);
for (const name of SERVER_NAMES) {
  const id = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  rooms.set(id, {
    id, name: `Servidor ${name}`, world: newWorld(Math.random, true, []), clients: new Map(), ready: new Set(),
    tick: 0, events: [], shopLeft: 0, restartLeft: 0, obstacleSig: '', lastObstacleSend: 0, reports: new Map(),
  });
}

const roomInfo = (r: Room): RoomInfo => ({ id: r.id, name: r.name, players: r.clients.size, max: MAX_PLAYERS, wave: r.world.wave, state: roomState(r.clients.size, r.world) });
const serverList = () => [...rooms.values()].map(roomInfo);

/** Nombre automático: el soldado y el primer número libre en la sala ("Coloso 2"). */
function autoName(room: Room, character: CharacterId): string {
  const base = CHARACTERS[character].name;
  const used = new Set([...room.clients.values()].map((x) => x.name));
  for (let n = 1; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

function send(c: Client, msg: ServerMsg) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
}

function joinRoom(c: Client, room: Room) {
  if (c.room) leaveRoom(c);
  if (room.clients.size >= MAX_PLAYERS) return send(c, { t: 'error', msg: `${room.name} está lleno (${MAX_PLAYERS}/${MAX_PLAYERS}). Elige otro.` });
  if (room.clients.size === 0) resetRoom(room); // servidor vacío: partida nueva
  c.name = autoName(room, c.character);
  room.clients.set(c.pid, c);
  c.room = room;
  const p = addPlayer(room.world, c.pid, c.name, c.character);
  if (room.world.phase === 'fight' && room.world.wave > 0) p.invuln = 3;
  room.obstacleSig = ''; // fuerza a mandar los obstáculos al que entra
  send(c, { t: 'joined', you: c.pid, room: { id: room.id, name: room.name } });
}

function leaveRoom(c: Client) {
  const room = c.room;
  if (!room) return;
  room.clients.delete(c.pid);
  room.ready.delete(c.pid);
  removePlayer(room.world, c.pid);
  room.events.push(...room.world.events.splice(0));
  c.room = null;
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
  const entry = { date: new Date().toISOString(), room: room.name, reportedName: target.name, reason: 'conducta' };
  await appendFile(REPORTS_FILE, JSON.stringify(entry) + '\n').catch(() => { /* sin disco: la denuncia cuenta igualmente en la sala */ });
  let set = room.reports.get(targetPid);
  if (!set) room.reports.set(targetPid, (set = new Set()));
  set.add(c.pid);
  send(c, { t: 'notice', msg: 'Denuncia enviada. Gracias por ayudar a que el juego sea un buen sitio.' });
  // Varias denuncias de jugadores distintos: se retira al jugador del servidor.
  const needed = reportsToKick(room.clients.size, true);
  if (set.size >= needed && room.clients.size > 1) {
    send(target, { t: 'kicked', msg: 'Has sido retirado del servidor por denuncias de otros jugadores.' });
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
setInterval(() => void purgeOldReports(), 3600_000);

// ---------------- Mensajes ----------------

const VALID_ITEMS = new Set<string>(SHOP.map((s) => s.id));
const VALID_WEAPONS = new Set<string>(WEAPON_ORDER);
const VALID_TOOLS = new Set<string>(TOOL_ORDER);
const VALID_BUILDS = new Set<string>(BUILDS.map((b) => b.id));

function onMessage(c: Client, raw: string) {
  if (++c.msgs > 200) return; // límite de mensajes por segundo (se reinicia cada segundo)
  let m: ClientMsg;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  const room = c.room, w = room?.world;
  switch (m.t) {
    case 'list': return send(c, { t: 'rooms', rooms: serverList() });
    case 'join': {
      c.character = isCharacter(m.character) ? m.character : 'sargento'; // nunca confiar en el cliente
      const target = rooms.get(String(m.room));
      if (!target) return send(c, { t: 'error', msg: 'Ese servidor no existe.' });
      if (c.room === target) return;
      return joinRoom(c, target);
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
  const c: Client = { ws, pid: makeId(), name: 'Soldado', character: 'sargento', room: null, msgs: 0, lastInput: 0 };
  const reset = setInterval(() => (c.msgs = 0), 1000);
  ws.on('message', (data) => onMessage(c, data.toString()));
  ws.on('close', () => { clearInterval(reset); leaveRoom(c); });
  ws.on('error', () => ws.close());
});

void purgeOldReports();
http.listen(PORT, () => {
  console.log(`Shooter 2027: servidor en http://localhost:${PORT}  (WebSocket en /ws, sirviendo ${DIST})`);
});

export { rooms }; // para pruebas
