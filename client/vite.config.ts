import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS + host:true so phones on the LAN can join as a secure context (required for
// getUserMedia/WebRTC). /api and /ws are proxied to the Express+ws server so phones only
// ever talk to this one origin — see plan §A (single HTTPS origin).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    fs: { allow: ['..'] }, // allow importing ../shared/*
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/artifacts': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
  resolve: {
    alias: {
      '@shared': new URL('../shared', import.meta.url).pathname,
    },
  },
});
