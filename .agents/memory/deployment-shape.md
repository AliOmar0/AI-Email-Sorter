---
name: Deployment shape
description: How Inbox AI is deployed — Replit all-in-one, and the cross-origin GitHub Pages + Vercel split.
---

# Deployment shape

Inbox AI is a full-stack app: an Express API server (`api-server`, mounted `/api`) plus a Vite React SPA (`inbox-ai`, served static). It requires a live backend for Google OAuth callback, Postgres-backed sessions, encrypted token storage, Gmail API calls, and the DeepSeek AI key. The static SPA alone cannot work — every authenticated/API action needs the server.

## Two supported deployments

1. **Replit publish (all-in-one):** `inbox-ai` builds to static (`dist/public`, SPA rewrite) and `api-server` runs as a node process. Same-origin, session-cookie auth. Configured in each `artifact.toml`; no extra deploy file.

2. **Cross-origin split:** frontend on GitHub Pages, backend on Vercel, Postgres on Neon. See `DEPLOYMENT.md` for the full runbook.

## Cross-origin split — key decisions (non-obvious)

- **Everything is env-gated and additive.** Backend gates on `WEB_APP_URL` (CORS + token redirect) and `API_PUBLIC_URL` (OAuth redirect base); frontend gates on `VITE_API_BASE_URL`. When unset (Replit), behavior is identical to before. **Why:** lets one codebase serve both deployments without branching.

- **Auth avoids third-party cookies via a bearer token.** The OAuth dance runs as top-level navigations on the backend domain (cookie is first-party there). After login the callback issues an HMAC-SHA256 token (keyed off `SESSION_SECRET`, no new deps) and redirects to the frontend with it in the URL **fragment** (`#token=`, never sent to a server / not in logs). Frontend stores it in `localStorage` and sends `Authorization: Bearer`. **Why:** browsers block third-party cookies, so a shared session cookie across github.io ↔ vercel.app won't work.

- **Bearer tokens must be revocable.** Token payload carries a per-user `users.tokenVersion`; `requireAuth` and `/auth/me` reject any token whose `ver` != the user's current version; logout bumps the version. Session-cookie auth passes `tokenVersion: null` and skips the check. **Why:** stateless tokens otherwise survive logout for their full TTL (was the one severe code-review finding).

- **Vercel must run the esbuild bundle, not bundle TS itself.** `@workspace/db` and `@workspace/api-zod` export TS source (emitDeclarationOnly, no runtime JS). `build:vercel` esbuilds `src/vercel.ts` → single self-contained `dist/vercel.mjs`; root `api/index.mjs` re-exports it; `vercel.json` routes `/api/(.*)` → the function. The pino transport plugin is skipped in the Vercel build because the production logger writes plain JSON (no worker thread).

## Gotchas

- **Fresh cross-origin deploys have NO migration step — tables are created at runtime.** The backend creates both `session` and `users` via idempotent `CREATE TABLE IF NOT EXISTS` in `ensureTables()` (app.ts), called from both entry points (index.ts startup, vercel.ts per warm instance). On a brand-new Neon DB nothing runs `drizzle-kit push`, so without this the first OAuth callback fails with `relation "users" does not exist` (500). **Why:** `push` can't be relied on for the Vercel/Neon path (see next bullet). **How to apply:** if you add a column to the `users`/schema tables, also update the DDL in `ensureUsersTable` (it mirrors lib/db schema/users.ts), or fresh deploys will be missing it.
- **`drizzle-kit push` wants to DROP the `session` table.** connect-pg-simple creates `session` at runtime; it's not in the Drizzle schema, so push flags it as data-loss and (non-interactively) errors out. For additive column changes, apply the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` directly via SQL instead of running push.
- Production import of `dist/vercel.mjs` only works with `NODE_ENV=production`; in dev it tries to spawn the pino-pretty worker that the Vercel build intentionally omits.
