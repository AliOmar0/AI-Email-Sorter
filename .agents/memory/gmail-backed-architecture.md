---
name: Gmail-backed multi-user — non-obvious decisions
description: Inbox AI quirks not derivable from code or replit.md — token/secret coupling, working-set caps, OAuth verification limits.
---

# Non-obvious decisions (the rest is in replit.md)

- **SESSION_SECRET does double duty:** it signs the session cookie AND keys the AES-256-GCM encryption of stored OAuth tokens (`lib/crypto.ts`). Rotating it logs everyone out *and* makes every stored token undecryptable (forces re-consent). Treat it as far more load-bearing than a normal cookie secret.
  **Why:** avoided introducing a second secret; acceptable because re-login is cheap, but rotation is not free.

- **All email/label flows operate on a bounded recent window, not the whole mailbox.** `listEmails` pages through `nextPageToken` only up to an explicit `limit`. Caps chosen deliberately: inbox browse 50, stats 200, AI auto-label 40, AI grouping 50.
  **Why:** each message is a separate metadata fetch and each AI target is a separate DeepSeek call; processing an entire real mailbox is infeasible/expensive. Stats counts are intentionally computed over that single window so they stay internally consistent (totalEmails = "recent inbox", not lifetime total). If a future change needs lifetime totals, use Gmail label aggregates (`messagesTotal`), don't raise the cap unboundedly.

- **OAuth callback requires a session `oauthState` match** (random 32-byte hex, one-time). Don't remove it — it's the CSRF/login-fixation guard. `/auth/google` must `session.save()` before redirecting so the state persists.

- **gmail.modify is a restricted scope:** until Google verifies the app, only added test users can sign in, they see an "unverified app" warning, and refresh tokens expire after 7 days. This is a Google policy limit, not a bug to chase. Test users only exist when the OAuth consent screen is in **Testing** mode; in **Production** an unverified restricted-scope app is blocked entirely. The exact redirect URI (`<domain>/api/auth/google/callback`, no trailing slash) must be registered against the *specific* client ID in Google Console — `redirect_uri_mismatch` is always a Console/registration issue, never an app-code bug.

- **connect-pg-simple + esbuild gotcha:** `createTableIfMissing: true` reads a `table.sql` asset at runtime via `__dirname`, which esbuild does NOT emit into `dist/`. Result: every *session write* (not read) 500s with `ENOENT .../dist/table.sql`. It hides until the first code path that persists a session (e.g. saving OAuth `state`). Fix: set `createTableIfMissing: false` and create the session table yourself with idempotent `CREATE TABLE IF NOT EXISTS` run at startup before `listen()`.
  **Why:** the default works in ts-node/dev but breaks in any bundled build; a startup DDL is environment-agnostic (dev + prod).

- **Untrusted email HTML rendering — two layers, both required:** (1) sanitize server-side with `sanitize-html` (tag/attr whitelist, `allowedStyles` value-regex allowlist that excludes `url()`-bearing props like background-image, `data:` scheme confined to `img[src]` only, links forced `target=_blank rel=noopener`), AND (2) render the sanitized HTML in a **sandboxed, script-less `<iframe srcDoc>`** (no `allow-scripts`, no `allow-same-origin`) that auto-resizes to content. Keep a separate stripped plain-text field for list previews and AI context — never feed raw HTML to the model.
  **Why:** Gmail bodies are attacker-controlled; sanitizer alone is risky (CSS/markup tricks) and raw `dangerouslySetInnerHTML` lets sender CSS escape into the app shell. The iframe isolates layout/styles; the sanitizer removes active content.

- **DESIGN/other subagents rewrite whole files — they will silently clobber concurrent edits.** A visual-polish subagent rewrote `email-body.tsx` and reverted a security-critical iframe `sandbox` change made just before. Always re-verify (grep/re-read) any file a subagent touched if you also edited it, *especially* security-sensitive attributes — don't trust that your earlier edit survived.
