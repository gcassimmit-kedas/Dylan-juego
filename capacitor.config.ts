import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Identificador permanente (decidido el 7/11/2026). No se puede cambiar después de publicar.
  appId: 'com.dylan.shooter2027',
  appName: 'Shooter 2027',
  webDir: 'dist',
  backgroundColor: '#1d2416', // mismo color que la pantalla de carga: sin destellos blancos al abrir
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'never', // el juego ya gestiona las áreas seguras con env(safe-area-inset-*)
  },
};

export default config;
