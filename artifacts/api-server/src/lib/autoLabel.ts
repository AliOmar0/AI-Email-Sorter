import { db, usersTable, type User } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { clientForUser } from "./google";
import { listEmails, listLabels } from "./gmail";
import { applyAutoLabels, userLabels } from "./aiLabeling";
import { buildSinceQuery, newestReceivedAt } from "./autoLabelHelpers";
import { logger } from "./logger";

export interface AutoLabelRunResult {
  userId: number;
  considered: number;
  labeled: number;
}

// How many recent unlabeled emails to consider per user per run. Bounded
// because each is a separate (slow, paid) AI call.
const MAX_PER_USER = 15;

// Run one auto-label pass for a single user: classify recent unlabeled mail and
// apply matching labels, then advance the watermark so the next run starts after
// the newest message seen here.
export async function runAutoLabelForUser(
  user: User,
  budgetMs = 18_000,
): Promise<AutoLabelRunResult> {
  const auth = clientForUser(user);
  const labels = userLabels(await listLabels(auth));
  if (labels.length === 0) {
    return { userId: user.id, considered: 0, labeled: 0 };
  }

  const since = buildSinceQuery(user.autoLabelCursor ?? null);
  const targets = await listEmails(
    auth,
    { view: "unlabeled", search: since },
    MAX_PER_USER,
  );

  if (targets.length === 0) {
    return { userId: user.id, considered: 0, labeled: 0 };
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
      .update(usersTable)
      .set({ autoLabelCursor: newest, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
  }

  return { userId: user.id, considered: targets.length, labeled: outcome.labeled };
}

// Run auto-labeling for every opted-in user that still has a refresh token,
// bounded by a max user count and an overall wall-clock budget so the scheduled
// invocation stays within the serverless function limit.
export async function runAutoLabelForAllUsers(
  opts: { maxUsers?: number; totalBudgetMs?: number } = {},
): Promise<{ users: number; results: AutoLabelRunResult[] }> {
  const maxUsers = opts.maxUsers ?? 25;
  const totalBudgetMs = opts.totalBudgetMs ?? 50_000;

  const candidates = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.autoLabelEnabled, true),
        isNotNull(usersTable.refreshToken),
      ),
    )
    .limit(maxUsers);

  const results: AutoLabelRunResult[] = [];
  const startedAt = Date.now();
  for (const user of candidates) {
    if (Date.now() - startedAt > totalBudgetMs) break;
    const remaining = totalBudgetMs - (Date.now() - startedAt);
    try {
      results.push(
        await runAutoLabelForUser(user, Math.min(18_000, Math.max(4_000, remaining))),
      );
    } catch (err) {
      logger.error({ err, userId: user.id }, "auto-label run failed for user");
    }
  }

  return { users: candidates.length, results };
}
