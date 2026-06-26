import { google, type Auth } from "googleapis";
import { db, usersTable, accountsTable, type User, type Account } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto";
import { logger } from "./logger";

type OAuth2Client = Auth.OAuth2Client;

// gmail.modify covers reading messages/labels and writing labels back.
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"],
  );
}

function getBaseUrl(): string {
  // Explicit override takes precedence (set this on non-Replit hosts such as
  // Vercel so the OAuth redirect URI matches the deployed API domain).
  const explicit = process.env["API_PUBLIC_URL"];
  if (explicit) return explicit.replace(/\/+$/, "");

  const domain =
    process.env["REPLIT_DEV_DOMAIN"] ||
    process.env["REPLIT_DOMAINS"]?.split(",")[0] ||
    // Vercel injects VERCEL_URL (host only, no scheme) for the deployment.
    process.env["VERCEL_URL"];
  if (!domain) {
    throw new Error(
      "No API_PUBLIC_URL/REPLIT_DEV_DOMAIN/REPLIT_DOMAINS/VERCEL_URL available for OAuth redirect",
    );
  }
  return `https://${domain}`;
}

export function getRedirectUri(): string {
  return `${getBaseUrl()}/api/auth/google/callback`;
}

export function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    getRedirectUri(),
  );
}

export function getAuthUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}

export async function exchangeCodeForProfile(code: string): Promise<{
  profile: GoogleProfile;
  tokens: {
    accessToken?: string;
    refreshToken?: string;
    expiryDate?: number;
  };
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  if (!data.id || !data.email) {
    throw new Error("Google profile is missing id or email");
  }

  return {
    profile: {
      googleId: data.id,
      email: data.email,
      name: data.name || data.email,
      picture: data.picture ?? null,
    },
    tokens: {
      accessToken: tokens.access_token ?? undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      expiryDate: tokens.expiry_date ?? undefined,
    },
  };
}

// Returns an OAuth client primed with the user's stored credentials. Refreshed
// tokens are persisted automatically via the "tokens" event.
export function clientForUser(user: User): OAuth2Client {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: user.accessToken ? decrypt(user.accessToken) : undefined,
    refresh_token: user.refreshToken ? decrypt(user.refreshToken) : undefined,
    expiry_date: user.tokenExpiry ? user.tokenExpiry.getTime() : undefined,
  });

  client.on("tokens", (tokens: Auth.Credentials) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (tokens.access_token) updates["accessToken"] = encrypt(tokens.access_token);
    if (tokens.refresh_token)
      updates["refreshToken"] = encrypt(tokens.refresh_token);
    if (tokens.expiry_date)
      updates["tokenExpiry"] = new Date(tokens.expiry_date);
    db.update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .catch((err) => logger.error({ err }, "Failed to persist refreshed tokens"));
  });

  return client;
}

// Returns an OAuth client primed with a connected account's stored credentials.
// Refreshed tokens are persisted back onto the account row. This is the
// multi-account path; routes use the request's active account.
export function clientForAccount(account: Account): OAuth2Client {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: account.accessToken ? decrypt(account.accessToken) : undefined,
    refresh_token: account.refreshToken
      ? decrypt(account.refreshToken)
      : undefined,
    expiry_date: account.tokenExpiry ? account.tokenExpiry.getTime() : undefined,
  });

  client.on("tokens", (tokens: Auth.Credentials) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (tokens.access_token) updates["accessToken"] = encrypt(tokens.access_token);
    if (tokens.refresh_token)
      updates["refreshToken"] = encrypt(tokens.refresh_token);
    if (tokens.expiry_date)
      updates["tokenExpiry"] = new Date(tokens.expiry_date);
    db.update(accountsTable)
      .set(updates)
      .where(eq(accountsTable.id, account.id))
      .catch((err) =>
        logger.error({ err }, "Failed to persist refreshed account tokens"),
      );
  });

  return client;
}
