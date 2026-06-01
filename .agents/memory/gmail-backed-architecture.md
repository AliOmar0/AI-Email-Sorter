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

- **gmail.modify is a restricted scope:** until Google verifies the app, only added test users can sign in, they see an "unverified app" warning, and refresh tokens expire after 7 days. This is a Google policy limit, not a bug to chase.
