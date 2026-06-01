# Deploying Inbox AI (GitHub Pages frontend + Vercel backend)

This guide deploys the app as two pieces on free tiers:

- **Frontend** (`@workspace/inbox-ai`, a static React build) → **GitHub Pages**
- **Backend** (`@workspace/api-server`, Express) → **Vercel** serverless function
- **Database** (Postgres for users + sessions) → **Neon**

> Replit keeps working exactly as before. Every change below is gated behind
> environment variables that are unset on Replit, so the existing same-origin
> cookie login is untouched.

## How auth works across two domains

The frontend (`username.github.io`) and backend (`your-backend.vercel.app`) are
on different origins, so a session cookie can't be shared between them (browsers
block third-party cookies). Instead:

1. The Google login is a normal full-page redirect to the **backend**, so the
   session cookie works during the OAuth handshake (it's first-party there).
2. After login, the backend issues a signed bearer token and redirects back to
   the frontend with the token in the URL fragment (`#token=...`).
3. The frontend stores the token in `localStorage` and sends it as
   `Authorization: Bearer <token>` on every API call.

You don't need to enable third-party cookies anywhere.

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

## 2. Deploy the backend (Vercel)

1. Push this repository to GitHub.
2. At https://vercel.com, **Add New → Project** and import the repo.
3. **Important — set the Root Directory to the repository root** (leave it as
   the repo root, do not point it at a subfolder). The included `vercel.json`
   builds the backend bundle with
   `pnpm --filter @workspace/api-server run build:vercel`.
4. Add these **Environment Variables** (Production):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | your Neon connection string |
   | `SESSION_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
   | `GOOGLE_CLIENT_ID` | from Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
   | `DEEPSEEK_API_KEY` | your DeepSeek API key |
   | `API_PUBLIC_URL` | your Vercel URL, e.g. `https://your-backend.vercel.app` |
   | `WEB_APP_URL` | your Pages URL, e.g. `https://username.github.io/repo-name` |

   - `API_PUBLIC_URL` must match the deployed backend domain — it's used to build
     the Google OAuth redirect URI.
   - `WEB_APP_URL` enables cross-origin mode (CORS + token redirect). Set it to
     the full frontend URL **including** the `/repo-name` path.

5. Deploy. Note the resulting backend URL (e.g. `https://your-backend.vercel.app`).
   If it differs from what you guessed, update `API_PUBLIC_URL` and redeploy.

> First request after idle may be slow (serverless cold start). Sessions live in
> Neon, so they survive cold starts.

## 3. Configure Google OAuth

In https://console.cloud.google.com → **APIs & Services → Credentials**, edit
your OAuth 2.0 Client and add an **Authorized redirect URI**:

```
https://your-backend.vercel.app/api/auth/google/callback
```

(Keep your existing Replit redirect URI too if you still use it.)

Note: `gmail.modify` is a restricted scope. Until your app is verified by
Google, only accounts listed as **Test users** can sign in, and unverified-app
refresh tokens expire after 7 days.

## 4. Deploy the frontend (GitHub Pages)

1. In your GitHub repo → **Settings → Pages**, set **Source = GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, add a
   repository **variable**:
   - `VITE_API_BASE_URL` = your backend URL, e.g. `https://your-backend.vercel.app`
3. The workflow `.github/workflows/deploy-pages.yml` runs on every push to
   `main`. It builds the frontend with:
   - `BASE_PATH=/<repo-name>/` (derived automatically from the repo name)
   - `VITE_API_BASE_URL` (from the variable above)

   and publishes `artifacts/inbox-ai/dist/public` to Pages.
4. After the first successful run, your app is live at
   `https://username.github.io/repo-name/`.

## 5. Verify

1. Open `https://username.github.io/repo-name/`.
2. Click **Continue with Google** → you're sent to the Vercel backend → Google →
   back to the frontend, now signed in.
3. Confirm the inbox, labels, and AI features load.

If login bounces back to the login screen, re-check that `WEB_APP_URL` (backend)
and `VITE_API_BASE_URL` (frontend) point at the right URLs and that the Google
redirect URI matches `API_PUBLIC_URL`.

---

## Environment variable reference

**Backend (Vercel):** `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `DEEPSEEK_API_KEY`, `API_PUBLIC_URL`, `WEB_APP_URL`.

**Frontend (GitHub Actions):** `VITE_API_BASE_URL` (the only one you set;
`BASE_PATH` and `PORT` are provided by the workflow).

## Notes & limitations

- This split deployment **cannot be tested from Replit** — it depends on the
  external GitHub/Vercel/Neon services and their environment variables. Replit
  continues to run the all-in-one version.
- Vercel free functions have execution-time limits; very large bulk AI labeling
  runs could hit the 30s `maxDuration`. Reduce batch sizes if needed.
- **Token security:** in cross-origin mode the API call auth uses a signed bearer
  token (7-day expiry) stored in the browser's `localStorage`. Logout revokes all
  of a user's outstanding tokens server-side (a per-user version is bumped and
  checked on every request). Note that a GitHub Pages *project page*
  (`username.github.io/repo`) shares the `username.github.io` origin with your
  other repos' pages, so `localStorage` is readable by any page on that origin.
  For stronger isolation, host the frontend on its own custom domain.
