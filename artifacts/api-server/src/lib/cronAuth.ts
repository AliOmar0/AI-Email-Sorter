import crypto from "node:crypto";

// Dependency-light cron-secret helpers, isolated so they can be unit-tested
// without importing the cron route's heavier dependencies (db, AI client).

// Pull a presented cron secret from either an Authorization: Bearer header
// (how Vercel Cron sends CRON_SECRET) or an x-cron-secret header.
export function extractCronSecret(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const auth = headers["authorization"];
  const authStr = Array.isArray(auth) ? auth[0] : auth;
  if (authStr && authStr.startsWith("Bearer ")) {
    return authStr.slice("Bearer ".length).trim();
  }
  const custom = headers["x-cron-secret"];
  const customStr = Array.isArray(custom) ? custom[0] : custom;
  return customStr ? customStr.trim() : null;
}

// Constant-time comparison so a presented secret can't be guessed by timing.
export function secretMatches(
  presented: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
