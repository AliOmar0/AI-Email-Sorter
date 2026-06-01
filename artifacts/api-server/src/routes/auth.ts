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

const router: IRouter = Router();

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
      res.redirect("/?auth=error");
      return;
    }
    if (!expectedState || returnedState !== expectedState) {
      res.redirect("/?auth=error");
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
    } else {
      const [created] = await db
        .insert(usersTable)
        .values(values)
        .returning({ id: usersTable.id });
      userId = created.id;
    }

    req.session.userId = userId;
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/me", async (req, res, next) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

export default router;
