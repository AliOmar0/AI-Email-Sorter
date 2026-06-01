---
name: Deployment shape
description: Why Inbox AI cannot be a static site, and how it is actually deployed.
---

# Deployment shape

Inbox AI is a full-stack app: an Express API server (`api-server`, mounted `/api`) plus a Vite React SPA (`inbox-ai`, served static). It requires a live backend for Google OAuth callback, Postgres-backed sessions, encrypted token storage, Gmail API calls, and the DeepSeek AI key.

**Rule:** It cannot be hosted on static-only platforms (GitHub Pages, plain CDN). Any request to "make it a GitHub Page" is technically impossible for the full product — only the static SPA shell would load and every authenticated/API action would fail.

**Why:** OAuth needs a server-side redirect handler and secret client credentials; sessions/tokens need server + DB; AI labeling needs a server-side key. None of these can live in a static bundle.

**How to apply:** Deploy via Replit publish — the `inbox-ai` artifact builds to static (`dist/public`, SPA rewrite to `/index.html`) and `api-server` runs as a node process with `/api/healthz`. Both are already configured in their `artifact.toml`; no separate deploy file is needed.
