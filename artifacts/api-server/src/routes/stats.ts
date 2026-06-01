import { Router, type IRouter } from "express";
import { clientForUser } from "../lib/google";
import { listEmails, listLabels } from "../lib/gmail";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  const auth = clientForUser(req.user!);

  // Stats describe a recent inbox window; all counts come from the same set
  // so they stay internally consistent.
  const [inbox, labels] = await Promise.all([
    listEmails(auth, { view: "all" }, 200),
    listLabels(auth),
  ]);

  const totalEmails = inbox.length;
  const unreadCount = inbox.filter((e) => !e.isRead).length;
  const starredCount = inbox.filter((e) => e.isStarred).length;
  const labeledCount = inbox.filter((e) =>
    e.labels.some((l) => !l.isSystem),
  ).length;

  res.json({
    totalEmails,
    labeledCount,
    unlabeledCount: totalEmails - labeledCount,
    unreadCount,
    starredCount,
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
