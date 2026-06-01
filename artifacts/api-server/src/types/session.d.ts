import "express-session";
import type { User } from "@workspace/db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    oauthState?: string;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
