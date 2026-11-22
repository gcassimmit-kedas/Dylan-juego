// Ajustes de Bloques, guardados solo en el dispositivo. No salen de él.
export type Quality = 'auto' | 'alta' | 'baja';

function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento: el ajuste dura solo esta sesión */ } }
const prefersReducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const settings = {
  /** Calidad gráfica. ?calidad=alta|baja en la dirección tiene prioridad (útil para pruebas). */
  get quality(): Quality {
    const q = new URLSearchParams(location.search).get('calidad') ?? read('bloques.calidad');
    return q === 'alta' || q === 'baja' ? q : 'auto';
  },
  set quality(v: Quality) { write('bloques.calidad', v); },
  /** Movimiento de cámara al andar. Por defecto se quita si el sistema pide reducir el movimiento (accesibilidad). */
  get shake(): boolean {
    const v = read('bloques.temblor');
    return v === null ? !prefersReducedMotion : v === '1';
  },
  set shake(v: boolean) { write('bloques.temblor', v ? '1' : '0'); },
};
