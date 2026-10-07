# Handoff: deploy Roadbook to Vercel (for a session that has the Vercel CLI signed in)

The cloud session that built Roadbook **cannot deploy to Vercel**: its Vercel connector is read-only and
not signed in to the owner's account. This session has the Vercel CLI authenticated as `jordachew`,
so it should create the project once and link it to GitHub. After that, every push to GitHub deploys
automatically and the other session never needs Vercel access again.

## Prompt to paste into the other session

> Deploy the Roadbook app to Vercel as a NEW project. Do not touch any existing Vercel project and do not
> use any QBO work.
>
> Repo: `Jordachew/budgetbridge` (GitHub). The app lives in the `roadbook/` subfolder, not the repo root.
> The repo root is a different app (BudgetBridge) - leave it alone.
>
> 1. `git clone https://github.com/Jordachew/budgetbridge.git && cd budgetbridge/roadbook`
>    (use `main` for now; later the work moves to `main` through pull requests).
> 2. `vercel link` -> create a NEW project named `roadbook`, scope = the `jordachew` account.
> 3. Connect it to Git so pushes auto-deploy: `vercel git connect https://github.com/Jordachew/budgetbridge`.
>    In the Vercel dashboard for the project, set **Settings -> General -> Root Directory = `roadbook`**
>    (the CLI cannot always set this; if you cannot, tell me).
> 4. Do NOT override build settings. `roadbook/vercel.json` already defines the build command, the output
>    folder (`dist`) and the security headers.
> 5. `vercel deploy --prod` once, to get a first live URL.
> 6. Report back: the production URL, the project name, and whether Git auto-deploy is connected and what
>    the Root Directory is set to.
>
> Do not change any application code. If the build fails, paste the first error and stop.

## After it is live (the owner does these, or tell the cloud session the URL and it will check)

1. Supabase -> Authentication -> URL Configuration: set **Site URL** to the production URL and add it to
   **Redirect URLs**. Without this, sign-up/confirm and password-reset emails send people to the wrong place.
2. Supabase -> Authentication: turn **Confirm email** on, minimum password length 8 or more.
3. Supabase -> SQL Editor: run `roadbook/supabase/schema.sql`, then (once the rebuild lands)
   `roadbook/supabase/v2.sql`. Both are safe to run repeatedly.
4. Fill in the `[bracket]` placeholders in the privacy and accessibility pages.
5. Test on two phones (sign up, create a load, see it sync).

## Notes for whoever picks this up

- GitHub Pages workflow also exists (`.github/workflows/roadbook-pages.yml`) as a fallback preview; Vercel
  is the real host because it can set the security headers (CSP, frame-ancestors, etc.).
- Supabase project already referenced by the app: `jftbchpkltnzhxusyfiu` (public URL and publishable key
  only; never put a service_role key in the app).
- The React rebuild (PR #5) replaces the original plain-JavaScript UI. `roadbook/vercel.json` in that PR already uses
  `npm ci` + `npm run build` with output `dist`. Once Git auto-deploy is connected, merging it deploys with no further steps.
