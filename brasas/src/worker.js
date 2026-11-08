// Brasas en Cloudflare: un solo Worker que
//   - sirve el juego (Static Assets, carpeta public/),
//   - crea cuentas sin registro (uid + token; en D1 solo se guarda el hash del token),
//   - guarda documentos JSON en D1 (/api/db/...),
//   - abre las salas en tiempo real (/api/room/<nombre>), una instancia del Durable Object "Sala" por sala.
import { DurableObject } from 'cloudflare:workers';

// Salas que existen. "lobby" es la lista global; el resto son los servidores del juego.
const SERVIDORES = ['bosque-1', 'bosque-2', 'bosque-3', 'bosque-4', 'pinar-1', 'pinar-2', 'cueva-1', 'cueva-2'];
const SALAS = new Set(['lobby', ...SERVIDORES]);
const MAX_JUGADORES = 10;          // por servidor (el juego muestra "Lleno")
const MAX_LOBBY = 300;
const MAX_PRESENCIA = 4096;        // bytes de JSON por jugador
const MAX_MENSAJE = 8192;          // bytes por mensaje de WebSocket
const MAX_DOC = 8192;              // bytes por documento
const MAX_DOCS_USUARIO = 50;
const RITMO = 25, RAFAGA = 50;     // mensajes por segundo y ráfaga permitida por conexión
const MAX_SOBRANTES = 200;         // mensajes descartados por exceso antes de cerrar la conexión
const INACTIVO_MS = 60000;         // sin ningún mensaje (ni latido) en este tiempo, se cierra el socket
const REVISION_MS = 20000;

const UID_RE = /^u[0-9a-f]{24}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const DOC_ID_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/i;

const enc = new TextEncoder();
const bytes = s => enc.encode(s).length;
const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const aleatorio = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); };
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CABECERAS });
const fallo = (code, status) => json({ error: code }, status);

// ------------------------------------------------------------------ cuentas
function leerCredencial(texto) {
  const m = /^(?:Bearer\s+)?(u[0-9a-f]{24})\.([0-9a-f]{64})$/.exec(String(texto || '').trim());
  return m ? { uid: m[1], token: m[2] } : null;
}
async function autenticar(env, texto) {
  const c = leerCredencial(texto);
  if (!c || !UID_RE.test(c.uid) || !TOKEN_RE.test(c.token)) return null;
  const fila = await env.DB.prepare('SELECT token_hash FROM usuarios WHERE uid = ?').bind(c.uid).first();
  if (!fila) return null;
  const hash = await sha256(c.token);
  // Comparación en tiempo constante
  let dif = hash.length ^ fila.token_hash.length;
  for (let i = 0; i < hash.length; i++) dif |= hash.charCodeAt(i) ^ (fila.token_hash.charCodeAt(i) || 0);
  return dif === 0 ? c.uid : null;
}
async function nuevaCuenta(req, env) {
  if (env.LIMITE_CUENTAS) {
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    const { success } = await env.LIMITE_CUENTAS.limit({ key: ip });
    if (!success) return fallo('resource_exhausted', 429);
  }
  const uid = 'u' + aleatorio(12), token = aleatorio(32);
  await env.DB.prepare('INSERT INTO usuarios (uid, token_hash, creado) VALUES (?, ?, ?)')
    .bind(uid, await sha256(token), Date.now()).run();
  return json({ uid, token });
}

// ------------------------------------------------------------------ documentos
// Rutas permitidas:
//   servidores/<id de servidor>         lo leen y escriben todos los jugadores (con cuenta)
//   data/users/<uid>/<id de documento>   solo el dueño de ese uid
function analizarRuta(partes) {
  if (partes.length === 2 && partes[0] === 'servidores') {
    return SERVIDORES.includes(partes[1]) ? { ruta: partes.join('/'), dueno: null } : { error: 'permission_denied' };
  }
  if (partes.length === 4 && partes[0] === 'data' && partes[1] === 'users') {
    if (!UID_RE.test(partes[2]) || !DOC_ID_RE.test(partes[3])) return { error: 'invalid_argument' };
    return { ruta: partes.join('/'), dueno: partes[2] };
  }
  return { error: 'permission_denied' };
}
async function documentos(req, env, uid, resto) {
  let partes;
  try { partes = resto.split('/').map(decodeURIComponent); } catch (e) { return fallo('invalid_argument', 400); }
  if (partes.some(p => !p)) return fallo('invalid_argument', 400);
  const r = analizarRuta(partes);
  if (r.error) return fallo(r.error, r.error === 'invalid_argument' ? 400 : 403);
  if (r.dueno && r.dueno !== uid) return fallo('permission_denied', 403);

  if (req.method === 'GET') {
    const fila = await env.DB.prepare('SELECT datos FROM documentos WHERE ruta = ?').bind(r.ruta).first();
    if (!fila) return fallo('not_found', 404);
    return new Response('{"data":' + fila.datos + '}', { headers: CABECERAS });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM documentos WHERE ruta = ?').bind(r.ruta).run();
    return json({ ok: true });
  }
  if (req.method === 'PUT') {
    const largo = Number(req.headers.get('content-length') || 0);
    if (largo > MAX_DOC) return fallo('invalid_argument', 400);
    const texto = await req.text();
    if (bytes(texto) > MAX_DOC) return fallo('invalid_argument', 400);
    let datos;
    try { datos = JSON.parse(texto); } catch (e) { return fallo('invalid_argument', 400); }
    if (!esObjeto(datos)) return fallo('invalid_argument', 400);
    if (r.dueno) {
      const existe = await env.DB.prepare('SELECT 1 FROM documentos WHERE ruta = ?').bind(r.ruta).first();
      if (!existe) {
        const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM documentos WHERE uid = ?').bind(r.dueno).first();
        if (n && n.n >= MAX_DOCS_USUARIO) return fallo('resource_exhausted', 400);
      }
    }
    await env.DB.prepare(
      'INSERT INTO documentos (ruta, uid, datos, actualizado) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(ruta) DO UPDATE SET datos = excluded.datos, actualizado = excluded.actualizado'
    ).bind(r.ruta, r.dueno, JSON.stringify(datos), Date.now()).run();
    return json({ ok: true });
  }
  return fallo('invalid_argument', 405);
}

// ------------------------------------------------------------------ enrutado
async function api(req, env, url) {
  const p = url.pathname;
  if (p === '/api/user/new' && req.method === 'POST') return nuevaCuenta(req, env);
  if (p === '/api/user/me' && req.method === 'GET') {
    const uid = await autenticar(env, req.headers.get('authorization'));
    return uid ? json({ uid }) : fallo('unauthenticated', 401);
  }
  if (p.startsWith('/api/db/')) {
    const uid = await autenticar(env, req.headers.get('authorization'));
    if (!uid) return fallo('unauthenticated', 401);
    return documentos(req, env, uid, p.slice('/api/db/'.length));
  }
  if (p.startsWith('/api/room/')) {
    if (req.headers.get('upgrade') !== 'websocket') return fallo('invalid_argument', 426);
    let nombre;
    try { nombre = decodeURIComponent(p.slice('/api/room/'.length)); } catch (e) { return fallo('invalid_argument', 400); }
    if (!SALAS.has(nombre)) return fallo('invalid_argument', 404);
    const uid = await autenticar(env, url.searchParams.get('auth'));
    if (!uid) return fallo('unauthenticated', 401);
    const sala = env.SALAS.get(env.SALAS.idFromName(nombre));
    // Solo el Worker puede hablar con el Durable Object, así que estas cabeceras son de fiar.
    const h = new Headers(req.headers);
    h.set('x-brasas-sala', nombre);
    h.set('x-brasas-uid', uid);
    return sala.fetch(new Request('https://sala/' + nombre, { headers: h }));
  }
  return fallo('not_found', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) { console.error(e); return fallo('internal', 500); }
    }
    return env.ASSETS.fetch(req);
  },
};

// ------------------------------------------------------------------ Durable Object: una sala
// Usa la API de hibernación: con la sala tranquila, el objeto se descarga de memoria y los sockets siguen abiertos.
// Lo de cada jugador (peer, uid y presencia si cabe) va en el "attachment" del socket, que sobrevive a la hibernación.
// Si la presencia no cabe (más de ~1,9 KB), al despertar se pide a ese cliente que la reenvíe ("resync").
export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.estado = new Map();      // ws -> { peer, uid, sala, pres, tokens, t, ult, sobrantes }
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    const pedir = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() || {};
      if (!a.peer) continue;
      this.estado.set(ws, { peer: a.peer, uid: a.uid, sala: a.sala, pres: a.pres || {}, tokens: RAFAGA, t: Date.now(), ult: a.ult || Date.now(), sobrantes: 0 });
      if (a.grande) pedir.push(ws);
    }
    for (const ws of pedir) this.enviar(ws, { t: 'resync' });
  }

  enviar(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { /* socket cerrado */ } }
  difundir(obj, excepto) {
    const txt = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) if (ws !== excepto && this.estado.has(ws)) this.enviar(ws, txt);
  }
  guardarAdjunto(ws, s) {
    const pres = JSON.stringify(s.pres);
    const cabe = bytes(pres) <= 1900;
    ws.serializeAttachment({ peer: s.peer, uid: s.uid, sala: s.sala, ult: s.ult, pres: cabe ? s.pres : null, grande: !cabe });
  }

  async fetch(req) {
    const sala = req.headers.get('x-brasas-sala'), uid = req.headers.get('x-brasas-uid');
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    this.ctx.acceptWebSocket(servidor);
    const max = sala === 'lobby' ? MAX_LOBBY : MAX_JUGADORES;
    const ocupados = this.ctx.getWebSockets().filter(ws => ws !== servidor && this.estado.has(ws)).length;
    if (!sala || !SALAS.has(sala)) { servidor.close(4003, 'sala no valida'); return new Response(null, { status: 101, webSocket: cliente }); }
    if (ocupados >= max) {
      this.enviar(servidor, { t: 'err', code: 'full' });
      servidor.close(4001, 'llena');
      return new Response(null, { status: 101, webSocket: cliente });
    }
    const s = { peer: 'p' + aleatorio(6), uid, sala, pres: {}, tokens: RAFAGA, t: Date.now(), ult: Date.now(), sobrantes: 0 };
    this.estado.set(servidor, s);
    this.guardarAdjunto(servidor, s);
    // Quien entra recibe el estado completo; los demás, el aviso de que entró
    const peers = [];
    for (const [ws, o] of this.estado) if (ws !== servidor) peers.push({ peer: o.peer, presence: o.pres });
    this.enviar(servidor, { t: 'state', me: s.peer, peers });
    this.difundir({ t: 'join', peer: s.peer, presence: {} }, servidor);
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + REVISION_MS);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws, msg) {
    const s = this.estado.get(ws);
    if (!s) { try { ws.close(4004, 'desconocido'); } catch (e) { /* ya cerrado */ } return; }
    const ahora = Date.now();
    s.ult = ahora;
    // Límite de mensajes por conexión (cubeta de fichas)
    s.tokens = Math.min(RAFAGA, s.tokens + (ahora - s.t) * RITMO / 1000);
    s.t = ahora;
    if (s.tokens < 1) {
      if (++s.sobrantes > MAX_SOBRANTES) { this.quitar(ws); try { ws.close(1008, 'demasiados mensajes'); } catch (e) { /* ya cerrado */ } }
      return;
    }
    s.tokens -= 1;
    if (typeof msg !== 'string' || msg.length > MAX_MENSAJE) { this.quitar(ws); try { ws.close(1009, 'mensaje demasiado grande'); } catch (e) { /* ya cerrado */ } return; }
    let m;
    try { m = JSON.parse(msg); } catch (e) { return; }
    if (!esObjeto(m)) return;
    if (m.t === 'p' && esObjeto(m.d)) {
      const nueva = Object.assign({}, s.pres), parche = {};
      for (const k of Object.keys(m.d).slice(0, 64)) {
        if (k.length > 64) continue;
        const v = m.d[k];
        if (v === null) { delete nueva[k]; parche[k] = null; } else { nueva[k] = v; parche[k] = v; }
      }
      if (bytes(JSON.stringify(nueva)) > MAX_PRESENCIA) { this.enviar(ws, { t: 'err', code: 'too_big' }); return; }
      s.pres = nueva;
      this.guardarAdjunto(ws, s);
      this.difundir({ t: 'u', peer: s.peer, d: parche }, ws);
    }
  }

  quitar(ws) {
    const s = this.estado.get(ws);
    if (!s) return;
    this.estado.delete(ws);
    this.difundir({ t: 'leave', peer: s.peer }, ws);
  }
  async webSocketClose(ws, code) {
    this.quitar(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'adios'); } catch (e) { /* ya cerrado */ }
  }
  async webSocketError(ws) { this.quitar(ws); }

  // Cierra los sockets que llevan más de un minuto sin mandar nada (ni el latido)
  async alarm() {
    const ahora = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const s = this.estado.get(ws);
      if (!s) continue;
      const auto = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      const ultimo = Math.max(s.ult, auto ? auto.getTime() : 0);
      if (ahora - ultimo > INACTIVO_MS) { this.quitar(ws); try { ws.close(4000, 'inactivo'); } catch (e) { /* ya cerrado */ } }
    }
    if (this.estado.size) await this.ctx.storage.setAlarm(ahora + REVISION_MS);
  }
}
