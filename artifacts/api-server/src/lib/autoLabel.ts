import { db, usersTable, accountsTable, type Account } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { clientForAccount } from "./google";
import { listEmails, listLabels } from "./gmail";
import { applyAutoLabels, userLabels } from "./aiLabeling";
import { buildSinceQuery, newestReceivedAt } from "./autoLabelHelpers";
import { logger } from "./logger";

export interface AutoLabelRunResult {
  accountId: number;
  considered: number;
  labeled: number;
}

// How many recent unlabeled emails to consider per account per run. Bounded
// because each is a separate (slow, paid) AI call.
const MAX_PER_ACCOUNT = 15;

// Run one auto-label pass for a single connected account: classify recent
// unlabeled mail and apply matching labels, then advance the per-account
// watermark so the next run starts after the newest message seen here.
export async function runAutoLabelForAccount(
  account: Account,
  budgetMs = 18_000,
): Promise<AutoLabelRunResult> {
  const auth = clientForAccount(account);
  const labels = userLabels(await listLabels(auth));
  if (labels.length === 0) {
    return { accountId: account.id, considered: 0, labeled: 0 };
  }

  const since = buildSinceQuery(account.autoLabelCursor ?? null);
  const targets = await listEmails(
    auth,
    { view: "unlabeled", search: since },
    MAX_PER_ACCOUNT,
  );

  if (targets.length === 0) {
    return { accountId: account.id, considered: 0, labeled: 0 };
  }

  const outcome = await applyAutoLabels(auth, targets, labels, {
    budgetMs,
    concurrency: 3,
  });

  // Advance the watermark to the newest message we actually looked at so we
  // don't re-evaluate it (even if it stayed unlabeled because nothing fit).
  const newest = newestReceivedAt(targets);
  if (newest) {
    await db
      .update(accountsTable)
      .set({ autoLabelCursor: newest, updatedAt: new Date() })
      .where(eq(accountsTable.id, account.id));
  }

  return {
    accountId: account.id,
    considered: targets.length,
    labeled: outcome.labeled,
  };
}

// Run auto-labeling for every connected account whose owning user opted in and
// that still has a refresh token. Bounded by a max account count and an overall
// wall-clock budget so the scheduled invocation stays within the function limit.
export async function runAutoLabelForAllAccounts(
  opts: { maxAccounts?: number; totalBudgetMs?: number } = {},
): Promise<{ accounts: number; results: AutoLabelRunResult[] }> {
  const maxAccounts = opts.maxAccounts ?? 25;
  const totalBudgetMs = opts.totalBudgetMs ?? 50_000;

  const rows = await db
    .select({ account: accountsTable })
    .from(accountsTable)
    .innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
    .where(
      and(
        eq(usersTable.autoLabelEnabled, true),
        isNotNull(accountsTable.refreshToken),
      ),
    )
    .limit(maxAccounts);

  const candidates = rows.map((r) => r.account);
  const results: AutoLabelRunResult[] = [];
  const startedAt = Date.now();
  for (const account of candidates) {
    if (Date.now() - startedAt > totalBudgetMs) break;
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    try {
      results.push(
        await runAutoLabelForAccount(
          account,
          Math.min(18_000, Math.max(4_000, remaining)),
        ),
      );
    } catch (err) {
      logger.error({ err, accountId: account.id }, "auto-label run failed");
    }
  }

  return { accounts: candidates.length, results };
}
