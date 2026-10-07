import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://overpass-api.de",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// The CSP meta tag is added to the built page only (the dev server needs inline scripts).
const cspMeta = () => ({
  name: 'roadbook-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    cspMeta(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,   // public/manifest.webmanifest is used as written
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        globIgnores: ['vendor/tesseract/**'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/vendor\/tesseract\//, handler: 'CacheFirst', options: { cacheName: 'receipt-reader', expiration: { maxEntries: 12 } } },
          { urlPattern: /^https:\/\/[a-c]\.tile\.openstreetmap\.org\//, handler: 'CacheFirst', options: { cacheName: 'map-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 14 * 86400 } } },
          { urlPattern: /\/config\.js$/, handler: 'NetworkFirst', options: { cacheName: 'config' } },
        ],
      },
    }),
  ],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173, host: true },
});
