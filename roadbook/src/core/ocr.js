// Reads text off a receipt photo, on the phone. The photo is never sent anywhere for reading.
// The reading engine (about 5 MB) is only downloaded the first time a driver scans a receipt, then cached.

import { forOcr } from './images.js';

let loading = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the receipt reader.'));
    document.head.append(s);
  });
}

export async function readReceipt(blob, onProgress = () => {}) {
  if (!window.Tesseract) {
    loading ||= loadScript('vendor/tesseract/tesseract.min.js');
    try { await loading; } catch (e) { loading = null; throw e; }
  }
  onProgress(0.05);
  const clean = await forOcr(blob);
  const worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: new URL('vendor/tesseract/worker.min.js', location.href).href,
    corePath: new URL('vendor/tesseract/', location.href).href,
    langPath: new URL('vendor/tesseract/', location.href).href,
    workerBlobURL: false,
    logger: (m) => { if (m.status === 'recognizing text') onProgress(0.1 + 0.9 * m.progress); },
  });
  try {
    const { data } = await worker.recognize(clean);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
