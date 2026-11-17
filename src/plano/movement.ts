/** Movimiento sobre el plano: lógica pura, sin Three.js ni DOM, para poder probarla. */

export interface Body { x: number; z: number; heading: number; speed: number }
/** Entrada normalizada: x a la derecha, z hacia abajo de la pantalla (hacia la cámara). Módulo 0..1. */
export interface MoveInput { x: number; z: number }

export const MAX_SPEED = 6; // m/s
export const ACCEL = 30; // m/s²
export const HALF_SIZE = 20; // el plano mide 40 x 40 m
export const DEADZONE = 0.12;

/** Limita la entrada al círculo unidad y aplica zona muerta (el joystick no deriva en reposo). */
export function normalizeInput(inp: MoveInput): MoveInput {
  const m = Math.hypot(inp.x, inp.z);
  if (m < DEADZONE) return { x: 0, z: 0 };
  const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return { x: inp.x * k, z: inp.z * k };
}

/** Avanza la simulación dt segundos. Devuelve un cuerpo nuevo; no muta el anterior. */
export function step(b: Body, raw: MoveInput, dt: number): Body {
  const inp = normalizeInput(raw);
  const mag = Math.hypot(inp.x, inp.z);
  const target = mag * MAX_SPEED;
  const dv = ACCEL * dt;
  const speed = b.speed < target ? Math.min(target, b.speed + dv) : Math.max(target, b.speed - dv);
  const heading = mag > 0 ? Math.atan2(inp.x, inp.z) : b.heading;
  const x = clamp(b.x + Math.sin(heading) * speed * dt, -HALF_SIZE, HALF_SIZE);
  const z = clamp(b.z + Math.cos(heading) * speed * dt, -HALF_SIZE, HALF_SIZE);
  return { x, z, heading, speed };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
