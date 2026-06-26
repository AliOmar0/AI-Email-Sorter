---
name: Multi-account architecture
description: How Inbox AI supports linking multiple Gmail accounts to one app user, plus the active-account resolution and cron changes.
---

# Multi-account (one person → many Gmail accounts)

## Data model

- `users` = the **person/identity** (login). Keeps `tokenVersion`,
  `autoLabelEnabled` (person-level opt-in), and legacy token columns.
- `accounts` = **connected Gmail accounts**, the source of truth for Gmail OAuth
  tokens and the per-mailbox auto-label watermark (`autoLabelCursor`). One row is
  `isPrimary` (the login mailbox). FK `user_id → users.id ON DELETE CASCADE`.
- **Backfill is automatic & idempotent:** `ensureAccountsTable()` (app.ts,
  runs at startup + per warm Vercel instance) creates the table and inserts a
  primary account for every existing user. So existing deployments keep working
  with zero manual migration. If you add a column to `accounts`, mirror it in
  that DDL (same rule as `ensureUsersTable`).

## Active account resolution (requireAuth)

`req.account` is resolved per request, in this order:
1. `X-Account-Id` header (sent by the SPA on every request — works in BOTH
   cookie and bearer modes; this is the primary mechanism),
2. `session.activeAccountId` (cookie mode),
3. the user's primary account.
The resolved id is written back to the session. **All Gmail routes use
`clientForAccount(req.account!)`, not `clientForUser`.** `clientForAccount`
persists refreshed tokens onto the `accounts` row.

The SPA stores the active id in `localStorage` (`inbox-ai-active-account`) and
sends it via `setAccountIdGetter` wired in `main.tsx` → custom-fetch adds the
`X-Account-Id` header. Switching accounts = update localStorage + `POST
/accounts/switch` + `queryClient.invalidateQueries()` (drop all cached data so
everything refetches for the new mailbox).

## OAuth: login vs link

`/auth/google?intent=link` (only honored when already authenticated) sets
`session.oauthIntent='link'`. The callback branches:
- **link:** attach the returned Google account to the current user as a
  non-primary account (refuses if already owned by a different user →
  `?account=conflict`); redirects `?account=linked`.
- **login:** find account by googleId → sign in as its owner; else create a new
  user + primary account.
The SPA's account-switcher reads `?account=linked|conflict` to toast and
re-syncs the local active id (clears it on link so the session's new active wins
until `/accounts` reports `isActive`).

Endpoints: `GET /accounts`, `POST /accounts/switch {accountId}`,
`DELETE /accounts/{id}` (primary cannot be unlinked). "Add account" is a
top-level navigation to `/api/auth/google?intent=link` (OAuth must be
first-party on the backend).

## Cron (auto-label) is per-account now

`runAutoLabelForAllAccounts` joins `accounts` with `users` and processes each
account whose owning user has `autoLabelEnabled` and that still has a refresh
token; the watermark advances on `accounts.autoLabelCursor` (per mailbox).

## AI digests (#9)

`POST /ai/digest {labelId?, view?, onlyUnread?}` summarizes up to 25 recent
emails in scope → `{summary, count, items[{id,subject,sender,summary}]}`. UI:
Digest button + dialog in the inbox header. Shares `extractJson`/`emailContext`
from `lib/aiLabeling.ts`.

## Caveat

Linking in cross-origin **bearer** mode relies on the backend session for the
`intent=link` user; production is same-origin (cookie) so this is fine there.
Switching/targeting works in both modes via the `X-Account-Id` header.
