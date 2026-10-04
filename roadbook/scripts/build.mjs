// Copies app/ to dist/ and stamps the offline file list + a version into dist/sw.js.
// Deploy the dist/ folder. Run: npm run build
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SRC = path.resolve('app'), OUT = path.resolve('dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
// never ship test-only or source-map leftovers
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const all = walk(OUT).map((f) => path.relative(OUT, f).split(path.sep).join('/'));
const skip = (f) => f === 'sw.js' || f.startsWith('vendor/tesseract/') || f.endsWith('.map') || f.endsWith('LICENSE') || f.includes('licenses/');
const files = all.filter((f) => !skip(f)).sort();
const hash = crypto.createHash('sha256');
for (const f of [...files, 'sw.js']) hash.update(f).update(fs.readFileSync(path.join(OUT, f)));
const version = hash.digest('hex').slice(0, 12);
const list = ['./', ...files];
const swPath = path.join(OUT, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace(/\/\*BUILD\*\/[\s\S]*?\/\*END\*\//, `/*BUILD*/\nconst VERSION = '${version}';\nconst FILES = ${JSON.stringify(list)};\n/*END*/`);
fs.writeFileSync(swPath, sw);
// hosting config files for common hosts
fs.writeFileSync(path.join(OUT, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/config.js\n  Cache-Control: no-cache\n`);
// Vercel reads vercel.json (not _headers): same security headers + no-cache for the files that must update at once.
const SEC = [
  ['X-Content-Type-Options', 'nosniff'], ['Referrer-Policy', 'no-referrer'], ['X-Frame-Options', 'DENY'],
  ['Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"],
];
const noCache = [{ key: 'Cache-Control', value: 'no-cache' }];
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify({
  headers: [
    { source: '/(.*)', headers: SEC.map(([key, value]) => ({ key, value })) },
    { source: '/sw.js', headers: noCache }, { source: '/index.html', headers: noCache }, { source: '/config.js', headers: noCache },
  ],
}, null, 2));
console.log(`Built ${files.length} files into dist/ (version ${version}); ${(fs.statSync(path.join(OUT, 'vendor/tesseract/eng.traineddata.gz')).size / 1e6).toFixed(1)} MB receipt-reader data is cached on first use.`);
