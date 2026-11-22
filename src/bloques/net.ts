// Cliente de red de los mundos compartidos de Bloques: conexión, instantáneas del servidor y envío de la entrada.
import type { MClientMsg, MServerMsg, MSnapshot, WorldInfo } from './protocol.ts';

/** Dirección del servidor de mundos: ?servidor=wss://..., VITE_SERVER_URL al compilar, o el mismo sitio que sirve la web. */
export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get('servidor');
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (q) return q;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export class WorldNet {
  ws: WebSocket | null = null;
  you = '';
  world: { id: string; name: string; seed: number } | null = null;
  edits: number[] = [];
  snap: MSnapshot | null = null;
  /** Instantáneas que aún no ha procesado el juego (eventos y bloques cambiados no se pueden perder). */
  queue: MSnapshot[] = [];
  onRooms: (r: WorldInfo[]) => void = () => {};
  onJoined: () => void = () => {};
  onError: (msg: string) => void = () => {};
  onNotice: (msg: string) => void = () => {};
  onKicked: (msg: string) => void = () => {};
  onClose: () => void = () => {};
  private lastSent = 0;
  private lastKey = '';

  connect(url = serverUrl()): Promise<void> {
    return new Promise((ok, fail) => {
      let opened = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => { opened = true; ok(); };
      ws.onerror = () => { if (!opened) fail(new Error('No se pudo conectar con el servidor')); };
      ws.onclose = () => { this.ws = null; this.world = null; if (opened) this.onClose(); };
      ws.onmessage = (e) => this.handle(JSON.parse(String(e.data)) as MServerMsg);
    });
  }
  get connected() { return this.ws?.readyState === WebSocket.OPEN; }
  send(m: MClientMsg) { if (this.connected) this.ws!.send(JSON.stringify(m)); }
  close() { this.ws?.close(); this.ws = null; this.world = null; }

  private handle(m: MServerMsg) {
    switch (m.t) {
      case 'mrooms': this.onRooms(m.rooms); break;
      case 'error': this.onError(m.msg); break;
      case 'notice': this.onNotice(m.msg); break;
      case 'kicked': this.world = null; this.onKicked(m.msg); break;
      case 'mjoined': this.you = m.you; this.world = m.world; this.edits = m.edits; this.queue = []; this.snap = null; this.onJoined(); break;
      case 'ms': this.snap = m.s; this.queue.push(m.s); if (this.queue.length > 60) this.queue.splice(0, this.queue.length - 60); break;
    }
  }

  /** Manda la entrada unas 20 veces por segundo, o al momento si cambia (saltar, romper). */
  sendInput(mx: number, mz: number, jump: boolean, attack: boolean, yaw: number, pitch: number) {
    const r = (v: number) => Math.round(v * 100) / 100;
    const i = [r(mx), r(mz), jump ? 1 : 0, attack ? 1 : 0, r(yaw), r(pitch)];
    const key = i.slice(0, 4).join(',');
    const now = performance.now();
    if ((key !== this.lastKey && now - this.lastSent > 30) || now - this.lastSent > 50) {
      this.send({ t: 'min', i });
      this.lastKey = key; this.lastSent = now;
    }
  }
}
