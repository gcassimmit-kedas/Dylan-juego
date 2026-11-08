// Brasas: implementa window.claude.use('room' | 'db' | 'user') sobre el Worker de Cloudflare de este mismo sitio,
// para que el juego funcione igual que dentro de Claude sin reescribir su lógica.
//   room: lobby global + salas con nombre (WebSocket con el Durable Object "Sala").
//   db:   documentos JSON en D1 a través de /api/db/<ruta>.
//   user: identificador estable del jugador (cuenta sin registro: uid + token guardados en este navegador).
// Este archivo nunca inserta HTML: todo lo que llega de otros jugadores se entrega como datos.
(function () {
  'use strict';
  if (window.claude && typeof window.claude.use === 'function') return;   // dentro de Claude se usa la API real

  const K_UID = 'brasas_uid', K_TOKEN = 'brasas_token';
  const CODIGO_RE = /^(u[0-9a-f]{24})\.([0-9a-f]{64})$/;
  const SALA_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
  const MAX_PRESENCIA = 4096;           // bytes de JSON, igual que el servidor
  const ENVIO_MIN_MS = 50;              // como mucho ~20 envíos de presencia por segundo
  const PING_MS = 20000;                // latido para que el servidor no cierre el socket por inactividad
  const ESPERA_LOBBY_MS = 12000;        // si el lobby no responde en este tiempo, el juego queda en modo solo
  const ESPERA_SALA_MS = 12000;

  const error = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  const bytes = s => new TextEncoder().encode(s).length;
  const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  // ------------------------------------------------------------------ cuenta
  let cuentaMem = null, cuentaP = null;
  function leerCuenta() {
    if (cuentaMem) return cuentaMem;
    try {
      const uid = localStorage.getItem(K_UID), token = localStorage.getItem(K_TOKEN);
      if (uid && token && CODIGO_RE.test(uid + '.' + token)) return { uid, token };
    } catch (e) { /* sin almacenamiento: la cuenta vive solo en memoria */ }
    return null;
  }
  function escribirCuenta(c) {
    cuentaMem = c;
    try { localStorage.setItem(K_UID, c.uid); localStorage.setItem(K_TOKEN, c.token); } catch (e) { /* sin almacenamiento */ }
  }
  const auth = c => 'Bearer ' + c.uid + '.' + c.token;
  function cuenta() {
    if (cuentaP) return cuentaP;
    cuentaP = (async () => {
      const guardada = leerCuenta();
      if (guardada) {
        let r = null;
        try { r = await fetch('/api/user/me', { headers: { authorization: auth(guardada) } }); } catch (e) { /* sin red */ }
        if (r && r.ok) { cuentaMem = guardada; return guardada; }
        if (!r || r.status !== 401) throw error('unavailable');   // sin red o servidor caído: se conserva la cuenta
        // 401: la cuenta ya no existe en el servidor; se crea una nueva
      }
      const r = await fetch('/api/user/new', { method: 'POST' });
      if (!r.ok) throw error(r.status === 429 ? 'resource_exhausted' : 'unavailable');
      const c = await r.json();
      if (!c || !CODIGO_RE.test(c.uid + '.' + c.token)) throw error('unavailable');
      escribirCuenta({ uid: c.uid, token: c.token });
      return cuentaMem;
    })();
    cuentaP.catch(() => { cuentaP = null; });   // un fallo de red se puede reintentar más tarde
    return cuentaP;
  }

  // Código de jugador: para recuperar la misma cuenta en otro aparato (lo usa el panel de Servidores).
  window.brasasCuenta = {
    async codigo() { const c = await cuenta(); return c.uid + '.' + c.token; },
    async usar(codigo) {
      const m = CODIGO_RE.exec(String(codigo || '').trim());
      if (!m) throw error('invalid_argument');
      const c = { uid: m[1], token: m[2] };
      const r = await fetch('/api/user/me', { headers: { authorization: auth(c) } });
      if (!r.ok) throw error(r.status === 401 ? 'permission_denied' : 'unavailable');
      escribirCuenta(c);
      cuentaP = Promise.resolve(c);
      return true;
    },
  };

  // ------------------------------------------------------------------ room
  function urlSala(nombre, c) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/api/room/' + encodeURIComponent(nombre) + '?auth=' + encodeURIComponent(c.uid + '.' + c.token);
  }

  // Una conexión a una sala (o al lobby). Se reconecta sola y, al volver, reenvía la presencia completa.
  function Conexion(nombre, maxSinConexionMs) {
    this.nombre = nombre;
    this.maxSinConexion = maxSinConexionMs;
    this.ws = null;
    this.me = null;
    this.otros = new Map();          // peer -> presencia
    this.mia = {};                   // mi presencia completa
    this.pendiente = null;           // parche aún sin enviar
    this.esperandoEnvio = [];        // promesas de presence() que se resuelven al enviar
    this.ultimoEnvio = 0;
    this.timerEnvio = 0;
    this.subs = new Set();
    this.cambio = { joined: new Map(), left: new Map(), updated: new Map() };
    this.timerAviso = 0;
    this.cache = null;
    this.listo = false;
    this.cerrada = false;
    this.caida = 0;                  // desde cuándo no hay conexión
    this.intento = 0;
    this.timerReconexion = 0;
    this.timerPing = 0;
    this.primero = null;             // { ok, ko } de la primera conexión
  }
  Conexion.prototype.abrir = function (espera) {
    return new Promise((ok, ko) => {
      this.primero = { ok, ko };
      const t = setTimeout(() => { if (this.primero) { this.primero = null; this.cerrar(); ko(error('deadline_exceeded')); } }, espera);
      const fin = this.primero;
      this.primero = { ok: v => { clearTimeout(t); fin.ok(v); }, ko: e => { clearTimeout(t); fin.ko(e); } };
      this.conectar();
    });
  };
  Conexion.prototype.conectar = async function () {
    if (this.cerrada) return;
    let c;
    try { c = await cuenta(); } catch (e) { return this.alCaer(); }
    if (this.cerrada) return;
    let ws;
    try { ws = new WebSocket(urlSala(this.nombre, c)); } catch (e) { return this.alCaer(); }
    this.ws = ws;
    ws.onopen = () => {
      if (Object.keys(this.mia).length) this.enviarCrudo({ t: 'p', d: this.mia });   // reenvía la presencia al reconectar
      clearInterval(this.timerPing);
      this.timerPing = setInterval(() => this.enviarCrudoTexto('{"t":"ping"}'), PING_MS);
    };
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!esObjeto(m)) return;
      this.recibir(m);
    };
    ws.onclose = ev => {
      if (this.ws !== ws) return;
      this.ws = null; this.listo = false;
      clearInterval(this.timerPing);
      if (this.cerrada) return;
      if (ev.code === 4001 || ev.code === 4003 || ev.code === 4004) {   // llena, nombre no válido, sin permiso: no se reintenta
        const e = error(ev.code === 4001 ? 'resource_exhausted' : ev.code === 4003 ? 'invalid_argument' : 'permission_denied');
        return this.fallar(e);
      }
      this.alCaer();
    };
  };
  Conexion.prototype.alCaer = function () {
    if (this.cerrada) return;
    this.listo = false;
    if (!this.caida) this.caida = Date.now();
    if (this.primero) { const p = this.primero; this.primero = null; this.cerrar(); return p.ko(error('unavailable')); }
    if (Date.now() - this.caida > this.maxSinConexion) return this.fallar(error('unavailable'));
    const ms = Math.min(8000, 500 * 2 ** this.intento++) * (0.75 + Math.random() * 0.5);
    clearTimeout(this.timerReconexion);
    this.timerReconexion = setTimeout(() => this.conectar(), ms);
  };
  Conexion.prototype.fallar = function (e) {
    const p = this.primero; this.primero = null;
    this.cerrar();
    if (p) return p.ko(e);
    for (const s of this.subs) if (s.onError) { try { s.onError(e); } catch (err) { /* error del juego */ } }
  };
  Conexion.prototype.cerrar = function () {
    this.cerrada = true; this.listo = false;
    clearTimeout(this.timerReconexion); clearTimeout(this.timerEnvio); clearTimeout(this.timerAviso); clearInterval(this.timerPing);
    const ws = this.ws; this.ws = null;
    if (ws) { try { ws.close(1000); } catch (e) { /* ya cerrado */ } }
    for (const r of this.esperandoEnvio.splice(0)) r();
  };
  Conexion.prototype.recibir = function (m) {
    if (m.t === 'state') {
      const antes = this.otros;
      this.me = String(m.me);
      this.otros = new Map();
      for (const p of Array.isArray(m.peers) ? m.peers : []) {
        if (!p || typeof p.peer !== 'string' || p.peer === this.me) continue;
        this.otros.set(p.peer, esObjeto(p.presence) ? p.presence : {});
      }
      // Diferencias con lo que había antes de reconectar
      for (const [peer, pr] of this.otros) {
        if (!antes.has(peer)) this.cambio.joined.set(peer, pr); else this.cambio.updated.set(peer, pr);
      }
      for (const [peer, pr] of antes) if (!this.otros.has(peer)) this.cambio.left.set(peer, pr);
      this.listo = true; this.caida = 0; this.intento = 0;
      this.marcar();
      if (this.primero) { const p = this.primero; this.primero = null; p.ok(this); }
    } else if (m.t === 'join' && typeof m.peer === 'string' && m.peer !== this.me) {
      const pr = esObjeto(m.presence) ? m.presence : {};
      this.otros.set(m.peer, pr);
      this.cambio.left.delete(m.peer);
      this.cambio.joined.set(m.peer, pr);
      this.marcar();
    } else if (m.t === 'leave' && typeof m.peer === 'string') {
      const pr = this.otros.get(m.peer);
      if (!this.otros.delete(m.peer)) return;
      this.cambio.joined.delete(m.peer); this.cambio.updated.delete(m.peer);
      this.cambio.left.set(m.peer, pr || {});
      this.marcar();
    } else if (m.t === 'u' && typeof m.peer === 'string' && esObjeto(m.d)) {
      const pr = this.otros.get(m.peer);
      if (!pr) return;
      for (const k of Object.keys(m.d)) { if (m.d[k] === null) delete pr[k]; else pr[k] = m.d[k]; }
      if (!this.cambio.joined.has(m.peer)) this.cambio.updated.set(m.peer, pr);
      this.marcar();
    } else if (m.t === 'resync') {
      this.enviarCrudo({ t: 'p', d: this.mia });   // el servidor despertó y pide la presencia completa
    } else if (m.t === 'err' && m.code === 'full') {
      this.fallar(error('resource_exhausted', 'sala llena'));   // no se reintenta: el juego ya muestra "Lleno"
    } else if (m.t === 'err' && m.code === 'too_big') {
      console.warn('Brasas: presencia demasiado grande, el servidor la ignoró');
    }
  };
  // Agrupa los avisos: el juego recibe como mucho uno cada 50 ms con todo lo que cambió.
  Conexion.prototype.marcar = function () {
    this.cache = null;
    if (this.timerAviso) return;
    this.timerAviso = setTimeout(() => {
      this.timerAviso = 0;
      const ch = this.cambio;
      this.cambio = { joined: new Map(), left: new Map(), updated: new Map() };
      const lista = mapa => [...mapa].map(([peer, presence]) => ({ peer, sameTab: false, isMe: false, presence }));
      const ev = { peers: this.peers(), joined: lista(ch.joined), left: lista(ch.left), updated: lista(ch.updated) };
      for (const s of this.subs) { try { s.fn(ev); } catch (e) { console.error(e); } }
    }, ENVIO_MIN_MS);
  };
  Conexion.prototype.peers = function () {
    if (!this.cache) {
      const yo = { peer: this.me || 'yo', sameTab: true, isMe: true, presence: this.mia };
      this.cache = [yo].concat([...this.otros].map(([peer, presence]) => ({ peer, sameTab: false, isMe: false, presence })));
    }
    return this.cache.slice();
  };
  Conexion.prototype.presence = function (parche) {
    if (!esObjeto(parche)) return Promise.reject(error('invalid_argument'));
    const nueva = Object.assign({}, this.mia);
    for (const k of Object.keys(parche)) { if (parche[k] === null || parche[k] === undefined) delete nueva[k]; else nueva[k] = parche[k]; }
    let txt;
    try { txt = JSON.stringify(nueva); } catch (e) { return Promise.reject(error('invalid_argument')); }
    if (bytes(txt) > MAX_PRESENCIA) return Promise.reject(error('invalid_argument', 'presencia de más de 4 KB'));
    this.mia = JSON.parse(txt);
    this.cache = null;
    this.pendiente = Object.assign(this.pendiente || {}, JSON.parse(JSON.stringify(parche, (k, v) => v === undefined ? null : v)));
    if (this.cerrada) return Promise.resolve();
    const p = new Promise(r => this.esperandoEnvio.push(r));
    this.programarEnvio();
    return p;
  };
  Conexion.prototype.programarEnvio = function () {
    if (this.timerEnvio) return;
    const espera = Math.max(0, this.ultimoEnvio + ENVIO_MIN_MS - Date.now());
    this.timerEnvio = setTimeout(() => {
      this.timerEnvio = 0;
      if (this.pendiente && this.listo) {
        this.enviarCrudo({ t: 'p', d: this.pendiente });
        this.pendiente = null;
        this.ultimoEnvio = Date.now();
      }
      // Sin conexión: la presencia queda guardada en this.mia y se reenvía entera al reconectar
      if (!this.listo) this.pendiente = null;
      for (const r of this.esperandoEnvio.splice(0)) r();
    }, espera);
  };
  Conexion.prototype.enviarCrudo = function (obj) { this.enviarCrudoTexto(JSON.stringify(obj)); };
  Conexion.prototype.enviarCrudoTexto = function (txt) {
    const ws = this.ws;
    if (ws && ws.readyState === 1) { try { ws.send(txt); } catch (e) { /* se reconectará */ } }
  };
  Conexion.prototype.onPeers = function (fn, onError) {
    const s = { fn: typeof fn === 'function' ? fn : () => {}, onError: typeof onError === 'function' ? onError : null };
    this.subs.add(s);
    return () => { this.subs.delete(s); };
  };
  // Lo que ve el juego: solo los métodos de la API
  Conexion.prototype.api = function (extra) {
    return Object.assign({
      presence: p => this.presence(p),
      peers: () => this.peers(),
      onPeers: (fn, onError) => this.onPeers(fn, onError),
      connected: () => this.listo,
    }, extra || {});
  };

  let roomP = null;
  function room() {
    if (roomP) return roomP;
    roomP = (async () => {
      const lobby = new Conexion('lobby', 45000);
      try { await lobby.abrir(ESPERA_LOBBY_MS); } catch (e) { roomP = null; return null; }
      const salas = new Map();
      return lobby.api({
        async join(nombre) {
          nombre = String(nombre || '');
          if (!SALA_RE.test(nombre) || nombre === 'lobby') throw error('invalid_argument', 'nombre de sala no válido');
          if (salas.has(nombre)) salas.get(nombre).cerrar();
          const c = new Conexion(nombre, 20000);
          await c.abrir(ESPERA_SALA_MS);
          salas.set(nombre, c);
          return c.api({
            async leave() { c.cerrar(); if (salas.get(nombre) === c) salas.delete(nombre); },
          });
        },
      });
    })();
    return roomP;
  }

  // ------------------------------------------------------------------ db
  const RUTA_RE = /^[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)*$/;
  function urlDoc(ruta) { return '/api/db/' + ruta.split('/').map(encodeURIComponent).join('/'); }
  async function peticion(metodo, ruta, cuerpo) {
    if (typeof ruta !== 'string' || !RUTA_RE.test(ruta) || ruta.split('/').length % 2) throw error('invalid_argument', 'ruta no válida');
    const c = await cuenta();
    const op = { method: metodo, headers: { authorization: auth(c) } };
    if (cuerpo !== undefined) { op.headers['content-type'] = 'application/json'; op.body = cuerpo; }
    let r;
    try { r = await fetch(urlDoc(ruta), op); } catch (e) { throw error('unavailable'); }
    if (r.status === 404 && metodo === 'GET') return null;
    if (!r.ok) {
      let code = 'unavailable';
      try { const j = await r.json(); if (j && typeof j.error === 'string') code = j.error; } catch (e) { /* sin cuerpo */ }
      throw error(code);
    }
    return metodo === 'GET' ? r.json() : null;
  }
  function doc(ruta) {
    return {
      async get() {
        const j = await peticion('GET', ruta);
        const datos = j ? j.data : undefined;
        return { exists: !!j, id: ruta.split('/').pop(), data: () => (datos === undefined ? undefined : JSON.parse(JSON.stringify(datos))) };
      },
      async set(obj) {
        if (!esObjeto(obj)) throw error('invalid_argument', 'el documento debe ser un objeto');
        let txt;
        try { txt = JSON.stringify(obj); } catch (e) { throw error('invalid_argument'); }
        if (bytes(txt) > 8192) throw error('invalid_argument', 'documento de más de 8 KB');
        await peticion('PUT', ruta, txt);
      },
      async delete() { await peticion('DELETE', ruta); },
    };
  }
  const db = {
    doc: ruta => doc(String(ruta)),
    collection: ruta => ({ doc: id => doc(String(ruta) + '/' + String(id)) }),
  };

  // ------------------------------------------------------------------ user
  const user = { async id() { return (await cuenta()).uid; } };

  window.claude = {
    async use(nombre) {
      if (nombre === 'room') return room();
      if (nombre === 'db') { try { await cuenta(); return db; } catch (e) { return null; } }
      if (nombre === 'user') { try { await cuenta(); return user; } catch (e) { return null; } }
      return null;
    },
  };
})();
