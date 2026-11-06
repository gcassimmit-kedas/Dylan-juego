import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  // En desarrollo (npm run dev) el WebSocket va al servidor de juego en el puerto 8080
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } }, // rutas relativas: necesario para Capacitor (iOS/Android)
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        shooter: resolve(import.meta.dirname, 'shooter.html'),
        tres: resolve(import.meta.dirname, 'tres-en-raya.html'),
      },
    },
  },
});
