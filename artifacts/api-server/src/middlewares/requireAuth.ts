import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveAuth } from "../lib/token";

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
    next();
  } catch (err) {
    next(err);
  }
}
