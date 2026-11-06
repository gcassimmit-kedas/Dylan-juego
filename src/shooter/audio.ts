// Efectos de sonido sintetizados con WebAudio (sin archivos).
let ctx: AudioContext | null = null;
let muted = false;
try { muted = localStorage.getItem('shooter.muted') === '1'; } catch { /* sin storage */ }

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('shooter.muted', m ? '1' : '0'); } catch { /* sin storage */ }
}
export function unlock() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
  if (muted || !ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
}
function noise(dur: number, vol: number) {
  if (muted || !ctx) return;
  const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; g.gain.value = vol; s.connect(g).connect(ctx.destination); s.start();
}

let lastShot = 0;
export const sfx = {
  shoot() { const n = performance.now(); if (n - lastShot < 60) return; lastShot = n; tone(880, 0.06, 'square', 0.04, 0.5); },
  enemyShoot() { tone(300, 0.12, 'sawtooth', 0.04, 0.6); },
  hit() { tone(220, 0.04, 'triangle', 0.05); },
  kill() { noise(0.25, 0.18); tone(160, 0.2, 'sine', 0.12, 0.3); },
  hurt() { tone(140, 0.3, 'sawtooth', 0.12, 0.4); },
  pickup() { tone(660, 0.08, 'sine', 0.1); setTimeout(() => tone(990, 0.12, 'sine', 0.1), 70); },
  wave() { tone(440, 0.15, 'triangle', 0.1); setTimeout(() => tone(660, 0.25, 'triangle', 0.1), 130); },
  gameover() { tone(330, 0.6, 'sawtooth', 0.12, 0.25); },
};
