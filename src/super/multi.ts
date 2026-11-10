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

export interface OpenGame { sala: string; nombre: string; dia: number; n: number }

/** Partidas abiertas que anuncian los anfitriones en el vestíbulo. */
export function listGames(room: RoomApi): OpenGame[] {
  const out: OpenGame[] = [];
  for (const p of room.peers()) {
    if (p.isMe) continue;
    const h = p.presence.host as Record<string, unknown> | undefined;
    if (!h || typeof h.sala !== 'string' || !/^tienda-[a-z0-9]{6}$/.test(h.sala)) continue;
    out.push({
      sala: h.sala,
      nombre: typeof h.nombre === 'string' ? h.nombre.slice(0, 40) : 'Tienda',
      dia: typeof h.dia === 'number' ? Math.max(1, Math.min(9999, Math.round(h.dia))) : 1,
      n: h.n === 2 ? 2 : 1,
    });
  }
  return out;
}

// Nombres automáticos (los jugadores no escriben nada).
const FRUTAS = ['Mango', 'Coco', 'Piña', 'Guayaba', 'Limón', 'Cereza', 'Chinola', 'Lechosa', 'Tamarindo', 'Guanábana'];
export const randomName = () => `Tienda ${FRUTAS[Math.floor(Math.random() * FRUTAS.length)]} ${10 + Math.floor(Math.random() * 90)}`;
const randomSala = () => 'tienda-' + Array.from({ length: 6 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');

/** Posición del jugador para que el otro lo vea: [x, z, yaw, en la caja (0/1)]. */
export type Pos = [number, number, number, number];
const readPos = (v: unknown): Pos | null => {
  if (!Array.isArray(v) || v.length < 4) return null;
  const n = v.slice(0, 4).map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0));
  return [Math.max(-12, Math.min(12, n[0])), Math.max(-10, Math.min(12, n[1])), n[2], n[3] ? 1 : 0];
};

export interface SessionHooks {
  /** Anfitrión: entra o sale el segundo jugador. */
  onPartner(present: boolean): void;
  /** Anfitrión: aplicar una acción del invitado; devuelve [ok, motivo]. */
  onAction(a: Accion): [0 | 1, string];
  /** Invitado: ha llegado una foto nueva (ya volcada en el estado). */
  onSnap(x: SnapExtra): void;
  /** La partida terminó para este jugador (el anfitrión se fue, está llena, le sacaron...). */
  onEnd(reason: 'host-gone' | 'full' | 'kicked' | 'lost'): void;
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

  private constructor(role: 'host' | 'guest', room: RoomApi, sala: NamedRoom, nombre: string, hooks: SessionHooks, state: () => GameState) {
    this.role = role; this.me = role === 'host' ? 0 : 1;
    this.room = room; this.sala = sala; this.nombre = nombre; this.hooks = hooks; this.state = state;
    this.unsub = sala.onPeers(() => this.readPeers(), () => this.end('lost'));
    this.hostSeenAt = performance.now();
  }

  static async host(room: RoomApi, hooks: SessionHooks, state: () => GameState): Promise<Session> {
    const sala = await room.join(randomSala());
    return new Session('host', room, sala, randomName(), hooks, state);
  }

  /** Se une a una partida y espera la primera foto del anfitrión (o falla a los 10 s). */
  static async join(room: RoomApi, salaName: string, hooks: SessionHooks, state: () => GameState): Promise<Session> {
    const sala = await room.join(salaName);
    const s = new Session('guest', room, sala, salaName, hooks, state);
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
      // Admite al primer invitado que llegue (el más antiguo) y a nadie más.
      const guests = peers.filter((p) => !p.isMe && p.presence.rol === 'guest' && !this.blocked.has(p.peer));
      if (this.guest && !guests.some((p) => p.peer === this.guest)) { this.guest = null; this.ack = 0; this.hooks.onPartner(false); }
      if (!this.guest && guests.length) {
        guests.sort((a, b) => Number(a.presence.t ?? 0) - Number(b.presence.t ?? 0));
        this.guest = guests[0].peer; this.ack = 0; this.results = [];
        this.hooks.onPartner(true);
      }
      const g = guests.find((p) => p.peer === this.guest);
      if (g) {
        this.partnerPos = readPos(g.presence.pos);
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
      const host = peers.find((p) => !p.isMe && p.presence.rol === 'host');
      if (!host) { if (performance.now() - this.hostSeenAt > 4000) this.end('host-gone'); return; }
      this.hostSeenAt = performance.now();
      this.partnerPos = readPos(host.presence.pos);
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
      void this.sala.presence({ rol: 'host', pos: this.myPos, snap }).catch(() => {});
      if (now - this.lastLobby > 2000) {
        this.lastLobby = now;
        void this.room.presence({ host: { sala: this.sala.name, nombre: this.nombre, dia: this.state().dia, n: this.guest ? 2 : 1 } }).catch(() => {});
      }
    } else {
      void this.sala.presence({ pos: this.myPos, acts: this.pending, pausa: localPause }).catch(() => {});
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

  private end(reason: 'host-gone' | 'full' | 'kicked' | 'lost') {
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
