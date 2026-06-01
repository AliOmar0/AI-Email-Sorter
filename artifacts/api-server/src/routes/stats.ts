import { Router, type IRouter } from "express";
import { db, emailsTable, emailLabelsTable } from "@workspace/db";
import { sql, countDistinct } from "drizzle-orm";
import { listLabelsWithCounts } from "../lib/emailRepo";

const router: IRouter = Router();

router.get("/stats", async (_req, res) => {
  const [totals] = await db
    .select({
      totalEmails: sql<number>`cast(count(*) as int)`,
      unreadCount: sql<number>`cast(count(*) filter (where ${emailsTable.isRead} = false) as int)`,
      starredCount: sql<number>`cast(count(*) filter (where ${emailsTable.isStarred} = true) as int)`,
    })
    .from(emailsTable);

  const [labeled] = await db
    .select({ count: countDistinct(emailLabelsTable.emailId) })
    .from(emailLabelsTable);

  const labels = await listLabelsWithCounts();

  const totalEmails = totals?.totalEmails ?? 0;
  const labeledCount = Number(labeled?.count ?? 0);

  res.json({
    totalEmails,
    labeledCount,
    unlabeledCount: totalEmails - labeledCount,
    unreadCount: totals?.unreadCount ?? 0,
    starredCount: totals?.starredCount ?? 0,
    labelCount: labels.length,
    labelBreakdown: labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      count: l.emailCount,
    })),
  });
});

export default router;
