# Roadbook 2

Trucking operations for owner-operators and fleets. Installable on a phone (PWA), works with no signal, and keeps working
without an account (records stay on the device).

**What it does:** dashboard and profit reports, loads with delivery proof, expenses with receipt scanning and fuel economy,
invoices with printable PDFs and payment tracking, trips by GPS or odometer, map with fuel prices and route plans,
vehicles, service log and document expiry, reminders, and a fleet side (dispatch, chat, road alerts, driver settlements).

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # makes dist/
npm run serve      # serves dist/ with the production security headers on :8080
npm test           # lint, 52 logic tests, 32 database tests, build
```
Camera, GPS and install need HTTPS on a real phone (localhost counts as secure on the computer only).

## Set up the backend (Supabase), once
1. Create a Supabase project. Note the region (the privacy notice must say where data is stored).
2. SQL Editor: run `supabase/schema.sql`, **then** `supabase/v2.sql`. Always run `v2.sql` after `schema.sql` (schema.sql resets table permissions). Both are safe to run again.
3. Put the project URL and the **publishable** key in `public/config.js` (never the service_role key), and set `supportEmail`.
4. Authentication: turn **Confirm email** on, minimum password length 8 or more, add the real app URL under Site URL and Redirect URLs, set up custom SMTP before going live.
5. Run Database, Advisors (security and performance) and read them.

## Host it
Build settings are in `vercel.json` (Vercel: import the repo, Root Directory `roadbook`; it applies the security headers).
`.github/workflows/roadbook-pages.yml` publishes to GitHub Pages as a preview (no custom headers there).
Any static host works: publish `dist/`.

## How it is built
React 18, Vite, Tailwind 4, react-router (hash routes), recharts, Leaflet, lucide icons.
Data is saved to IndexedDB first (`src/core/store.js`) and synced to Supabase by `src/core/sync.js`; screens never call
Supabase directly. See `docs/BUILD_GUIDE.md` for conventions. A strict Content-Security-Policy is applied (no inline scripts or styles).

## Honest limits
* A web app cannot notify or speak when fully closed; reminders fire while the app is open (use "Add to my calendar" for the rest).
* GPS can pause when the phone locks; odometer entry is the fallback.
* Receipt scanning reads on the phone and only suggests values. Blurry photos give wrong numbers.
* Map tiles, address search and nearby fuel stations use OpenStreetMap services and need a connection.
* Last edit wins if two devices edit the same record offline.
* A fleet owner sees a driver's records only if the driver chose to share. An owner's device does not download a sharing driver's own loads (only loads the owner dispatched), so settlement totals are exact for dispatched loads.
* Not yet exercised against a live Supabase project: do a real two-phone test (sign up, dispatch a load, chat, settle) before handing it to clients.
* Legal pages (`public/privacy.html`, `public/accessibility.html`) still contain `[bracket]` placeholders to fill in and have a lawyer review.
