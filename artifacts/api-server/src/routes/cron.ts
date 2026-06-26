import { Router, type IRouter } from "express";
import { isAIConfigured } from "../lib/aiClient";
import { runAutoLabelForAllAccounts } from "../lib/autoLabel";
import { extractCronSecret, secretMatches } from "../lib/cronAuth";

const router: IRouter = Router();

// Scheduled background auto-labeling. Triggered by Vercel Cron (or any
// scheduler) — NOT a user session — so it is gated by CRON_SECRET instead of
// requireAuth, and lives among the public routes (before requireAuth).
//
// Accepts GET (Vercel Cron's default verb) and POST.
async function handleAutoLabelCron(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const expected = process.env["CRON_SECRET"];
  if (!expected) {
    // Disabled until configured — never run unauthenticated.
    res.status(503).json({ error: "Cron is not configured" });
    return;
  }
  if (!secretMatches(extractCronSecret(req.headers), expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isAIConfigured()) {
    res.status(503).json({ error: "AI provider not configured" });
    return;
  }

  const summary = await runAutoLabelForAllAccounts();
  const labeled = summary.results.reduce((n, r) => n + r.labeled, 0);
  req.log.info({ accounts: summary.accounts, labeled }, "cron auto-label complete");
  res.json({
    accounts: summary.accounts,
    labeled,
    results: summary.results,
  });
}

router.get("/cron/auto-label", handleAutoLabelCron);
router.post("/cron/auto-label", handleAutoLabelCron);

export default router;
