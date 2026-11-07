// Registro del service worker para jugar sin conexión en el navegador.
// En la app nativa (Capacitor) no se registra: el juego ya va dentro de la app.
const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ?? false;
const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (!native && secure && 'serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* sin service worker: el juego funciona igual con conexión */ }); });
}
