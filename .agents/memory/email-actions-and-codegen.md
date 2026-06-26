---
name: Email actions, content layer, codegen gotchas
description: Non-obvious facts added when implementing real mailbox actions, image blocking, unsubscribe, send, pagination, charset, and tests.
---

# Inbox AI — content layer, new endpoints, codegen gotchas

## OpenAPI / orval

- **A YAML scalar value containing `": "` silently breaks orval** with the
  misleading error `Failed to resolve input: Please provide a valid string
  value...` (NOT a YAML parse error). It bit us with `description: mailto: ...`
  (value started with `mailto:` then a space). Reword or quote any description
  that contains a colon-space. Verify by running orval against the HEAD spec to
  isolate whether a failure is yours.
- Codegen: `pnpm --filter @workspace/api-spec run codegen` regenerates BOTH
  `@workspace/api-zod` and `@workspace/api-client-react` and then runs
  `typecheck:libs`. Body schema names follow the operationId: `bulkEmailAction`
  → `BulkEmailActionBody`, `sendEmail` → `SendEmailBody`.

## API shape changes

- **`GET /emails` now returns `EmailPage` `{ emails, nextPageToken }`**, not
  `Email[]`. Every consumer must read `.emails`. Frontend pagination keeps the
  first page in react-query (so existing `getListEmailsQueryKey()` invalidations
  still refresh it) and appends "load more" pages in local component state,
  reset on filter change.
- `Email` gained `hasRemoteImages`, `unsubscribeUrl`, `unsubscribeMailto`.
- New endpoints: `POST /emails/bulk-action` (archive/trash/untrash/spam/
  markRead/markUnread/star/unstar), `POST /emails/send` (plain-text compose/
  reply/forward; reply threads via Message-ID/References + threadId),
  `POST /emails/{id}/unsubscribe` (RFC 8058 one-click POST when supported, else
  returns a URL for the client to open).

## Content layer is isolated for testing — `lib/emailContent.ts`

- All untrusted-input handling (HTML sanitizer, charset `decodeBody`,
  `extractBody`, `parseListUnsubscribe`) was moved OUT of `gmail.ts` into
  `lib/emailContent.ts`. `gmail.ts` imports from it. **Reason:** tests run via
  `pnpm --filter @workspace/api-server test` =
  `node --experimental-strip-types --test test/**/*.test.ts`, and native
  type-stripping can't resolve extensionless relative imports nor value imports
  of `googleapis`. So `emailContent.ts` imports ONLY `sanitize-html` (a package)
  and `import type { gmail_v1 } from "googleapis"` (erased). **Do not add an
  extensionless relative import or a value `googleapis` import to that file or
  the tests stop loading.** Test files import it as `../src/lib/emailContent.ts`
  (explicit `.ts`).

## Charset decoding (the ISO-8859-1/windows-1252 mojibake fix)

- Node's bundled ICU on some platforms (seen on this Windows machine, Node
  22.18) maps the `windows-1252` TextDecoder label to ISO-8859-1 behavior for
  the C1 range 0x80–0x9F, so smart quotes / em dash / € decode as raw control
  chars. We therefore decode the windows-1252 / iso-8859-1 / latin1 family with
  an explicit cp1252 C1 table (`decodeWindows1252`) for deterministic,
  browser-correct output (WHATWG: both labels decode via the cp1252 table; real
  mail labelled iso-8859-1 usually carries cp1252 bytes). Other charsets use
  TextDecoder with a UTF-8 fallback on unknown labels. base64url (not base64) is
  still mandatory for Gmail part bodies.

## Remote image blocking (tracking pixels)

- The sanitizer moves remote `http(s)` `<img src>` into `data-blocked-src`
  server-side and sets `Email.hasRemoteImages`. The client (`email-body.tsx`)
  reveals them only on "Display images" by string-replacing `data-blocked-src=`
  → `src=` before building the iframe `srcDoc`. data: images are left inline.
  **Keep the iframe `sandbox` WITHOUT `allow-scripts`** (currently
  `allow-same-origin allow-popups`) — a prior subagent clobbered this once.

## Gmail backoff

- `withGmailRetry` in `gmail.ts` retries 429/500/502/503/504 with exponential
  backoff + jitter; non-retryable errors propagate to the central errorHandler
  (which already maps 401→"session expired", 4xx→"Gmail request failed").

## Still TODO (deferred, need infra/decisions)

- Background auto-labeling via Gmail watch + Pub/Sub or a Vercel cron: needs a
  GCP Pub/Sub topic + watch renewal (or a CRON_SECRET-guarded endpoint iterating
  users with refresh tokens) + deploy config — not safe to ship untested.
- AI digests (per-label / unread summaries).
- Multi-account support + first-run onboarding (DB schema change: users↔accounts).
