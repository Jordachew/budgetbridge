// Photo handling. Photos are shrunk before saving (phones take 5 MB+ pictures; a trucker on
// mobile data cannot upload those) and re-drawn on a canvas, which also removes hidden camera
// data such as the GPS location stored inside the photo.

export const MAX_UPLOAD_BYTES = 1_500_000;

function loadBitmap(file) {
  if (globalThis.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
    img.src = url;
  });
}
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

export function fitSize(w, h, max) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Returns a JPEG Blob no larger than ~1.5 MB. */
export async function shrinkPhoto(file, { maxDim = 1600, quality = 0.72 } = {}) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Please choose a picture.');
  const bmp = await loadBitmap(file);
  const { w, h } = fitSize(bmp.width, bmp.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let q = quality;
  let blob = await toBlob(canvas, 'image/jpeg', q);
  while (blob && blob.size > MAX_UPLOAD_BYTES && q > 0.35) { q -= 0.1; blob = await toBlob(canvas, 'image/jpeg', q); }
  if (!blob) throw new Error('Could not prepare the picture.');
  return blob;
}

/** A high-contrast greyscale copy for reading text (not saved). */
export async function forOcr(blob, maxDim = 1800) {
  const bmp = await loadBitmap(blob);
  const { w, h } = fitSize(bmp.width, bmp.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)) | 0; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return toBlob(canvas, 'image/png');
}

/** Finger-signature pad. Returns controls; call toBlob() to get a PNG. */
export function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let dirty = false;
  const style = () => { ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; };
  const reset = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); style(); dirty = false; };
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)]; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); drawing = true; const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke(); dirty = true; });
  canvas.addEventListener('pointermove', (e) => { if (!drawing) return; e.preventDefault(); const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop); canvas.addEventListener('pointerleave', stop);
  reset();
  return { clear: reset, isEmpty: () => !dirty, toBlob: () => toBlob(canvas, 'image/png') };
}
