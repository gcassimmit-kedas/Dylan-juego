// Ajustes del jugador, guardados solo en el dispositivo (localStorage). No salen del teléfono.

export type Quality = 'auto' | 'alta' | 'baja';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento: el ajuste dura solo esta sesión */ }
}

const prefersReducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const settings = {
  /** Calidad gráfica. ?calidad=alta|baja en la URL tiene prioridad (útil para pruebas). */
  get quality(): Quality {
    const q = new URLSearchParams(location.search).get('calidad') ?? read('shooter.calidad');
    return q === 'alta' || q === 'baja' ? q : 'auto';
  },
  set quality(v: Quality) { write('shooter.calidad', v); },

  /** Temblor de cámara. Por defecto se desactiva si el sistema pide reducir el movimiento (accesibilidad). */
  get shake(): boolean {
    const v = read('shooter.temblor');
    return v === null ? !prefersReducedMotion : v === '1';
  },
  set shake(v: boolean) { write('shooter.temblor', v ? '1' : '0'); },
};
