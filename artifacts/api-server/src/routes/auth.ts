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
import { upsertAccountForUser, findAccountByGoogleId } from "../lib/accounts";

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
  // intent=link attaches the returned Google account to the currently
  // signed-in user instead of logging in as it. Only honor it when there is an
  // authenticated session to attach to; otherwise fall back to normal login.
  const wantsLink = req.query["intent"] === "link";
  const existing = resolveAuth(req);
  req.session.oauthIntent = wantsLink && existing ? "link" : "login";

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
    const intent = req.session.oauthIntent ?? "login";
    // One-time use: clear the stored state/intent regardless of outcome.
    delete req.session.oauthState;
    delete req.session.oauthIntent;

    if (oauthError || !code) {
      res.redirect(frontendUrl("?auth=error"));
      return;
    }
    if (!expectedState || returnedState !== expectedState) {
      res.redirect(frontendUrl("?auth=error"));
      return;
    }

    const { profile, tokens } = await exchangeCodeForProfile(code);
    const encAccess = tokens.accessToken ? encrypt(tokens.accessToken) : null;
    const encRefresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
    const tokenExpiry = tokens.expiryDate ? new Date(tokens.expiryDate) : null;

    // --- Link flow: attach this Google account to the signed-in user. --------
    const sessionAuth = resolveAuth(req);
    if (intent === "link" && sessionAuth) {
      const existingAccount = await findAccountByGoogleId(profile.googleId);
      if (existingAccount && existingAccount.userId !== sessionAuth.userId) {
        // Already connected to a different app user — refuse to steal it.
        res.redirect(frontendUrl("?account=conflict"));
        return;
      }
      const account = await upsertAccountForUser({
        userId: sessionAuth.userId,
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: encAccess,
        refreshToken: encRefresh,
        tokenExpiry,
        isPrimary: false,
      });
      req.session.activeAccountId = account.id;
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect(frontendUrl("?account=linked"));
      });
      return;
    }

    // --- Login flow: sign in as (or create) the user owning this account. ----
    const linked = await findAccountByGoogleId(profile.googleId);

    let userId: number;
    let tokenVersion: number;
    if (linked) {
      // Existing connection — sign in as its owner and refresh its tokens.
      userId = linked.userId;
      const [owner] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, linked.userId));
      tokenVersion = owner?.tokenVersion ?? 0;
      await upsertAccountForUser({
        userId,
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: encAccess,
        refreshToken: encRefresh,
        tokenExpiry,
      });
      req.session.activeAccountId = linked.id;
    } else {
      // Brand-new person: create the user (identity) and a primary account.
      const values = {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: encAccess,
        refreshToken: encRefresh,
        tokenExpiry,
        updatedAt: new Date(),
      };
      const [created] = await db
        .insert(usersTable)
        .values(values)
        .returning({ id: usersTable.id, tokenVersion: usersTable.tokenVersion });
      userId = created.id;
      tokenVersion = created.tokenVersion;
      const account = await upsertAccountForUser({
        userId,
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: encAccess,
        refreshToken: encRefresh,
        tokenExpiry,
        isPrimary: true,
      });
      req.session.activeAccountId = account.id;
    }

    req.session.userId = userId;
    req.session.save((err) => {
      if (err) return next(err);
      // Same-origin (Replit/Vercel): the session cookie is enough, go to root.
      // Cross-origin (WEB_APP_URL set): hand the frontend a signed bearer token
      // via the URL fragment for it to store and send back.
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
      dailyDigestEnabled: user.dailyDigestEnabled,
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
