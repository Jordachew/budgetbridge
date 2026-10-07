// Finger signature pad with Undo (last stroke) and Clear. Controls are exposed on padRef.current.
import { useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import { Button } from '../../components/ui.jsx';

const W = 960; const H = 540;

export default function SigPad({ padRef, onInk }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let cur = null;
    const paint = () => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const s of strokes.current) {
        ctx.beginPath();
        if (s.length === 1) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[0][0] + 0.1, s[0][1] + 0.1); } else {
          ctx.moveTo(s[0][0], s[0][1]);
          for (let i = 1; i < s.length - 1; i++) ctx.quadraticCurveTo(s[i][0], s[i][1], (s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2);
          ctx.lineTo(s.at(-1)[0], s.at(-1)[1]);
        }
        ctx.stroke();
      }
    };
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };
    const sync = () => { setCount(strokes.current.length); onInk?.(strokes.current.length > 0); };
    const down = (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); cur = [pt(e)]; strokes.current.push(cur); paint(); sync(); };
    const move = (e) => { if (!cur) return; e.preventDefault(); cur.push(pt(e)); paint(); };
    const up = () => { cur = null; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    paint();
    padRef.current = {
      clear: () => { strokes.current = []; paint(); sync(); },
      undo: () => { strokes.current.pop(); paint(); sync(); },
      isEmpty: () => strokes.current.length === 0,
      toBlob: () => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the signature.'))), 'image/png')),
    };
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
    };
  }, [padRef, onInk]);

  return (
    <div>
      <div className="relative mx-auto w-full overflow-hidden rounded-[10px] border-2 border-ink-800 bg-white shadow-inner dark:border-ink-300">
        <canvas ref={canvasRef} width={W} height={H} aria-label="Signature box. Draw with a finger or mouse." className="block aspect-video w-full touch-none" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-9 flex items-end gap-2 border-b-2 border-dashed border-ink-300">
          <span className="pb-1 text-2xl font-bold leading-none text-ink-300">x</span>
        </div>
        {count === 0 && <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-ink-400">Receiver signs above the line</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="outline" icon={Undo2} className="!h-11 flex-1" disabled={count === 0} onClick={() => padRef.current?.undo()}>Undo</Button>
        <Button variant="outline" icon={Eraser} className="!h-11 flex-1" disabled={count === 0} onClick={() => padRef.current?.clear()}>Clear</Button>
      </div>
    </div>
  );
}
