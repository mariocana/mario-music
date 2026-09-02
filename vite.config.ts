import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Il frontend vive in web/ ed è servito da Vite in dev (porta 5173).
// Tutto ciò che comincia per /api viene inoltrato al server Node (porta 4000):
// così nel browser non esistono richieste cross-origin e niente CORS da gestire.
export default defineConfig({
  root: 'web',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
