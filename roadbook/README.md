# Roadbook

An installable web app (PWA) for truck drivers: expenses and receipt scanning, mileage by GPS, loads and
delivery proof, reminders, route plans, crew chat and road alerts, and voice alerts. Made to be simple:
big buttons, plain words, works with no signal, light and night looks, text size up to "huge".

It works in two ways:
* **No account**: everything stays on the phone. No server is needed at all.
* **With an account** (your Supabase project): backup, several devices, crews (fleet owner + drivers), dispatching loads, chat and road alerts.

## 1. Try it on your computer (2 minutes)

```
npm install
npm run vendor      # copies the libraries and fonts into app/ (already done in this package)
npm run build       # makes dist/
npm run serve       # open http://localhost:8080
```
Camera, GPS and install need **HTTPS** on a real phone (localhost counts as secure on the computer only). Use a host from section 3.

## 2. Set up the backend (Supabase), once

**Shared project?** `supabase/schema.sql` can be installed into a Supabase project other apps already use: every table and function starts with `rb_`, it lives in schema `rb_private`, and it adds no trigger on `auth.users`. Logins are then shared with those apps; "delete my data" removes only Roadbook records, not the login.
`supabase/pending_delete_functions.sql` is the part of the install that contains DELETE statements, kept separate so it can be run by hand.

1. Create a project at supabase.com. Pick the region closest to your users and note it, because the privacy notice must say where data is stored.
2. **SQL Editor**: paste all of `supabase/schema.sql` and run it. It creates the tables, row-level security, the private file bucket and chat live updates. It is safe to run again.
3. **Project Settings, API**: copy the *Project URL* and the *publishable* key into `app/config.js`
   (`supabaseUrl`, `supabaseKey`; also set `supportEmail`). These two are public by design. **Never** put the secret / service_role key in the app.
4. **Authentication settings** (the app cannot set these for you):
   * Providers, Email: turn **Confirm email** on.
   * Password minimum length: **8 or more** (the app only checks this in the browser).
   * Site URL and Redirect URLs: add your real app address.
   * Turn on leaked-password protection if your plan has it. Multi-factor sign-in is worth enabling for fleet owners.
   * Set up custom SMTP before going live (the built-in email sender is limited to a few emails per hour).
5. Database, Advisors: run the Security and Performance checks and read them.
6. Turn on backups (Pro plan gives daily backups) and decide how long you keep deleted records: they are hidden, not erased, until the person deletes their account. A scheduled clean-up of old `deleted_at` rows can be added if your policy needs one.

## 3. Host it (pick one)

Always upload the contents of **`dist/`** after `npm run build`.

| Host | How |
|---|---|
| Vercel | New project, framework "Other", output folder `dist`, build command `npm run build` (or just drag the `dist` folder). `dist/_headers` is read by Netlify/Cloudflare; on Vercel copy the same headers into `vercel.json`. |
| Netlify / Cloudflare Pages | Publish directory `dist`. `_headers` is applied automatically. |
| GitHub Pages | Publish `dist`. GitHub Pages cannot set headers, so the page's own CSP tag still protects it, but `frame-ancestors` and the other headers are missing. |
| Your own computer / server | `node scripts/serve.mjs dist 8080` serves with the security headers. Put it behind HTTPS (for example a Cloudflare Tunnel or a reverse proxy). |

Each time you deploy, `npm run build` stamps a new version so phones pick up the update. A banner offers them the new version.
If you use a **custom Supabase domain**, add it to `connect-src` in `app/index.html` and in the headers (`scripts/build.mjs`, `scripts/serve.mjs`).

## Companies (multi-tenant)

A crew is one company. The creator is the **owner**; the owner can make **admins** (dispatchers) who can send loads, see the join code, read the team report and see drivers who chose to share. Drivers join with a code or a link like `https://your-app/#/join/CODE`. Companies cannot see each other, and the database refuses cross-company reads (tested). Company name, accent colour and office phone are set by the owner. Logos are not included yet.

## 4. Before you go live: fill in the legal pages

`app/privacy.html` and `app/accessibility.html` are linked from the welcome screen and Settings. Replace every yellow
`[bracket]` (organisation, contact, region, safeguards, dates), then have a lawyer read them. The privacy notice already describes
what Roadbook really collects and who can see it; if you change the app, change the notice.

## 5. Tests and checks

```
npm run lint         # code rules, including "no unsafe HTML insertion"
npm run test:unit    # 52 logic tests
npm run test:schema  # 26 database rule tests (an in-memory Postgres runs schema.sql)
npm run test:e2e     # 88 browser checks incl. accessibility (needs Playwright for Python + Chromium)
```

## 6. How it works (short)

* Plain JavaScript modules, no framework, no build step beyond copying files. Pages are built with `textContent`, never `innerHTML`.
* Strict Content-Security-Policy: no inline scripts or styles, only your own files and your Supabase project.
* Data is saved on the phone first (IndexedDB) and synced when there is signal. `app/js/api-supabase.js` is the only file that talks to Supabase.
* Receipt scanning reads the photo **on the phone** (Tesseract) and only suggests amounts; the driver always confirms.
* Delivery proof gets a SHA-256 fingerprint and, once sealed, the database refuses edits to its fields.

## 7. Honest limits (tell your clients)

* **A web app cannot speak or notify when it is fully closed.** Voice alerts, reminders and road warnings work while Roadbook is open (keep it on screen while driving; it asks the phone to keep the screen awake). For reminders when the app is closed, use "Add to my calendar" (.ics). Real push notifications would need a small server (not included).
* **GPS can pause when the screen locks** on some phones. Odometer entry is always available as a fallback.
* Receipt reading is a helper; photos that are blurry or crumpled give wrong numbers.
* Voice typing uses the browser's speech service (on Chrome that is Google); spoken alerts are produced on the phone.
* If two phones edit the same record while offline, the last one to sync wins (whole record). A record deleted on one phone can be brought back by a stale edit from another.
* A fleet owner with "share" switched on can read the driver's trips, loads, expenses, income and receipt photos. Whoever dispatched a load keeps seeing that load and its delivery proof.
* The delivery fingerprint shows the record was not changed afterwards. It is not legal evidence on its own: the time and place come from the driver's phone.
* This package was tested against an in-memory Postgres and a simulated Supabase client. **It has not yet been run against a live Supabase project**, so do the checklist in section 2 and a real two-phone test before handing it to clients.
* Legal points (breach-reporting deadlines under the Data Protection Act, disability-access duties) are for your lawyer.
