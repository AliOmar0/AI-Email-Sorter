import "express-session";
import type { User, Account } from "@workspace/db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    oauthState?: string;
    // OAuth flow intent: "login" (default) signs in / creates a user, "link"
    // attaches the returned Google account to the already-signed-in user.
    oauthIntent?: "login" | "link";
    // The currently selected connected account for multi-account users.
    activeAccountId?: number;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      // The active connected Gmail account for this request (resolved by
      // requireAuth from the X-Account-Id header, session, or the primary).
      account?: Account;
    }
  }
}

export {};
