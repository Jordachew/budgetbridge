// Delete with an Undo toast. Deleting is a soft delete (deleted_at), so undo just clears it again.
import { save, remove } from '../state/data.js';

/** await softDelete(toast, 'expenses', row, 'Expense deleted') */
export async function softDelete(toast, table, row, message = 'Deleted') {
  await remove(table, row.id);
  toast(message, { ms: 7000, action: { label: 'Undo', run: () => save(table, { ...row, deleted_at: null }) } });
}
