// Sonidos del supermercado sintetizados con WebAudio (sin archivos).
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('super.muted') === '1'; } catch { /* sin almacenamiento */ }

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('super.muted', m ? '1' : '0'); } catch { /* sin almacenamiento */ }
}
export function unlock() {
  if (!ctx) {
    // iOS 14.4 y anteriores solo tienen la versión con prefijo.
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { return; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  /** Pitido del escáner. */
  scan() { tone(1760, 0.09, 'square', 0.035); },
  /** Caja registradora: campanilla y monedas. */
  cash() { tone(1318, 0.12, 'triangle', 0.09); tone(1976, 0.3, 'triangle', 0.08, 0.08); tone(2637, 0.25, 'sine', 0.04, 0.14); },
  /** Timbre de la puerta automática. */
  door() { tone(988, 0.25, 'sine', 0.05); tone(784, 0.35, 'sine', 0.05, 0.16); },
  stock() { tone(523, 0.08, 'triangle', 0.07); tone(784, 0.12, 'triangle', 0.07, 0.07); },
  buy() { tone(660, 0.08, 'sine', 0.08); tone(880, 0.08, 'sine', 0.08, 0.07); tone(1320, 0.16, 'sine', 0.08, 0.14); },
  error() { tone(220, 0.18, 'sawtooth', 0.05, 0, 0.7); },
  angry() { tone(330, 0.22, 'sawtooth', 0.04, 0, 0.6); },
  open() { tone(523, 0.14, 'triangle', 0.09); tone(659, 0.14, 'triangle', 0.09, 0.12); tone(784, 0.3, 'triangle', 0.09, 0.24); },
  close() { tone(784, 0.16, 'triangle', 0.08); tone(523, 0.4, 'triangle', 0.08, 0.14); },
  click() { tone(1200, 0.03, 'square', 0.02); },
  /** Ducha: rumor de agua. */
  water() {
    if (muted || !ctx) return;
    const len = Math.floor(ctx.sampleRate * 1.4), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / 4000, (len - i) / 8000);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 2400; g.gain.value = 0.08;
    src.buffer = buf; src.connect(f).connect(g).connect(ctx.destination); src.start();
  },
  /** Dormir: dos notas bajas. */
  sleep() { tone(392, 0.4, 'sine', 0.06); tone(294, 0.7, 'sine', 0.06, 0.35); },
  /** Datáfono: pago aprobado. */
  approved() { tone(1760, 0.08, 'sine', 0.06); tone(2349, 0.16, 'sine', 0.06, 0.1); },
  /** Cajón de la registradora al abrirse. */
  drawer() { tone(1568, 0.1, 'triangle', 0.07); tone(180, 0.12, 'square', 0.03, 0.05, 0.6); },
  coin() { tone(2400, 0.06, 'sine', 0.05); tone(3200, 0.12, 'sine', 0.035, 0.04); },
  /** Alarma de la tienda: dos tonos que se alternan. */
  alarm() { for (let i = 0; i < 4; i++) { tone(880, 0.18, 'square', 0.04, i * 0.36); tone(660, 0.18, 'square', 0.04, i * 0.36 + 0.18); } },
  /** Silbato. */
  whistle() { tone(2900, 0.5, 'sine', 0.07, 0, 1.08); tone(2950, 0.5, 'triangle', 0.03, 0.02, 1.05); },
  /** Chorro de la pistola de agua. */
  splash() {
    if (muted || !ctx) return;
    const len = Math.floor(ctx.sampleRate * 0.5), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / 800, (len - i) / 6000);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 1800; g.gain.value = 0.12;
    src.buffer = buf; src.connect(f).connect(g).connect(ctx.destination); src.start();
  },
  /** Disparo del lanzarredes: golpe sordo y silbido. */
  net() { tone(140, 0.18, 'sine', 0.12, 0, 0.5); tone(900, 0.3, 'triangle', 0.03, 0.05, 0.6); },
  bill() { tone(400, 0.05, 'triangle', 0.025, 0, 1.6); },
};
