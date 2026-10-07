# Roadbook v2 build guide (for anyone adding screens)

Stack: React 18, Vite, Tailwind v4, react-router (hash router), recharts, leaflet, lucide-react icons.
Data: offline-first. Everything is saved to IndexedDB first (`src/core/store.js`) and synced to Supabase
by `src/core/sync.js`. Screens NEVER talk to Supabase; they read/write the store.

## Reading and writing data
```js
import { useRows, useRow, save, create, remove, useProfile } from '../state/data.js';
const expenses = useRows('expenses');          // live, non-deleted rows; re-renders on change
await create('expenses', { category:'fuel', amount_cents: 1250000, currency:'JMD', paid_by:'driver', spent_at: new Date().toISOString() });
await save('expenses', { ...row, note:'x' });  // update (row must include id)
await remove('expenses', row.id);              // soft delete (sets deleted_at; syncs)
```
- Ids are client-made UUIDs (`create` does it; `uuid()` from `core/util.js`). `user_id`, `created_at`, `updated_at` are stamped by the store.
- Money is ALWAYS integer cents. Distances ALWAYS integer metres. Timestamps are ISO strings (timestamptz); `date` columns are 'YYYY-MM-DD'.
- Tables and their columns: see `supabase/schema.sql` (loads, expenses, income, trips, deliveries, reminders,
  route_plans, messages, road_alerts) and `supabase/v2.sql` (vehicles, invoices, maintenance, documents, places, settlements).
  Only use columns that exist; the server rejects unknown columns and check-constraint violations.
  Respect the length limits and enums in the SQL (e.g. expense category list, load status list).
- Local-only fields start with `_` (`_dirty`, `_v`); never write them.
- Pure helpers: `core/calc.js` (sumCents, byCategory, loadFinance, settleUp, fuelEconomy, currentOdometer...),
  `core/format.js` (fmtMoney, parseMoney, fmtDate, fmtDateTime, toLocalInput/fromLocalInput, toDateInput, fmtDistance, parseDistance, initials...),
  `core/dates.js` (periodRange, inRange), `core/receipt.js` (CATEGORIES, parseReceiptText), `core/ocr.js` (readReceipt(blob,onProgress)),
  `core/geo.js` (haversine, mapsLink, wazeLink, pathLength), `core/gps.js` (getPositionOnce; the live tracker is `session.tracker` from `state/app.jsx`),
  `core/csv.js` (toCSV(rows, columns)), `core/ics.js` (buildICS), `core/reminders-logic.js`, `core/phrases.js` (ALERT_KINDS), `core/hash.js` (proofHash), `core/images.js` (signaturePad, shrinkPhoto).
- Hooks: `lib/hooks.js` -> `useMoney()` (money(cents,cur?)), `useCurrency()`, `useDistance()`.
- Files (photos, PDFs): `lib/files.js` -> `savePicked(file, 'receipts')` returns a storage path to put on the row; `useFileUrl(path)` returns a blob URL for display.
- Who am I / crews: `useApp()` from `state/app.jsx` -> `{ isAccount, user, crews, rosters, online, status, refreshCrews }`.
  `session.api` (account mode only) has crew RPC wrappers: createCrew, joinCrew, roster, report, setMemberRole, removeMember, joinCode, newJoinCode, updateCrew, leaveCrew, deleteCrew, setShare, deleteMessage, clearAlert (see `core/api-supabase.js`). `crews[i].role` is 'owner' | 'admin' | 'driver'.

## UI kit (src/components/ui.jsx) - use it, do not invent new primitives
Button (variants primary|dark|soft|ghost|danger|outline; sizes sm|md|lg; `icon={LucideIcon}`; `loading`), IconButton, Card, CardTitle, PageHeader, Badge (tone neutral|green|amber|red|blue|brand),
Stat, Empty, Banner, Field (render-prop gives the input id), Input, Textarea, Select, Segmented, Chips, Switch, Modal (open,onClose,title,footer,wide), useConfirm() -> [confirm, node], Table (columns,rows,onRow),
`cx()` class joiner. Toasts: `const toast = useToast()` from `components/toast.jsx`. Period filter: `components/PeriodPicker.jsx` (PeriodPicker + rangeOf).
Category icons/colours: `lib/categories.js`.

## Design rules
- Modern, clean dashboard look: white cards on a light grey page (dark mode supported through `dark:` classes), brand orange `brand-500` for primary actions, `ink-*` slate neutrals. Generous spacing, rounded-2xl cards, tabular numbers for money.
- Mobile first: must work at 375px wide. Tables must scroll or collapse into cards on small screens (`hide` on low-priority columns). Tap targets >= 40px.
- Every list needs an Empty state with a clear call to action. Every form validates and shows plain-language errors. Destructive actions confirm.
- No `dangerouslySetInnerHTML`, no inline `<style>`, no external scripts or CDNs. (A strict CSP is on.) `style={{}}` props are fine.
- Accessibility: labels on all inputs (use Field), buttons have text or aria-label, colour is never the only signal, charts have a text summary or table alternative.
- Charts: recharts. Use `components`' colours via `CATEGORY_COLORS` or brand/ink palette; give charts `role="img"` and an `aria-label` summary.
- Pages are default-exported React components in `src/pages/`, routed with a trailing `/*` (see `src/main.jsx`) so sub-routes can use `<Routes>` or search params. Keep one file per page, split big pages into `src/pages/<name>/*.jsx` parts.

## Checks before you finish
`npx eslint src` must be clean. `npx vite build --outDir /tmp/<yourname>-dist --emptyOutDir` must succeed (use your own outDir; other people build at the same time).
Do not edit files you do not own (shared files: `src/components/*`, `src/state/*`, `src/core/*`, `src/lib/*`, `src/main.jsx`). If you need a shared change, make it additive and tiny, or put the helper in your own page folder.
