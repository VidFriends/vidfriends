import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Dev: the API runs on :8080 (pnpm --filter @vidfriends/server dev) and Vite proxies /api so the
// app stays same-origin (FR-PAIR-02). Set PUBLIC_URL=http://localhost:5173 for the server in dev.
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Installable PWA with a custom service worker (TDD §4, FR-PWA-01/02).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
      manifest: {
        name: 'VidFriends',
        short_name: 'VidFriends',
        description: 'Videos from your friends, and nobody else.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#7c3aed',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Android Web Share Target: shared links open Send with the URL prefilled (FR-PWA-02).
        share_target: {
          action: '/send',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      devOptions: { enabled: false },
    }),
  ],
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
