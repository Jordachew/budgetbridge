# BudgetBridge

A budget, planning and run-rate tool for a marketing / corporate-communications
team — budget vs. actual comparison, spend visualizations, year-end run-rate
forecasting (including open commitments), and transaction-level drill-down
into your actuals.

It runs as a small local-network server: one person starts it, everyone else
on the same office/VPN network opens it in a browser. There's no cloud
account, no external database, and no per-seat licensing — just Node.js and
a single SQLite file.

## What it does

- **Dashboard** — portfolio KPIs (budget, actual, encumbered, balance,
  projected year-end spend), a cumulative spend-vs-budget-pace chart, and a
  "cost item groups to watch" list ranked by projected variance.
- **Budget vs. Actual** — an expandable cost item group → cost item table
  with budget/actual/encumbered/committed/balance and a status chip per
  line, search, filter and CSV export.
- **Run Rate & Forecast** — for the whole portfolio or any single cost item:
  projected year-end spend = committed-to-date (actual + open encumbrances)
  + (average monthly actual × remaining months), compared to budget. A line
  already over budget — even just from open POs, before any invoice posts —
  is flagged **Over budget** immediately, not just when the year-end
  projection crosses the line.
- **Drill-Down** — cost item group → cost item → every underlying
  transaction (invoice, purchase order, credit memo, journal entry — see
  "Document type" below), with search, vendor/type filters, sorting,
  pagination and CSV export.
- **Planning** — an editable budget-input grid (monthly or quarterly) per
  cost item, with add/remove cost item groups and cost items, a note field
  per cost item per fiscal year, and a "copy from another fiscal year"
  helper. Every manager's entries roll up into the same shared plan the
  moment they save — there's nothing to merge or reconcile afterward.
- **Data & Settings** — import actuals, import a budget template, manage
  cost item groups/cost items, manage who can sign in and what they can
  edit, and download an offline backup.

### Document type (invoices, POs, credit memos, journal entries)

Every transaction in Drill-Down carries a **Document type** — classified
from your GL export's document code into a plain label (Invoice, Purchase
Order, Credit Memo, Journal Entry, …) via `friendlyDocType()` in `calc.js`.
Filter by it alongside vendor and actual/encumbered basis, so you can see,
for example, just the open purchase orders against a cost item, or just its
posted invoices.

## How data is stored, and why

**One shared SQLite database file, on the machine running the server.**
There's no cloud dependency and nothing to sync — every manager's browser
reads and writes the same file over your local network, so a budget number
one manager enters is visible to everyone else (and rolled into portfolio
totals) as soon as they save it. This is what makes the "multiple managers,
one consolidated budget" requirement work without a manual merge step: the
server is the one source of truth, not each person's browser.

**Why not just a shared Excel file or a browser-only tool?** Two or more
people editing the same workbook at once overwrite each other's changes, and
a browser-only (IndexedDB) tool keeps each person's data trapped in their
own browser with no way to roll up automatically. A tiny local server avoids
both problems without requiring a cloud account, an IT ticket, or a
recurring bill — it's just a Node.js process and a database file that live
on a machine already on your network.

**Why not a hosted/cloud database?** Nothing about this design rules that
out later — `server/db.js` is the only place that talks to storage, so
swapping SQLite for Postgres or similar wouldn't touch the frontend at all.
It just isn't necessary for a team working from one office/VPN network, and
staying local-only means no data ever leaves your network and there's
nothing to configure with an outside vendor.

**Backups.** **Data & Settings → Backup → Download a backup** gives anyone
(not just the admin) a point-in-time `.xlsx` snapshot of the cost item
groups, cost items, budget plan and notes (optionally with full transaction
detail) — useful for an audit trail, a read-only copy to email someone, or
peace of mind. The database itself is a single file
(`data/budgetbridge.db` by default); back it up the way you'd back up any
important file on that machine.

## Who can do what

Every signed-in person can **see everything** — the whole portfolio, every
cost item group, every manager's numbers — because the rollup view is the
point. **Editing** is scoped:

- **Admin** — full access: manage cost item groups, create/assign/remove
  people, import actuals, run the danger-zone actions (clear transactions,
  erase everything), and edit any budget line or cost item.
- **Manager** — can edit budget numbers, notes, and cost items only within
  the cost item group(s) an admin has assigned them to. Groups they don't
  manage show as read-only ("view only") everywhere, including Planning —
  so a manager sees the full company picture but can only change their own
  piece of it.

An admin assigns managers to groups from **Data & Settings → Users &
access**. There's no limit on how many managers can be assigned to a group,
or how many groups one manager can own.

## Running it

Requires **Node.js 22.5 or later** (for the built-in `node:sqlite` module —
no external database or npm dependencies to install).

```bash
npm start
```

That's it — no `npm install` step, no build step. The first time it runs,
it creates `data/budgetbridge.db` and prints a freshly generated admin
username and password to the terminal:

```
BudgetBridge server running at http://localhost:3000
On your local network, other machines can reach it at http://<this-machine's-IP>:3000
Database file: /path/to/budgetbridge/data/budgetbridge.db

First run — an admin account was created:
  Username: admin
  Password: ••••••••
Sign in and change this password (or create named accounts) right away.
```

Whoever runs `npm start` should note that password down (or change it
immediately after signing in, from **Data & Settings → My account**) — it's
only ever shown once, in that terminal output.

**For everyone else on the team:** find the server machine's local network
IP address (the terminal output prints it, or ask whoever started it) and
open `http://<that-ip>:3000` in a browser. No install needed on their end —
just a browser and access to the same network. The server needs to keep
running (on that machine, or a small always-on machine/server on your
network) for the app to stay reachable; if it's stopped, restarting it with
`npm start` picks up right where the database left off — nothing is lost.

### Configuration

Both are optional environment variables:

- `PORT` — which port to listen on (default `3000`).
- `BUDGETBRIDGE_DATA_DIR` — where to store the database file (default
  `./data` inside the project folder).

```bash
PORT=8080 BUDGETBRIDGE_DATA_DIR=/srv/budgetbridge-data npm start
```

### Getting your first data in

1. Sign in as the seeded admin.
2. **Data & Settings → Cost item groups & cost items** — set up your cost
   item groups (e.g. "Advertising & Media") and cost items within them (or
   import an existing quarter/category budget template from **Import
   actuals → Budget planning template**).
3. **Data & Settings → Users & access** — create an account for each
   manager and assign them to the group(s) they own.
4. Managers sign in and enter their numbers in **Planning** — everyone
   (including the admin) sees the rollup immediately.
5. **Data & Settings → Import actuals** — drop your GL/ERP export whenever
   you want to refresh actuals. Recognized column headers (`Gl Accounts`,
   `Accounted Net`, `Gl Period`, etc. — the shape of a typical Oracle/JDE
   -style GL extract) import automatically; anything else opens a one-time
   column-mapping step, so a differently-shaped export still works. Rows are
   matched by a stable transaction key, so re-importing the same file
   updates in place instead of duplicating.

There is no sample or demo data anywhere in this build — the app starts
empty and only ever shows what you enter or import.

## Project structure

```
server/
  server.js              HTTP server, routing, session auth, all /api/* endpoints
  db.js                   SQLite schema, first-run admin seeding
  auth.js                 Sessions, cookies, permission checks
index.html                App shell — loads vendor libs and js/app.bundle.js
css/styles.css            Design tokens (light + dark) and component styles
js/
  app.bundle.js            The file index.html actually loads — a built,
                            dependency-free bundle of everything below (see
                            "Editing the source" if you change app.js/store.js/etc.)
  app.js                   Router, sidebar/topbar, login screen, focus-safe re-rendering
  api.js                   Fetch client for the server's /api/* endpoints
  store.js                 Central state + persistence orchestration
  parsers.js               Excel/CSV import (GL export, budget template)
  calc.js                  Aggregation, run-rate and comparison math
  charts.js                Chart.js styling helpers
  ui.js                    Toasts, modals, small DOM helpers
  views/                   One module per screen (dashboard, comparison, …)
vendor/                   Chart.js + SheetJS (xlsx), vendored for offline use
data/                      SQLite database lives here by default (git-ignored)
```

### Editing the source

`index.html` only ever loads `js/app.bundle.js`, a pre-built bundle — the
individual `js/*.js` files exist for readability and editing, not to be
loaded directly (browsers block ES module imports from being split across
many files unless served with the right setup, and bundling sidesteps that
entirely). If you edit anything under `js/` other than `app.bundle.js`
itself, rebuild it before testing:

```bash
npx esbuild js/app.js --bundle --outfile=js/app.bundle.js --format=iife --target=es2018
```

The server (`server/server.js`) needs no build step — it's plain
CommonJS Node.js, restart it (`npm start`) to pick up changes.

## Browser support

Any current version of Chrome, Edge, Firefox or Safari, on any device that
can reach the server machine over your local network.
