# BudgetBridge

A budget, planning and run-rate tool for a marketing / corporate-communications
team — budget vs. actual comparison, spend visualizations, year-end run-rate
forecasting, and transaction-level drill-down into your actuals.

It's a static web app: no server, no build step, no install. Open `index.html`
in a browser and it works — including fully offline, since Chart.js and
SheetJS are vendored in `vendor/` rather than loaded from a CDN.

## What it does

- **Dashboard** — portfolio KPIs (budget, actual, encumbered, balance,
  projected year-end spend), a cumulative spend-vs-budget-pace chart, and a
  "categories to watch" list ranked by projected variance.
- **Budget vs. Actual** — an expandable category → project table with
  budget/actual/encumbered/committed/balance and a status chip per line,
  search, filter and CSV export.
- **Run Rate & Forecast** — for the whole portfolio or any single project:
  projected year-end spend = year-to-date actual + (average monthly actual ×
  remaining months), compared to budget, with a status of On track / Watch /
  At risk / Over budget.
- **Drill-Down** — category → project → every underlying transaction, with
  search, vendor/type filters, sorting, pagination and CSV export.
- **Planning** — an editable budget-input grid (monthly or quarterly) per
  project, with add/remove categories and projects, and a "copy from another
  fiscal year" helper.
- **Data & Settings** — import actuals, import a budget template, export/
  import a shareable workbook, manage categories/projects, and see exactly
  what's stored and where (see below).

## Do you need a database?

No — and here's the reasoning, since it drives how this tool is built:

**Everything runs in your browser.** BudgetBridge stores its data in
IndexedDB, a local database built into every browser. There's no server, no
login, no data leaving your machine. This is enough for one person exploring
or maintaining the numbers.

**For a team, the shared file *is* the database.** Go to
**Data & Settings → Share workbook → Export workbook** to download a single
`.xlsx` with your categories, projects and budget plan (optionally with full
transaction detail too). Save that file into a shared drive folder — Google
Drive, OneDrive, SharePoint, whatever your team already uses. Everyone else
opens BudgetBridge in their own browser and uses **Import workbook** to pull
that file in. It's the same mental model as a shared Excel workbook that
lives on a drive: simple, needs no IT setup, and works for any team size that
doesn't need simultaneous editing.

**The trade-off:** this is "pass-the-file" collaboration, not real-time
co-editing. Two people editing the Planning grid at the same moment can
overwrite each other, the same way two people editing an Excel file on
OneDrive can. In practice this works well with a simple convention: one
**Budget Owner** per planning cycle exports after each editing session;
everyone else uses Import to view the latest numbers, or works off the CSV
exports from Budget vs. Actual / Drill-Down for their own analysis.

**If you outgrow that** (multiple people need to edit budget numbers at the
same time, or you want a permanent audit trail of who changed what), the
natural upgrade path is to swap the storage layer for something that supports
concurrent writes — a Google Sheet via the Sheets API, or a small hosted
database (e.g. Supabase/Postgres). `js/store.js` is the single place that
talks to storage today (via `js/db.js`), so that swap wouldn't touch the
views, charts or calculations at all. That's a deliberate design choice, not
a missing feature — it just wasn't needed for the workflow described (a
marketing team periodically updating a plan and reviewing actuals), so it
wasn't built until it's actually needed.

**Actuals refresh the same way budgets do:** re-run your GL/ERP export
periodically and drop it into **Data & Settings → Import actuals**. Rows are
matched by a stable transaction key, so importing the same file twice updates
in place instead of duplicating.

## Getting a shared copy running

1. Open `index.html` once yourself and click **Load sample data** to see the
   tool with a fabricated demo dataset (nothing here is real financial data —
   see "About the sample data" below).
2. Go to **Data & Settings → Import actuals** and drop your GL/ERP export.
   Recognized column headers (`Gl Accounts`, `Accounted Net`, `Gl Period`,
   etc. — the shape of a typical Oracle/JDE-style GL extract) import
   automatically. Anything else opens a one-time column-mapping step, so a
   differently-shaped export still works.
3. Set up your categories and projects in **Data & Settings → Categories &
   projects** (or import an existing quarter/category budget template from
   **Import actuals → Budget planning template**), then enter numbers in
   **Planning**.
4. Export a workbook (**Data & Settings → Share workbook**) and put it in a
   shared drive folder. Send the folder's `index.html` + workbook location to
   your team, or host the app (see below) and just share the workbook.

### Running it for real use

Any of these work, in increasing order of convenience:

- **From a shared drive folder.** Put this whole project folder (or just
  `index.html`, `css/`, `js/`, `vendor/`, `data/`) in the shared drive folder
  alongside the exported workbook. Anyone opens `index.html` directly from
  the synced folder — no server needed, works offline once synced.
- **Hosted as a static site.** GitHub Pages, Netlify, Vercel, or an internal
  web server — point it at this folder and it just works, since it's plain
  HTML/CSS/JS with no build step to run at deploy time. This is nicer for
  onboarding (one URL to share) but the data storage model is unchanged: each
  visitor's browser is still the only place their imported data lives, and
  the shared workbook is still how the team stays in sync.

### SharePoint / OneDrive specifically

Putting the folder in a SharePoint document library works — but only if you
**sync that library to a local folder** (the "Sync" button in SharePoint, or
via the OneDrive app) and open `index.html` from the synced local copy.
Clicking `index.html` from SharePoint's browser interface *without* syncing
generally won't run it — SharePoint Online previews or downloads HTML files
instead of executing them, since most tenants disable custom script
execution in document libraries for security. Once synced locally, it's a
completely normal local file and works exactly as described above.

### A note on how `index.html` loads its code

Opening `index.html` straight from disk (double-clicking it, or opening it
from a synced drive folder) works with **no server required** — but this
depends on `index.html` loading a single pre-built script
(`js/app.bundle.js`), not the individual `js/*.js` files directly. Browsers
block ES module imports (`<script type="module">`) from the `file://`
protocol for security, so if `index.html` referenced the source files
directly, it would load a blank sidebar and silently do nothing when opened
without a server — no visible error unless you check the browser console.
This is also why, if you were serving an *older* copy of this project from a
plain `file://` open and saw nothing happen, that was the cause.

**If you edit the source** (anything under `js/`, other than
`app.bundle.js` itself), rebuild the bundle before testing:

```bash
npx esbuild js/app.js --bundle --outfile=js/app.bundle.js --format=iife --target=es2018
```

`index.html` only ever loads `js/app.bundle.js`; the individual `js/*.js`
files exist for readability and editing, not to be loaded directly.

## Project structure

```
index.html            App shell — loads vendor libs and js/app.bundle.js
css/styles.css         Design tokens (light + dark) and component styles
js/
  app.bundle.js           The file index.html actually loads — a built,
                           dependency-free bundle of everything below (see
                           "Editing the source" if you change app.js/store.js/etc.)
  app.js                Router, sidebar/topbar, focus-safe re-rendering
  store.js               Central state + persistence orchestration
  db.js                   IndexedDB wrapper
  parsers.js              Excel/CSV import (GL export, budget template, workbook)
  calc.js                 Aggregation, run-rate and comparison math
  charts.js                Chart.js styling helpers
  ui.js                     Toasts, modals, small DOM helpers
  views/                    One module per screen (dashboard, comparison, …)
data/demo/demo-data.js  Synthetic sample dataset generator
vendor/                 Chart.js + SheetJS (xlsx), vendored for offline use
```

## About the sample data

The category names (Advertising, Sponsorships, Events, etc.) are generic and
common to most marketing/corp-comm budgets, but every number, vendor name and
transaction in the "Load sample data" dataset is fabricated by a seeded
generator (`data/demo/demo-data.js`) — none of it is real. Use it to explore
the UI, then clear it (**Data & Settings → Storage & danger zone → Erase
everything**) before loading your real figures.

## Browser support

Any current version of Chrome, Edge, Firefox or Safari. Requires IndexedDB
(on by default everywhere except private/incognito windows in some
browsers, where storage may be cleared when the window closes).
