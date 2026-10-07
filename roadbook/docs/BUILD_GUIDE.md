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

## Design system v2 ("Asphalt & Signal") - READ THIS BEFORE RESTYLING A PAGE
Derived from the dataviz, theme-factory and web-artifacts-builder skills. The first pass of the app looked like generic SaaS; this pass must not.

**Look**
- Fonts: Atkinson Hyperlegible for all UI text and ALL figures (stat values, hero figure, tables); Barlow Condensed (`font-display`) for page titles, card titles and nav groups only. No Inter. Never a display face on a number.
- Colour: warm paper page (`var(--paper)`), cards are `paper-card` (hairline border, 10px radius, no heavy shadow). Single accent = signal amber (`brand-500` fill with `text-ink-950` on top; `brand-600` for amber TEXT on paper). Dark asphalt sidebar. Do not use purple/gradients. Do not wrap everything in the same rounded-2xl card: vary the composition (a hero strip, a ruled list, a ledger table, a full-bleed band) and break symmetry; avoid centred layouts, left-align.
- Radii: cards 10px, buttons/inputs 6px, badges 4px (uppercase, bold), chips pill, plates 3px. Not uniform.
- Motifs (use sparingly, with purpose): `roadline` dashed amber divider (PageHeader already has it), `Plate` for registrations/references, waybill-style load cards, odometer-style readouts.
- Status = icon + label + colour, never colour alone. Status colours are reserved (`var(--good)`, `var(--warn)`, `var(--bad)`); never reuse them as series colours.

**Charts: use `src/components/charts` only (Bars, Trend, HBars, Spark, ChartFrame). Do NOT use recharts any more** - remove its imports from your pages (the dependency is being deleted).
- Fixed categorical order: series slot 1 blue, 2 orange, 3 aqua... Colour follows the ENTITY not its rank (pass `slot` on a series to pin it: revenue slot 0, expenses slot 1, always). Max 8 series; fold the rest into "Other" (HBars does this). One series = one colour; never a value ramp on nominal categories; no dual axes; no dashed grid; no number on every point.
- Every chart sits in `ChartFrame` (title, legend for 2+ series, Chart/Table toggle, textures via the Settings accessibility switch). Every chart gets a `summary` string stating the takeaway in words (it is read by screen readers). Tooltips are built in.
- ONE filter row (PeriodPicker etc.) ABOVE all the charts it scopes, never inside a chart card. A stat tile or a hero figure is better than a chart for a single number; exactly ONE hero figure per page (>=48px, `text-5xl`+).
- Text never wears a series colour: labels in ink tokens with a coloured mark beside them.

**UX rules (each page must have these)**
1. First-use state: an `Empty` that says what the page is for and offers the primary action, not just "nothing here".
2. Loading: no flash; use `Skeleton` only for genuinely async work (files, geocoding), never for local data.
3. Deleting uses `softDelete(toast, table, row, 'message')` from `lib/undo.js` (Undo toast) instead of a blocking confirm, except for irreversible things.
4. `?new=1` on the page URL opens the create form (the New menu and shortcuts link to it); `?tab=` selects a tab where the page has tabs. Keep working with `useSearchParams`.
5. Forms: big touch targets (>=44px on mobile), autofocus the first field, numeric inputs use `inputMode="decimal"`, inline plain-language errors, a sticky footer with the primary button, Enter submits, Esc closes.
6. Every list has search/filter if it can exceed ~10 rows, and shows counts/totals. Dates are relative where it helps ("Today", "Yesterday", "in 3 days") with the exact date on hover/title.
7. Keyboard: all interactive things reachable; `aria-label`s on icon buttons; focus rings are provided globally.
8. Mobile first at 390px; no horizontal page scroll; wide tables collapse to stacked rows or scroll inside their own container.
9. Dark mode must look intentional: check it.
10. Copy: plain words for drivers, sentence case, no jargon, verbs on buttons ("Record payment", not "Submit").

**Helpers added:** `components/ui.jsx` (Button, Card, Badge with icon, Stat, Plate, Kbd, Skeleton, Meter, Empty, Banner...), `lib/undo.js`, `lib/attention.js` (`useAttention()` ranked "needs attention" items), `lib/demo.js` (`loadDemo`, `clearDemo`, `hasDemo` - guest mode sample data), `lib/search.js`.
