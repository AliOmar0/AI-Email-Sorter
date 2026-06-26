# Deploying Inbox AI (frontend + backend on Vercel)

This guide deploys the whole app on a single Vercel project:

- **Frontend** (`@workspace/inbox-ai`, a static React build) → served by Vercel as static files
- **Backend** (`@workspace/api-server`, Express) → Vercel serverless function under `/api`
- **Database** (Postgres for users + sessions) → **Neon**

Because the frontend and the API share one Vercel origin, the app runs in
**same-origin mode**: a normal session cookie is used for auth — no bearer
token, no `VITE_API_BASE_URL`, no cross-origin CORS. (Replit's all-in-one
deployment keeps working exactly as before; all of this is env-gated.)

## How it fits together

- `vercel.json` builds both pieces:
  - `build:vercel` esbuilds the Express app into `artifacts/api-server/dist/vercel.mjs`,
    which `api/index.mjs` re-exports as the serverless function.
  - `vite build` (with `BASE_PATH=/`) produces the static SPA into
    `artifacts/inbox-ai/dist/public`, which Vercel serves as `outputDirectory`.
- Rewrites:
  - `/api/(.*)` → the serverless function.
  - everything else → `/index.html` (SPA client-side routing fallback).

---

## 1. Create the database (Neon)

1. Sign up at https://neon.tech and create a project.
2. Copy the **connection string** (it looks like
   `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`).
   Keep the `?sslmode=require` — Neon requires TLS.
3. You'll paste this as `DATABASE_URL` on Vercel (step 2).

The `users` and `session` tables are created automatically the first time the
backend runs, so there's no manual migration step.

> If you want to pre-create the schema, run locally with `DATABASE_URL` pointed
> at Neon: `pnpm --filter @workspace/db run push`.

## 2. Deploy on Vercel

1. Push this repository to GitHub.
2. At https://vercel.com, **Add New → Project** and import the repo.
3. **Leave the Root Directory at the repository root** (do not point it at a
   subfolder). The included `vercel.json` drives the build and routing.
4. Add these **Environment Variables** (Production):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon connection string |
   | `SESSION_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
   | `GOOGLE_CLIENT_ID` | from Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
   | `DEEPSEEK_API_KEY` | your DeepSeek API key |
   | `API_PUBLIC_URL` | your Vercel URL, e.g. `https://ai-email-clerk.vercel.app` |

   - `API_PUBLIC_URL` must match the deployed domain — it's used to build the
     Google OAuth redirect URI. Use your stable production domain (the
     `*.vercel.app` alias or your custom domain), not a per-deploy preview URL.
   - **Do NOT set `WEB_APP_URL`** — leaving it unset keeps the app in
     same-origin cookie mode. Setting it would switch on cross-origin
     bearer-token auth, which you don't need here.
   - **Do NOT set `VITE_API_BASE_URL`** — the build forces it empty so the SPA
     calls the API with relative `/api` paths on the same origin.

5. Deploy. Note the resulting URL (e.g. `https://ai-email-clerk.vercel.app`).
   If it differs from what you guessed, update `API_PUBLIC_URL` and redeploy.

> First request after idle may be slow (serverless cold start). Sessions live in
> Neon, so they survive cold starts.

## 3. Configure Google OAuth

In https://console.cloud.google.com → **APIs & Services → Credentials**, edit
your OAuth 2.0 Client and add an **Authorized redirect URI**:

```
https://ai-email-clerk.vercel.app/api/auth/google/callback
```

(Replace the host with your actual `API_PUBLIC_URL`. Keep your existing Replit
redirect URI too if you still use it.)

Note: `gmail.modify` is a restricted scope. Until your app is verified by
Google, only accounts listed as **Test users** can sign in, and unverified-app
refresh tokens expire after 7 days.

## 4. Verify

1. Open your Vercel URL, e.g. `https://ai-email-clerk.vercel.app/`.
2. Click **Continue with Google** → you're sent to Google → back to the app,
   now signed in (via the same-origin session cookie).
3. Confirm the inbox, labels, and AI features load.

If login bounces back to the login screen, re-check that `API_PUBLIC_URL`
matches the deployed domain and that the Google redirect URI matches it exactly.

---

## Environment variable reference

**Vercel (Production):** `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `DEEPSEEK_API_KEY`, `API_PUBLIC_URL`.

Leave `WEB_APP_URL` and `VITE_API_BASE_URL` **unset** for the single-origin
Vercel deployment.

## Notes & limitations

- Vercel free functions have execution-time limits; very large bulk AI labeling
  runs could hit the 30s `maxDuration`. Reduce batch sizes if needed.
- Auth uses a same-origin, HTTP-only session cookie (`secure`, `sameSite=lax`)
  backed by Neon. Logout destroys the session server-side.
- This single-origin deployment cannot be exercised from Replit (it needs the
  external Vercel/Neon services and their environment variables). Replit
  continues to run the all-in-one version.
