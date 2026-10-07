// React bindings for the on-device store. Screens call useRows('expenses') and re-render when it changes.
import { useEffect, useReducer, useMemo } from 'react';
import * as store from '../core/store.js';

/** Re-renders when any of the named tables change (or any table if none are named). */
export function useStoreVersion(tables) {
  const [v, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => store.onChange((changed) => {
    if (!tables || changed.some((t) => tables.includes(t))) bump();
  }), []);
  return v;
}

/** Live (not deleted) rows of a table. */
export function useRows(table) {
  const v = useStoreVersion([table]);
  return useMemo(() => store.rows(table), [table, v]);
}

/** One row by id (or undefined). */
export function useRow(table, id) {
  const v = useStoreVersion([table]);
  return useMemo(() => (id ? store.find(table, id) : undefined), [table, id, v]);
}

export function useProfile() {
  const v = useStoreVersion(['profile']);
  return useMemo(() => store.getProfile(), [v]);
}

export { save, create, remove, find, rows, userId } from '../core/store.js';
