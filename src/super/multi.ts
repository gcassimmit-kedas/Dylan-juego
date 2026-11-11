// Multijugador de dos personas sobre la capacidad `room` de las páginas publicadas en claude.ai.
// Solo existe ahí: en la app (iOS/Android) y en la web normal `window.claude` no está y el botón
// de Multijugador no aparece.
//
// Todo viaja por "presencia" (un objeto de hasta 4 KiB por jugador que el canal reparte a los demás),
// porque cualquier persona con acceso a la página puede usarla; los "eventos" solo los puede enviar
// quien edita la página.
// - Vestíbulo (sala común): cada anfitrión anuncia su partida { host: { sala, nombre, dia, n } }.
// - Sala de la partida: el anfitrión publica { rol: 'host', pos, snap } y el invitado
//   { rol: 'guest', t, pos, acts }. El anfitrión simula; el invitado dibuja y manda acciones.
import { encodeSnap, decodeSnap, parseAccion, type Accion, type SnapExtra } from './sync.ts';
import type { GameState } from './sim.ts';

// ---------- Tipos mínimos de la capacidad (ver la documentación del contrato) ----------
interface Peer { peer: string; isMe: boolean; sameTab: boolean; presence: Readonly<Record<string, unknown>> }
interface Channel {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly Peer[];
  onPeers(fn: (c: { peers: readonly Peer[] }) => void, onError?: (e: { code: string }) => void): () => void;
  connected(): boolean;
}
interface NamedRoom extends Channel { readonly name: string; leave(): Promise<void> }
interface RoomApi extends Channel { join(name: string): Promise<NamedRoom> }

let roomPromise: Promise<RoomApi | null> | null = null;
/** La sala común, o null si esta página no puede conectarse (fuera de claude.ai, sin sesión, etc.). */
export function getRoom(): Promise<RoomApi | null> {
  if (roomPromise) return roomPromise;
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  roomPromise = claude?.use ? claude.use('room').then((r) => (r as RoomApi | null) ?? null).catch(() => null) : Promise.resolve(null);
  return roomPromise;
}

/** Servidores fijos: siempre están en la lista, aunque no haya nadie. Los nombres los pone el juego. */
export const SERVERS = Array.from({ length: 6 }, (_, i) => ({ sala: `servidor-${i + 1}`, nombre: `Servidor ${i + 1}` }));

export interface ServerInfo { sala: string; nombre: string; /** Jugadores dentro: 0, 1 o 2. */ n: 0 | 1 | 2; /** Día de la partida, si hay alguien. */ dia: number | null }

// Ojo: `isMe` es verdadero para TODAS las pestañas y dispositivos de la misma cuenta; el que es
// exactamente esta pestaña es `sameTab`. Para jugar con otro dispositivo de la misma cuenta, solo
// se ignora `sameTab`.
interface LobbyPeer { sameTab: boolean; presence: Readonly<Record<string, unknown>> }

/** Estado de cada servidor según lo que anuncian sus anfitriones en el vestíbulo. */
export function listServers(peers: readonly LobbyPeer[]): ServerInfo[] {
  const out: ServerInfo[] = SERVERS.map((s) => ({ ...s, n: 0, dia: null }));
  for (const p of peers) {
    if (p.sameTab) continue;
    const h = p.presence.host as Record<string, unknown> | undefined;
    if (!h || typeof h.sala !== 'string') continue;
    const s = out.find((x) => x.sala === h.sala);
    if (!s) continue; // un nombre que no es de la lista se ignora
    s.n = h.n === 2 ? 2 : Math.max(s.n, 1) as 1 | 2;
    s.dia = typeof h.dia === 'number' && Number.isFinite(h.dia) ? Math.max(1, Math.min(9999, Math.round(h.dia))) : 1;
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Aspecto del jugador: [skin, tono de piel]. Lo que llega del otro se ajusta a los que existen. */
export type Skin = [number, number];
export const SKIN_COUNT = 24, TONO_COUNT = 5;
export function readSkin(v: unknown): Skin {
  if (!Array.isArray(v)) return [0, 0];
  const n = (x: unknown, max: number) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < max ? x : 0);
  return [n(v[0], SKIN_COUNT), n(v[1], TONO_COUNT)];
}

/** Posición del jugador para que el otro lo vea: [x, z, yaw, en la caja (0/1)]. */
export type Pos = [number, number, number, number];
const readPos = (v: unknown): Pos | null => {
  if (!Array.isArray(v) || v.length < 4) return null;
  const n = v.slice(0, 4).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0));
  // Todo el mundo: la tienda, la calle, la casa y las otras tiendas.
  return [Math.max(-35, Math.min(35, n[0])), Math.max(-15, Math.min(47, n[1])), n[2], n[3] ? 1 : 0];
};

/** retry: dos jugadores entraron a la vez en un servidor vacío; el que sobra vuelve a entrar como invitado. */
export type EndReason = 'host-gone' | 'full' | 'kicked' | 'lost' | 'retry';

export interface SessionHooks {
  /** Anfitrión: entra o sale el segundo jugador. */
  onPartner(present: boolean): void;
  /** Anfitrión: aplicar una acción del invitado; devuelve [ok, motivo]. */
  onAction(a: Accion): [0 | 1, string];
  /** Invitado: ha llegado una foto nueva (ya volcada en el estado). */
  onSnap(x: SnapExtra): void;
  /** La partida terminó para este jugador (el anfitrión se fue, está llena, le sacaron...). */
  onEnd(reason: EndReason): void;
}

/** Una partida en marcha, como anfitrión o como invitado. */
export class Session {
  readonly role: 'host' | 'guest';
  readonly me: 0 | 1;
  readonly nombre: string;
  private room: RoomApi;
  private sala: NamedRoom;
  private hooks: SessionHooks;
  private state: () => GameState;
  private unsub: () => void = () => {};
  private lastSend = 0;
  private lastLobby = 0;
  // Anfitrión
  private guest: string | null = null;
  private blocked = new Set<string>();
  private ack = 0;
  private results: [number, 0 | 1, string][] = [];
  private events: [number, unknown][] = [];
  private evN = 0;
  // Invitado
  private actN = 0;
  private pending: Accion[] = [];
  private seenEv = -1;
  private seenRes = 0;
  private hostSeenAt = 0;
  private gotSnap = false;
  private ended = false;
  /** Pausa compartida: 0 en marcha, 1 la pidió el anfitrión, 2 el invitado. */
  pausa = 0;
  partnerPos: Pos | null = null;
  myPos: Pos = [0, 0, 0, 0];
  /** Aspecto propio (lo ve el otro) y el del otro. */
  mySkin: Skin = [0, 0];
  partnerSkin: Skin = [0, 0];

  private constructor(role: 'host' | 'guest', room: RoomApi, sala: NamedRoom, nombre: string, hooks: SessionHooks, state: () => GameState) {
    this.role = role; this.me = role === 'host' ? 0 : 1;
    this.room = room; this.sala = sala; this.nombre = nombre; this.hooks = hooks; this.state = state;
    this.unsub = sala.onPeers(() => this.readPeers(), () => this.end('lost'));
    this.hostSeenAt = performance.now();
  }

  /**
   * Entra en uno de los servidores fijos. Si ya hay alguien jugando, se une a su partida (caja 2);
   * si está vacío, la partida es la de este jugador (caja 1) y el siguiente que entre se une a ella.
   */
  static async enter(room: RoomApi, salaName: string, hooks: SessionHooks, state: () => GameState, beforeGuest: () => void = () => {}): Promise<Session> {
    const srv = SERVERS.find((s) => s.sala === salaName);
    if (!srv) throw new Error('servidor');
    const sala = await room.join(srv.sala);
    // El canal presenta a los que ya están durante el primer segundo: se espera un momento antes de decidir.
    const t0 = performance.now();
    let host = false;
    while (performance.now() - t0 < 1500) {
      host = sala.peers().some((p) => !p.sameTab && p.presence.rol === 'host');
      if (host) break;
      await sleep(150);
    }
    // Como invitado se dibuja la tienda del anfitrión: quien llama prepara un estado aparte.
    if (host) { beforeGuest(); return Session.joinAsGuest(room, sala, srv.nombre, hooks, state); }
    const s = new Session('host', room, sala, srv.nombre, hooks, state);
    void sala.presence({ rol: 'host', pos: s.myPos }).catch(() => {});
    s.lastLobby = 0;
    return s;
  }

  /** Se une a la partida del anfitrión y espera su primera foto (o falla a los 10 s). */
  private static async joinAsGuest(room: RoomApi, sala: NamedRoom, nombre: string, hooks: SessionHooks, state: () => GameState): Promise<Session> {
    const s = new Session('guest', room, sala, nombre, hooks, state);
    void sala.presence({ rol: 'guest', t: Date.now(), pos: s.myPos, acts: [], pausa: false });
    const t0 = performance.now();
    while (!s.gotSnap && !s.ended && performance.now() - t0 < 10000) {
      await new Promise((r) => setTimeout(r, 150));
      s.readPeers();
    }
    if (!s.gotSnap) { await s.leave(); throw new Error(s.ended ? 'full' : 'timeout'); }
    return s;
  }

  get partner(): boolean { return this.role === 'host' ? this.guest !== null : !this.ended; }

  private myPeer(): string | null { return this.sala.peers().find((p) => p.sameTab)?.peer ?? null; }

  private readPeers() {
    if (this.ended) return;
    const peers = this.sala.peers();
    if (this.role === 'host') {
      // Dos anfitriones a la vez en el mismo servidor: se queda el de etiqueta menor; el otro vuelve a entrar.
      const me = this.myPeer();
      if (me && peers.some((p) => !p.sameTab && p.presence.rol === 'host' && p.peer < me)) { this.end('retry'); return; }
      // Admite al primer invitado que llegue (el más antiguo) y a nadie más.
      const guests = peers.filter((p) => !p.sameTab && p.presence.rol === 'guest' && !this.blocked.has(p.peer));
      if (this.guest && !guests.some((p) => p.peer === this.guest)) { this.guest = null; this.ack = 0; this.hooks.onPartner(false); }
      if (!this.guest && guests.length) {
        guests.sort((a, b) => Number(a.presence.t ?? 0) - Number(b.presence.t ?? 0));
        this.guest = guests[0].peer; this.ack = 0; this.results = [];
        this.hooks.onPartner(true);
      }
      const g = guests.find((p) => p.peer === this.guest);
      if (g) {
        this.partnerPos = readPos(g.presence.pos);
        this.partnerSkin = readSkin(g.presence.skin);
        // Acciones nuevas del invitado (cada una una sola vez, en orden).
        const acts = Array.isArray(g.presence.acts) ? g.presence.acts.slice(0, 20) : [];
        for (const raw of acts) {
          const a = parseAccion(raw);
          if (!a || a.n <= this.ack) continue;
          this.ack = a.n;
          const r = a.t === 'pausa' ? ((this.pausa = a.v ? 2 : 0), [1, ''] as [1, string]) : this.hooks.onAction(a);
          this.results.push([a.n, r[0], r[1]]);
          if (this.results.length > 8) this.results.shift();
        }
      } else this.partnerPos = null;
    } else {
      const host = peers.find((p) => !p.sameTab && p.presence.rol === 'host');
      if (!host) { if (performance.now() - this.hostSeenAt > 4000) this.end('host-gone'); return; }
      this.hostSeenAt = performance.now();
      this.partnerPos = readPos(host.presence.pos);
      this.partnerSkin = readSkin(host.presence.skin);
      const snap = host.presence.snap as Record<string, unknown> | undefined;
      if (!snap) return;
      const me = this.myPeer();
      if (typeof snap.kick === 'string' && snap.kick === me) { this.end('kicked'); return; }
      if (typeof snap.g === 'string' && me && snap.g !== me) { this.end('full'); return; }
      const x = decodeSnap(snap, this.state());
      if (!x) return;
      // Acciones ya procesadas: dejar de reenviarlas.
      this.pending = this.pending.filter((a) => a.n > x.ack);
      if (!this.gotSnap) { this.seenEv = Math.max(0, ...x.ev.map((e) => e[0])); this.seenRes = x.ack; }
      this.pausa = x.pausa;
      x.ev = x.ev.filter((e) => e[0] > this.seenEv);
      if (x.ev.length) this.seenEv = Math.max(...x.ev.map((e) => e[0]));
      x.res = x.res.filter((r) => r[0] > this.seenRes);
      if (x.res.length) this.seenRes = Math.max(...x.res.map((r) => r[0]));
      this.gotSnap = true;
      this.hooks.onSnap(x);
    }
  }

  /** Anfitrión: guarda los eventos de la simulación para que el invitado los oiga. */
  pushEvents(evs: readonly unknown[]) {
    for (const e of evs) { this.events.push([++this.evN, e]); if (this.events.length > 16) this.events.shift(); }
  }

  /** Invitado: manda una acción (se reenvía hasta que el anfitrión confirma que la ha procesado). */
  send(a: Omit<Accion, 'n'>) {
    const act = { ...a, n: ++this.actN } as Accion;
    this.pending.push(act);
    if (this.pending.length > 20) this.pending.shift();
    this.lastSend = 0; // que salga ya
    return act.n;
  }

  /** Anfitrión: saca al invitado y no le deja volver en esta partida. */
  kick() {
    if (this.role !== 'host' || !this.guest) return;
    this.blocked.add(this.guest);
    this.kicked = this.guest;
    this.guest = null;
    this.hooks.onPartner(false);
  }
  private kicked: string | null = null;

  /** Llamar en cada fotograma: manda la presencia unas 10 veces por segundo. */
  pump(now: number, localPause: boolean) {
    if (this.ended) return;
    if (this.role === 'guest' && performance.now() - this.hostSeenAt > 4000) { this.readPeers(); }
    if (now - this.lastSend < 100) return;
    this.lastSend = now;
    if (this.role === 'host') {
      const snap = encodeSnap(this.state(), { ack: this.ack, res: this.results, ev: this.events as SnapExtra['ev'], g: this.guest, pausa: this.pausa });
      if (this.kicked) (snap as Record<string, unknown>).kick = this.kicked;
      void this.sala.presence({ rol: 'host', pos: this.myPos, skin: this.mySkin, snap }).catch(() => {});
      if (now - this.lastLobby > 2000) {
        this.lastLobby = now;
        void this.room.presence({ host: { sala: this.sala.name, nombre: this.nombre, dia: this.state().dia, n: this.guest ? 2 : 1 } }).catch(() => {});
      }
    } else {
      void this.sala.presence({ pos: this.myPos, skin: this.mySkin, acts: this.pending, pausa: localPause }).catch(() => {});
    }
  }

  /** Invitado: pide o quita la pausa compartida. */
  setPause(v: boolean) {
    // Quitar la pausa la quita para los dos, la pidiera quien la pidiera.
    if (this.role === 'host') this.pausa = v ? 1 : 0;
    else this.send({ t: 'pausa', v } as Omit<Accion, 'n'>);
    this.lastSend = 0;
  }
  /** Anfitrión: el invitado pidió quitar la pausa o el anfitrión la quita. */
  clearPause() { this.pausa = 0; }

  private end(reason: EndReason) {
    if (this.ended) return;
    this.ended = true;
    void this.leave();
    this.hooks.onEnd(reason);
  }

  async leave() {
    this.ended = true;
    this.unsub();
    if (this.role === 'host') void this.room.presence({ host: null }).catch(() => {});
    await this.sala.leave().catch(() => {});
  }
}
