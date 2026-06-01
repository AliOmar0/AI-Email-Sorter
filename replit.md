# Inbox AI

A multi-user, AI-powered Gmail labeling web app. Any visitor signs in with their own Google account and works their **real Gmail inbox**: reading messages, organizing them with smart context-aware AI labeling (DeepSeek), bulk operations, and label management with stats. AI-generated labels are written back to the user's real Gmail (`gmail.modify` scope).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env:
  - `DATABASE_URL` (Postgres — stores users + sessions)
  - `SESSION_SECRET` (signs the session cookie AND keys AES-256-GCM token encryption)
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google OAuth)
  - `DEEPSEEK_API_KEY` (user-provided, used directly via OpenAI SDK for AI labeling)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + wouter + TanStack Query (artifact `inbox-ai`, previewPath `/`)
- API: Express 5 (artifact `api-server`, mounted at `/api`)
- DB: PostgreSQL + Drizzle ORM (users + session store only — emails/labels live in Gmail)
- Auth: Google OAuth 2.0 via `googleapis`; `express-session` + `connect-pg-simple`
- Email data: Gmail API (`googleapis`) — no local email storage
- AI: OpenAI SDK pointed at DeepSeek (`deepseek-chat`, baseURL `https://api.deepseek.com`) with `DEEPSEEK_API_KEY`
- Validation: Zod, API codegen via Orval

## Where things live

- DB schema (source of truth): `lib/db/src/schema/users.ts` — `users` table (googleId, email, name, picture, encrypted access/refresh tokens, tokenExpiry)
- API contract (source of truth): `lib/api-spec/openapi.yaml` → generates `@workspace/api-zod` (Zod) and `@workspace/api-client-react` (React Query hooks)
- API routes: `artifacts/api-server/src/routes/` (auth, emails, labels, ai, stats); `requireAuth` gates everything except `/auth/*` and health
- Auth + Gmail libs (`artifacts/api-server/src/lib/`):
  - `google.ts` — OAuth2 client, scopes (incl. `gmail.modify`), `exchangeCodeForProfile`, `clientForUser` (per-user client with auto token refresh + persist)
  - `gmail.ts` — Gmail data layer (list/get emails, label CRUD, set/remove/bulk labels, email state)
  - `crypto.ts` — AES-256-GCM encrypt/decrypt of OAuth tokens, keyed off `SESSION_SECRET`
  - `gmailColors.ts` — snaps arbitrary hex colors to the nearest Gmail-allowed label color
  - `aiClient.ts` — DeepSeek client (OpenAI SDK), `getAIClient` / `isAIConfigured` / `AI_MODEL`
- Middleware: `src/middlewares/requireAuth.ts`, error mapping in `src/middlewares/errorHandler.ts`
- Session typing: `src/types/session.d.ts`
- Frontend pages: `artifacts/inbox-ai/src/pages/` (login, dashboard, inbox, labels, ai studio)

## Architecture decisions

- **No local email storage** — all emails and labels are read from / written to the signed-in user's real Gmail via the Gmail API. The DB stores only users and sessions.
- **All email/label IDs are strings** (Gmail ids). Never coerce to numbers.
- OAuth tokens are encrypted at rest (AES-256-GCM) before being stored on the user row.
- AI labeling uses the user's own DeepSeek key directly (NOT the Replit AI Integrations proxy).
- `emailCount` on labels and `labels[]` on emails are computed in route responses from Gmail data, not stored.

## Product

- Login screen — "Continue with Google" (full-page redirect to `/api/auth/google`).
- Dashboard with inbox stats (total/unlabeled/unread/starred) and label breakdown.
- Inbox: filter views, Gmail search, reading pane, bulk selection + bulk labeling, AI label suggestions, star/read toggles — all backed by real Gmail.
- Labels: CRUD for custom Gmail labels; system labels protected.
- AI Studio: bulk auto-labeling and AI-suggested grouping of unlabeled emails, written back to Gmail.

## Gotchas

- See `.agents/memory/zod-error-handling.md`: the Express error handler imports `ZodError` from `zod` (v3 root, matching Orval output) and unwraps drizzle-wrapped pg error codes via `.cause`. It also maps Google/gaxios errors: `invalid_grant`/401 → 401 "sign in again"; other 4xx → passthrough.
- AI endpoints return 503 if `DEEPSEEK_API_KEY` is missing and 502 on upstream AI errors (e.g. quota/429).
- Auth uses session cookies; the generated client's `customFetch` relies on same-origin cookie sending (no bearer token in web).
- The OAuth redirect URI must be registered in Google Cloud Console: `<REPLIT_DEV_DOMAIN>/api/auth/google/callback` (and the production domain when deployed).
- Gmail restricted scopes (`gmail.modify`) require Google verification for production; until verified, only test users can sign in and they'll see an "unverified app" warning. Unverified-app refresh tokens expire after 7 days.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
