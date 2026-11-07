// Cliente del modo cooperativo en línea: conexión WebSocket, instantáneas del servidor,
// suavizado del movimiento y predicción del jugador propio.
import { movePlayer, type World, type Input, type GameEvent } from './sim.ts';
import { decode, type ClientMsg, type ServerMsg, type RoomInfo, type Snapshot } from './protocol.ts';

/** Dirección del servidor: ?servidor=wss://..., VITE_SERVER_URL al compilar, o el mismo sitio que sirve la web. */
export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('servidor');
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (q) return q;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export interface JoinedRoom { id: string; name: string; code: string | null; public: boolean }

export class NetSession {
  ws: WebSocket | null = null;
  you = '';
  room: JoinedRoom | null = null;
  world: World | null = null;
  snap: Snapshot | null = null;
  /** Eventos recibidos pendientes de procesar por el render. */
  events: GameEvent[] = [];
  onRooms: (r: RoomInfo[]) => void = () => {};
  onJoined: (r: JoinedRoom) => void = () => {};
  onError: (msg: string) => void = () => {};
  onNotice: (msg: string) => void = () => {};
  onKicked: (msg: string) => void = () => {};
  onClose: () => void = () => {};

  private target = new Map<string, { x: number; z: number }>(); // posición del servidor por entidad
  private lastSent = 0;
  private lastInput = '';

  connect(url = serverUrl()): Promise<void> {
    return new Promise((ok, fail) => {
      let opened = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => { opened = true; ok(); };
      ws.onerror = () => { if (!opened) fail(new Error('No se pudo conectar con el servidor')); };
      ws.onclose = () => { this.ws = null; this.room = null; this.world = null; if (opened) this.onClose(); };
      ws.onmessage = (e) => this.handle(JSON.parse(String(e.data)) as ServerMsg);
    });
  }
  get connected() { return this.ws?.readyState === WebSocket.OPEN; }
  send(m: ClientMsg) { if (this.connected) this.ws!.send(JSON.stringify(m)); }
  close() { this.ws?.close(); this.ws = null; }

  private handle(m: ServerMsg) {
    switch (m.t) {
      case 'rooms': this.onRooms(m.rooms); break;
      case 'error': this.onError(m.msg); break;
      case 'notice': this.onNotice(m.msg); break;
      case 'kicked': this.room = null; this.world = null; this.onKicked(m.msg); break;
      case 'joined':
        this.you = m.you; this.room = m.room; this.world = null; this.target.clear();
        this.onJoined(m.room);
        break;
      case 's': this.applySnapshot(m.s); break;
    }
  }

  private applySnapshot(s: Snapshot) {
    const prev = this.world;
    const w = decode(s, prev);
    // Conservar la posición que se está mostrando y guardar la del servidor como objetivo (suavizado).
    const shown = new Map<string, { x: number; z: number }>();
    if (prev) {
      for (const p of prev.players) shown.set('p' + p.id, p);
      for (const e of prev.enemies) shown.set('e' + e.id, e);
    }
    for (const p of w.players) {
      this.target.set('p' + p.id, { x: p.x, z: p.z });
      const old = shown.get('p' + p.id);
      if (old && p.alive) { p.x = old.x; p.z = old.z; }
      if (p.id === this.you && prev) {
        const mine = prev.players.find((q) => q.id === this.you);
        if (mine) p.angle = mine.angle; // el ángulo propio lo manda el cliente
      }
    }
    for (const e of w.enemies) {
      this.target.set('e' + e.id, { x: e.x, z: e.z });
      const old = shown.get('e' + e.id);
      if (old) { e.x = old.x; e.z = old.z; }
    }
    this.events.push(...s.ev);
    this.snap = s;
    this.world = w;
  }

  /** Se llama cada fotograma: mueve lo visible hacia el estado del servidor y predice al jugador propio. */
  update(dt: number, input: Input | null) {
    const w = this.world;
    if (!w) return;
    const k = 1 - Math.exp(-dt * 14);
    for (const p of w.players) {
      const t = this.target.get('p' + p.id);
      if (!t) continue;
      if (p.id === this.you && p.alive && input) {
        // Predicción: me muevo ya con mi entrada y corrijo suavemente hacia lo que dice el servidor.
        movePlayer(w, p, input, dt);
        const err = Math.hypot(t.x - p.x, t.z - p.z);
        // El servidor va un poco por detrás (latencia): la corrección es suave para no dar tirones,
        // y solo se fuerza si la diferencia es grande (p. ej. empujón de un robot).
        if (err > 3) { p.x = t.x; p.z = t.z; } else { p.x += (t.x - p.x) * k * 0.25; p.z += (t.z - p.z) * k * 0.25; }
      } else {
        p.x += (t.x - p.x) * k; p.z += (t.z - p.z) * k;
      }
    }
    for (const e of w.enemies) {
      const t = this.target.get('e' + e.id);
      if (t) { e.x += (t.x - e.x) * k; e.z += (t.z - e.z) * k; }
    }
    for (const b of w.bullets) { b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt; } // extrapolación
    w.bullets = w.bullets.filter((b) => b.life > 0);
    w.time += dt;

    // Enviar la entrada ~30 veces por segundo (o al momento si cambia mucho)
    if (input) {
      const arr: [number, number, number, number, number] = [
        Math.round(input.moveX * 100) / 100, Math.round(input.moveZ * 100) / 100,
        Math.round(input.aimX * 100) / 100, Math.round(input.aimZ * 100) / 100, input.fire ? 1 : 0];
      const key = arr.join(',');
      const now = performance.now();
      if ((key !== this.lastInput && now - this.lastSent > 33) || now - this.lastSent > 250) {
        this.send({ t: 'in', i: arr });
        this.lastInput = key; this.lastSent = now;
      }
    }
  }
}
