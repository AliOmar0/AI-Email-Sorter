// Dependency-light helpers for the background auto-label cron, isolated from the
// db/Gmail/AI modules so they can be unit-tested under node --experimental-strip-types
// (the type-only ApiEmail import is erased, so no runtime module is loaded).
import type { ApiEmail } from "./gmail";

// Gmail's `after:` search operator takes whole seconds since the epoch. We only
// look at mail that arrived after the last watermark so each run does bounded,
// non-overlapping work instead of re-scanning the whole unlabeled backlog.
export function buildSinceQuery(cursor: Date | null): string | undefined {
  if (!cursor) return undefined;
  const seconds = Math.floor(cursor.getTime() / 1000);
  return `after:${seconds}`;
}

// The newest receivedAt across a set of emails — used to advance the watermark.
// Returns null for an empty set (caller keeps the previous cursor).
export function newestReceivedAt(
  emails: Pick<ApiEmail, "receivedAt">[],
): Date | null {
  let newest: number | null = null;
  for (const e of emails) {
    const t = Date.parse(e.receivedAt);
    if (!Number.isNaN(t) && (newest === null || t > newest)) newest = t;
  }
  return newest === null ? null : new Date(newest);
}
