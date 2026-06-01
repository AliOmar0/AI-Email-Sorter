---
name: Zod version + DB error handling in api-server
description: Why the Express error handler must import ZodError from "zod" (not zod/v4) and unwrap drizzle-wrapped pg errors
---

# Centralized error handling in api-server

The generated `@workspace/api-zod` schemas (Orval, `client: "zod"`) emit `import * as zod from 'zod'` — the **zod v3 root API**, even though zod is 3.25.x (which also ships a `zod/v4` subpath). So a `*.parse()` failure throws the **v3** `ZodError`.

**Rule:** the Express error-handling middleware must `import { ZodError } from "zod"` (v3 root). Importing from `zod/v4` makes `err instanceof ZodError` silently false (different class) and every validation error falls through to a generic 500.

**Why:** instanceof checks compare class identity; v3 and v4 are distinct classes from distinct module instances. This cost multiple debugging passes — the symptom is "400 handler exists but invalid input still returns 500".

**How to apply:** match the error-handler's ZodError import to whatever zod variant the *route validation schemas* actually use at runtime, not what the drizzle schema files use. (Our drizzle schema files use `zod/v4` for drizzle-zod, but those schemas aren't what validate requests.)

# Drizzle wraps Postgres errors

Postgres constraint errors (FK `23503`, unique `23505`) thrown inside `db.transaction(...)` are **wrapped** — the `code` is not on the top-level error but on a nested `.cause`. The handler walks `err.cause` recursively to find the pg `code`. A flat `err.code` check alone returns 500 for FK violations.

api-server needs `zod` as a direct dependency (add `"zod": "catalog:"`) so the `zod/v4` subpath and root both resolve; it isn't pulled in transitively.
