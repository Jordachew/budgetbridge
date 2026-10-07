// Small helpers shared by the Trips, Map, Maintenance and Reminders screens.
import { useEffect, useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Modal, Button } from '../../components/ui.jsx';

/** Runs `open()` once when the URL carries ?new=1, then removes the flag (other params stay). */
export function useNewParam(open) {
  const [sp, setSp] = useSearchParams();
  const flag = sp.get('new');
  useEffect(() => {
    if (flag !== '1') return;
    open();
    const next = new URLSearchParams(sp);
    next.delete('new');
    setSp(next, { replace: true });
  }, [flag]);
}

/** Puts the cursor in the first field marked data-autofocus, after the Modal has taken focus for itself. */
export function useLateFocus(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => document.querySelector('[role="dialog"] [data-autofocus]')?.focus(), 40);
    return () => clearTimeout(t);
  }, [active]);
}

/** A Modal whose body is a real <form>: Enter submits, the footer button is the submit button. */
export function FormModal({ open = true, onClose, title, submitLabel, busy, onSubmit, children, wide, extra }) {
  const id = useId();
  useLateFocus(open);
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide}
      footer={<>{extra}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form={id} loading={busy}>{submitLabel}</Button></>}>
      <form id={id} noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>{children}</form>
    </Modal>
  );
}
