// Copies third-party files out of node_modules into app/vendor and app/fonts so the
// finished app is a plain folder of static files with no CDN and no build step.
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => path.join(root, 'node_modules', p);
const out = (p) => path.join(root, 'app', p);

await rm(out('vendor'), { recursive: true, force: true });
await mkdir(out('vendor/tesseract'), { recursive: true });
await mkdir(out('fonts'), { recursive: true });

await cp(nm('@supabase/supabase-js/dist/umd/supabase.js'), out('vendor/supabase.js'));
await cp(nm('tesseract.js/dist/tesseract.min.js'), out('vendor/tesseract/tesseract.min.js'));
await cp(nm('tesseract.js/dist/worker.min.js'), out('vendor/tesseract/worker.min.js'));
// One core build is enough: the "simd-lstm" build runs on every phone made in the last several years.
for (const f of ['tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']) {
  await cp(nm(`tesseract.js-core/${f}`), out(`vendor/tesseract/${f}`));
}
await cp(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), out('vendor/tesseract/eng.traineddata.gz'));

const fonts = [
  ['@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2', 'barlow-condensed-600.woff2'],
  ['@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2', 'barlow-condensed-800.woff2'],
  ['@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2', 'atkinson-400.woff2'],
  ['@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2', 'atkinson-700.woff2'],
];
for (const [src, dest] of fonts) {
  if (!existsSync(nm(src))) throw new Error(`Missing font file ${src}`);
  await cp(nm(src), out(`fonts/${dest}`));
}
await cp(nm('@fontsource/barlow-condensed/LICENSE'), out('fonts/LICENSE-barlow-condensed.txt'));
await cp(nm('@fontsource/atkinson-hyperlegible/LICENSE'), out('fonts/LICENSE-atkinson.txt'));

// Record which versions were copied (useful for audits).
const ver = async (p) => JSON.parse(await readFile(nm(`${p}/package.json`), 'utf8')).version;
const manifest = {
  '@supabase/supabase-js': await ver('@supabase/supabase-js'),
  'tesseract.js': await ver('tesseract.js'),
  'tesseract.js-core': await ver('tesseract.js-core'),
};
await writeFile(out('vendor/VERSIONS.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Vendored', manifest);
