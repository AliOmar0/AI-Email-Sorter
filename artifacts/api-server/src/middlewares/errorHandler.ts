import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

interface PgLike {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

function findPgCode(err: unknown, depth = 0): string | undefined {
  if (!err || typeof err !== "object" || depth > 4) return undefined;
  const e = err as PgLike;
  if (typeof e.code === "string") return e.code;
  return findPgCode(e.cause, depth + 1);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      details: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  // Google/Gmail (gaxios) errors
  const e = err as {
    response?: { status?: number; data?: { error?: unknown } };
  };
  const gaxStatus = e?.response?.status;
  const gaxError = e?.response?.data?.error;
  if (gaxError === "invalid_grant" || gaxStatus === 401) {
    res
      .status(401)
      .json({ error: "Google session expired, please sign in again" });
    return;
  }
  if (typeof gaxStatus === "number" && gaxStatus >= 400 && gaxStatus < 500) {
    req.log.warn({ err }, "Upstream Google API error");
    res.status(gaxStatus).json({ error: "Gmail request failed" });
    return;
  }

  const code = findPgCode(err);
  if (code === "23503") {
    res.status(400).json({ error: "Referenced record does not exist" });
    return;
  }
  if (code === "23505") {
    res.status(409).json({ error: "Record already exists" });
    return;
  }

  req.log.error({ err }, "Unhandled request error");
  res.status(500).json({ error: "Internal server error" });
}
