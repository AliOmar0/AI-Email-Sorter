import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveAuth } from "../lib/token";
import { resolveActiveAccount } from "../lib/accounts";

// Parse a numeric X-Account-Id header (active-account selector for
// cross-origin/bearer mode, where there is no server session to read).
function headerAccountId(req: Request): number | undefined {
  const raw = req.headers["x-account-id"];
  const str = Array.isArray(raw) ? raw[0] : raw;
  if (!str) return undefined;
  const n = Number(str);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = resolveAuth(req);
    if (!auth) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId));
    if (!user) {
      req.session.destroy(() => undefined);
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    // Bearer tokens carry a version; reject any issued before the last logout.
    if (auth.tokenVersion !== null && auth.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.user = user;

    // Resolve the active connected Gmail account. Prefer an explicit owned
    // account id (header wins for bearer mode, else session), else the primary.
    const preferred = headerAccountId(req) ?? req.session.activeAccountId;
    const account = await resolveActiveAccount(user.id, preferred);
    if (!account) {
      // No connected account (shouldn't happen post-backfill); force re-auth.
      res.status(401).json({ error: "No connected account" });
      return;
    }
    req.account = account;
    // Persist the resolution into the session (cookie mode) for next time.
    if (req.session.activeAccountId !== account.id) {
      req.session.activeAccountId = account.id;
    }

    next();
  } catch (err) {
    next(err);
  }
}
