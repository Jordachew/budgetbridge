// Photos and documents. Saved on the device first (works offline), uploaded when there is signal.
import { useEffect, useState } from 'react';
import * as store from '../core/store.js';
import { shrinkPhoto } from '../core/images.js';
import { session } from '../state/app.jsx';
import { uuid } from '../core/util.js';

/** Saves a picked photo/PDF and returns the storage path to keep on the record, e.g. "<uid>/receipts/<id>.jpg". */
export async function savePicked(file, folder) {
  const uid = store.userId() === 'local' ? 'local' : store.userId();
  const isImage = /^image\//.test(file.type);
  const blob = isImage ? await shrinkPhoto(file) : file;
  if (!isImage && file.size > 5_000_000) throw new Error('That file is too big (5 MB maximum).');
  const ext = isImage ? 'jpg' : (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${uid}/${folder}/${uuid()}.${ext}`;
  await store.getDb().putFile(path, blob, false);
  session.sync?.schedule(1500);
  return path;
}

/** Blob URL for a stored file path (device copy first, then the server). null while loading or missing. */
export function useFileUrl(path) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true; let made = null;
    setUrl(null);
    if (!path) return undefined;
    (async () => {
      try {
        const blob = session.sync ? await session.sync.fetchFile(path) : (await store.getDb().getFile(path))?.blob;
        if (live && blob) { made = URL.createObjectURL(blob); setUrl(made); }
      } catch { /* offline and not cached: no preview */ }
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}
