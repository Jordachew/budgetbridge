import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
const root = '/home/user/budgetbridge/roadbook';
export default defineConfig({
  root,
  plugins: [react(), tailwindcss(), { name: 'mock-app', enforce: 'pre', load(id) { if (id.split('?')[0].endsWith('src/state/app.jsx')) return fs.readFileSync('/tmp/inv2-harness/mock-app.jsx', 'utf8'); } }],
  optimizeDeps: { entries: ['harness.html'] },
  server: { port: 5290, strictPort: true, host: true },
});
