import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // rutas relativas: necesario para Capacitor (iOS/Android)
  build: { chunkSizeWarningLimit: 800 },
});
