import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  isGoogleConfigured,
  getAuthUrl,
  exchangeCodeForProfile,
} from "../lib/google";
import { encrypt } from "../lib/crypto";
import { sql } from "drizzle-orm";
import { signAuthToken, resolveAuth } from "../lib/token";

const router: IRouter = Router();

// When the frontend is hosted on a different origin (e.g. GitHub Pages) set
// WEB_APP_URL to its full URL. After login we redirect there with a bearer
// token in the URL fragment; otherwise we redirect to the same-origin root.
function frontendUrl(suffix: string): string {
  const base = process.env["WEB_APP_URL"];
  if (!base) return suffix.startsWith("#") ? `/${suffix}` : suffix;
  return `${base.replace(/\/+$/, "")}/${suffix}`;
}

router.get("/auth/google", (req, res, next) => {
  if (!isGoogleConfigured()) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return;
  }
  // CSRF/login-fixation protection: stash a random state in the session and
  // require Google to echo it back on the callback.
  const state = randomBytes(32).toString("hex");
  req.session.oauthState = state;
  req.session.save((err) => {
    if (err) return next(err);
    res.redirect(getAuthUrl(state));
  });
});

router.get("/auth/google/callback", async (req, res, next) => {
  try {
    const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
    const oauthError =
      typeof req.query["error"] === "string" ? req.query["error"] : "";
    const returnedState =
      typeof req.query["state"] === "string" ? req.query["state"] : "";
    const expectedState = req.session.oauthState;
    // One-time use: clear the stored state regardless of outcome.
    delete req.session.oauthState;

    if (oauthError || !code) {
      res.redirect(frontendUrl("?auth=error"));
      return;
    }
    if (!expectedState || returnedState !== expectedState) {
      res.redirect(frontendUrl("?auth=error"));
      return;
    }

    const { profile, tokens } = await exchangeCodeForProfile(code);

    const values = {
      googleId: profile.googleId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      accessToken: tokens.accessToken ? encrypt(tokens.accessToken) : null,
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiry: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
      updatedAt: new Date(),
    };

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.googleId, profile.googleId));

    let userId: number;
    let tokenVersion: number;
    if (existing) {
      // Preserve an existing refresh token if Google didn't return a new one.
      const update = { ...values };
      if (!tokens.refreshToken) {
        delete (update as Partial<typeof values>).refreshToken;
      }
      await db
        .update(usersTable)
        .set(update)
        .where(eq(usersTable.id, existing.id));
      userId = existing.id;
      tokenVersion = existing.tokenVersion;
    } else {
      const [created] = await db
        .insert(usersTable)
        .values(values)
        .returning({
          id: usersTable.id,
          tokenVersion: usersTable.tokenVersion,
        });
      userId = created.id;
      tokenVersion = created.tokenVersion;
    }

    req.session.userId = userId;
    req.session.save((err) => {
      if (err) return next(err);
      // Same-origin (Replit): the session cookie is enough, go to the app root.
      // Cross-origin (WEB_APP_URL set): the frontend cannot read our cookie, so
      // hand it a signed bearer token via the URL fragment (never sent to a
      // server, kept out of access logs) for it to store and send back.
      if (process.env["WEB_APP_URL"]) {
        const token = signAuthToken(userId, tokenVersion);
        res.redirect(frontendUrl(`#token=${encodeURIComponent(token)}`));
      } else {
        res.redirect("/");
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/me", async (req, res, next) => {
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
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (auth.tokenVersion !== null && auth.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      autoLabelEnabled: user.autoLabelEnabled,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    // Revoke every previously-issued bearer token for this user by bumping
    // their token version. Resolve the id before the session is destroyed.
    const auth = resolveAuth(req);
    if (auth) {
      await db
        .update(usersTable)
        .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1` })
        .where(eq(usersTable.id, auth.userId));
    }
  } catch (err) {
    return next(err);
  }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

export default router;
