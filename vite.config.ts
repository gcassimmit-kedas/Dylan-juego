import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './', // rutas relativas: necesario para Capacitor (iOS/Android)
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        shooter: resolve(import.meta.dirname, 'shooter.html'),
        tres: resolve(import.meta.dirname, 'tres-en-raya.html'),
        privacidad: resolve(import.meta.dirname, 'privacidad.html'),
        creditos: resolve(import.meta.dirname, 'creditos.html'),
      },
    },
  },
});
