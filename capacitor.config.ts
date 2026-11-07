import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // DECISIÓN PENDIENTE (ver docs/TIENDAS.md): el appId no se puede cambiar después de publicar.
  appId: 'com.dylan.tresenraya3d',
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
