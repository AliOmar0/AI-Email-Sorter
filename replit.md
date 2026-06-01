# Inbox AI

An AI-powered email labeling web app. Emails live in the app's own seeded Postgres database (no Gmail/OAuth integration). Users organize their inbox with smart, context-aware AI labeling, multiple labeling modes, bulk operations, and label management with stats.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/scripts run seed` — reset DB to clean seeded state (8 system labels + 20 realistic emails)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` (Postgres), `OPENAI_API_KEY` (user-provided, used directly via OpenAI SDK for AI labeling)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + wouter + TanStack Query (artifact `inbox-ai`, previewPath `/`)
- API: Express 5 (artifact `api-server`, mounted at `/api`)
- DB: PostgreSQL + Drizzle ORM
- AI: OpenAI SDK (`gpt-4o-mini`) called directly with `OPENAI_API_KEY`
- Validation: Zod, API codegen via Orval

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` — `emails`, `labels`, `email_labels` join table
- API contract (source of truth): `lib/api-spec/openapi.yaml` → generates `@workspace/api-zod` (Zod) and `@workspace/api-client-react` (React Query hooks)
- API routes: `artifacts/api-server/src/routes/` (emails, labels, ai, stats); error handler in `src/middlewares/errorHandler.ts`
- Shared email serialization: `artifacts/api-server/src/lib/emailRepo.ts`
- OpenAI client: `artifacts/api-server/src/lib/openai.ts`
- Seed data: `scripts/src/seed.ts`
- Frontend pages: `artifacts/inbox-ai/src/pages/` (dashboard, inbox, labels, ai studio)

## Architecture decisions

- No Gmail API/OAuth — emails are seeded in the app's own DB (per product scope).
- `emailCount` on labels and `labels[]` on emails are computed in route responses, not stored columns.
- AI labeling uses the user's own OpenAI key directly (NOT the Replit AI Integrations proxy).
- `PUT /emails/:id/labels` runs in a transaction (atomic delete+insert) to avoid data loss / races on the join table.

## Product

- Dashboard with inbox stats (total/unlabeled/unread/starred) and label breakdown.
- Inbox: three-pane layout, filter views, search, bulk selection + bulk labeling, reading pane, AI label suggestions, star/read toggles.
- Labels: full CRUD for custom labels; system labels are protected from deletion.
- AI Studio: bulk auto-labeling and AI-suggested grouping of unlabeled emails.

## Gotchas

- See `.agents/memory/zod-error-handling.md`: the Express error handler imports `ZodError` from `zod` (v3 root, matching Orval output) and unwraps drizzle-wrapped pg error codes via `.cause`.
- AI endpoints return 503 if `OPENAI_API_KEY` is missing and 502 on upstream OpenAI errors (e.g. quota/429).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
