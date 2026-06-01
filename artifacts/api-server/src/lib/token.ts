import crypto from "node:crypto";
import type { Request } from "express";

// Stateless bearer auth tokens for cross-origin deployments (e.g. a static
// frontend on one domain calling this API on another). On Replit the app is
// same-origin and relies on the session cookie instead; these tokens are an
// additive path used only when the frontend cannot send cookies.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature),
// signed with SESSION_SECRET. No external dependency required.

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface TokenPayload {
  uid: number;
  // Per-user token version (users.tokenVersion). Bumped on logout so a stolen
  // token can be revoked before its natural expiry.
  ver: number;
  exp: number;
}

// Result of resolving a request's identity. `tokenVersion` is the version
// embedded in a bearer token (which the caller must compare against the user's
// current version), or null for session-cookie auth (no version check needed).
export interface ResolvedAuth {
  userId: number;
  tokenVersion: number | null;
}

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET is required to sign auth tokens");
  }
  cachedKey = crypto.scryptSync(secret, "inbox-ai-auth-token-salt", 32);
  return cachedKey;
}

function sign(data: string): string {
  return crypto
    .createHmac("sha256", getKey())
    .update(data)
    .digest("base64url");
}

export function signAuthToken(userId: number, tokenVersion: number): string {
  const payload: TokenPayload = {
    uid: userId,
    ver: tokenVersion,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = sign(body);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as TokenPayload;
    if (
      typeof payload.uid !== "number" ||
      typeof payload.ver !== "number" ||
      typeof payload.exp !== "number" ||
      payload.exp < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Resolves the authenticated identity from either the session cookie (Replit,
// same-origin) or a Bearer token (cross-origin deployments). Returns null when
// neither is present/valid. For bearer tokens the caller MUST verify
// `tokenVersion` against the user's current `tokenVersion` to honour logout.
export function resolveAuth(req: Request): ResolvedAuth | null {
  if (req.session.userId) {
    return { userId: req.session.userId, tokenVersion: null };
  }

  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const payload = verifyAuthToken(header.slice("Bearer ".length).trim());
    if (payload) {
      return { userId: payload.uid, tokenVersion: payload.ver };
    }
  }
  return null;
}
