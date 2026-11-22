// Sonidos de Bloques, hechos con WebAudio (sin archivos): golpes sordos de madera y piedra, y avisos suaves.
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('bloques.silencio') === '1'; } catch { /* sin almacenamiento */ }

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('bloques.silencio', m ? '1' : '0'); } catch { /* sin almacenamiento */ }
}
/** Los navegadores solo dejan sonar después de un toque o un clic. */
export function unlock() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
}
/** Ruido filtrado: `tone` bajo suena a tierra y piedra; alto, a hojas. */
function crunch(dur: number, vol: number, tone = 900) {
  if (muted || !ctx) return;
  const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass'; f.frequency.value = tone;
  s.buffer = buf; g.gain.value = vol; s.connect(f).connect(g).connect(ctx.destination); s.start();
}

export const sfx = {
  /** Golpe al picar, colocar o pegar. */
  golpe() { tone(150, 0.07, 'triangle', 0.09, 0.6); crunch(0.05, 0.06, 1400); },
  /** Un bloque se rompe. */
  romper() { crunch(0.22, 0.2, 700); tone(110, 0.16, 'sine', 0.1, 0.5); },
  /** Algo entra en la mochila. */
  recoger() { tone(520, 0.07, 'sine', 0.09); tone(780, 0.1, 'sine', 0.08, 0, 0.06); },
  /** Aviso bueno: algo fabricado, un amigo nuevo. */
  logro() { tone(392, 0.12, 'triangle', 0.09); tone(523, 0.12, 'triangle', 0.09, 0, 0.1); tone(659, 0.22, 'triangle', 0.09, 0, 0.2); },
  /** Te hacen daño. */
  dano() { tone(180, 0.22, 'square', 0.07, 0.5); crunch(0.08, 0.08, 500); },
  /** Te quedas sin corazones. */
  caer() { tone(294, 0.3, 'triangle', 0.1, 0.7); tone(196, 0.55, 'triangle', 0.1, 0.5, 0.25); },
  /** El espino lanza una púa. */
  pua() { tone(1100, 0.09, 'sine', 0.04, 0.4); crunch(0.04, 0.04, 3000); },
};
