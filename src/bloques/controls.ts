// Controles en primera persona: convierte la mirada (giro) y el joystick en la entrada que entiende la simulación.
// Lógica pura (sin DOM ni Three.js) para poder probarla.
import type { Input } from '../shooter/sim.ts';

/** Inclinación máxima de la mirada hacia arriba o abajo (radianes). Los disparos van siempre en horizontal. */
export const PITCH_LIMIT = 0.45;
export const DEADZONE = 0.12;

/**
 * yaw: hacia dónde mira el jugador, con el mismo criterio que la simulación (0 = +z, dirección (sin, cos)).
 * sx, sy: joystick o teclado, x a la derecha y y hacia abajo de la pantalla (y negativa = avanzar). Módulo hasta 1.
 */
export function fpInput(yaw: number, sx: number, sy: number, fire: boolean): Input {
  let m = Math.hypot(sx, sy);
  if (m < DEADZONE) { sx = 0; sy = 0; m = 0; } else if (m > 1) { sx /= m; sy /= m; }
  const fx = Math.sin(yaw), fz = Math.cos(yaw); // delante
  const rx = -Math.cos(yaw), rz = Math.sin(yaw); // derecha
  const fwd = -sy;
  return { moveX: fx * fwd + rx * sx || 0, moveZ: fz * fwd + rz * sx || 0, aimX: fx, aimZ: fz, fire };
}

/** Aplica un giro de ratón o dedo (en píxeles) a la mirada. Arrastrar a la derecha gira a la derecha. */
export function applyLook(yaw: number, pitch: number, dx: number, dy: number, sensitivity: number, limit = PITCH_LIMIT): [number, number] {
  const y = yaw - dx * sensitivity;
  const p = Math.max(-limit, Math.min(limit, pitch - dy * sensitivity));
  return [Math.atan2(Math.sin(y), Math.cos(y)), p];
}
