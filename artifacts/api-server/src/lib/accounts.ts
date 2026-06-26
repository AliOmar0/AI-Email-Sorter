import { db, accountsTable, type Account } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";

// Find a connected account by its Google id, regardless of owner.
export async function findAccountByGoogleId(
  googleId: string,
): Promise<Account | undefined> {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.googleId, googleId));
  return account;
}

// Create or update a connected account for a user. Token strings are expected
// to already be encrypted by the caller (mirrors the users insert path). A
// missing refreshToken is preserved rather than nulled (Google omits it on
// re-consent), and ownership can be re-pointed to the linking user.
export async function upsertAccountForUser(params: {
  userId: number;
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  isPrimary?: boolean;
}): Promise<Account> {
  const existing = await findAccountByGoogleId(params.googleId);
  if (existing) {
    const update: Record<string, unknown> = {
      userId: params.userId,
      email: params.email,
      name: params.name,
      picture: params.picture,
      accessToken: params.accessToken,
      tokenExpiry: params.tokenExpiry,
      updatedAt: new Date(),
    };
    if (params.refreshToken) update["refreshToken"] = params.refreshToken;
    const [updated] = await db
      .update(accountsTable)
      .set(update)
      .where(eq(accountsTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(accountsTable)
    .values({
      userId: params.userId,
      googleId: params.googleId,
      email: params.email,
      name: params.name,
      picture: params.picture,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      tokenExpiry: params.tokenExpiry,
      isPrimary: params.isPrimary ?? false,
    })
    .returning();
  return created;
}

// All connected accounts for a user, primary first then by creation order.
export async function listAccountsForUser(userId: number): Promise<Account[]> {
  return db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(asc(accountsTable.id));
}

export async function getAccountForUser(
  userId: number,
  accountId: number,
): Promise<Account | undefined> {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(and(eq(accountsTable.id, accountId), eq(accountsTable.userId, userId)));
  return account;
}

export async function getPrimaryAccount(
  userId: number,
): Promise<Account | undefined> {
  const accounts = await listAccountsForUser(userId);
  return accounts.find((a) => a.isPrimary) ?? accounts[0];
}

// Resolve the active account for a request: an explicit, owned account id wins
// (from the X-Account-Id header for cross-origin/bearer mode, or the session
// for cookie mode); otherwise fall back to the user's primary account.
export async function resolveActiveAccount(
  userId: number,
  preferredId: number | undefined,
): Promise<Account | undefined> {
  if (preferredId !== undefined) {
    const owned = await getAccountForUser(userId, preferredId);
    if (owned) return owned;
  }
  return getPrimaryAccount(userId);
}

export function toApiAccount(account: Account, activeId: number | undefined) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    picture: account.picture,
    isPrimary: account.isPrimary,
    isActive: account.id === activeId,
  };
}
