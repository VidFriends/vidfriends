import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dev: the API runs on :8080 (pnpm --filter @vidfriends/server dev) and Vite proxies /api so the
// app stays same-origin (FR-PAIR-02). Set PUBLIC_URL=http://localhost:5173 for the server in dev.
export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080' },
      // Not rewritten: presigned URLs are signed for this path and host (ADR-0015).
      '/media-store': { target: 'http://localhost:8333' },
    },
  },
  build: { sourcemap: true, target: 'es2022' },
});
