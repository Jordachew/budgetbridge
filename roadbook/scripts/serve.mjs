// Tiny static file server for testing and for hosting on your own computer.
// Usage: node scripts/serve.mjs [folder] [port]   (default: dist 8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || 'dist');
const port = Number(process.argv[3] || process.env.PORT || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.gz': 'application/gzip',
  '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};
const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end('Forbidden'); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
      const headers = { ...SECURITY_HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size,
        'Cache-Control': p.endsWith('sw.js') || p.endsWith('index.html') || p.endsWith('config.js') ? 'no-cache' : 'public, max-age=3600' };
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    });
  } catch { res.writeHead(400).end('Bad request'); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
export { server };
