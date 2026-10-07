import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const dismiss = (n) => setItems((l) => l.filter((x) => x.id !== n));
  const toast = useCallback((text, { bad = false, ms = 4500, action } = {}) => {
    const n = ++id.current;
    setItems((l) => [...l.slice(-2), { id: n, text, bad, action }]);
    if (ms) setTimeout(() => dismiss(n), ms);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="fixed inset-x-0 bottom-20 md:bottom-6 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${t.bad ? 'bg-red-600 text-white ring-red-700' : 'bg-ink-900 text-white ring-ink-700 dark:bg-ink-100 dark:text-ink-900'}`}>
            {t.bad ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span className="flex-1">{t.text}</span>
            {t.action && <button className="font-semibold underline" onClick={() => { t.action.run(); dismiss(t.id); }}>{t.action.label}</button>}
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={16} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
