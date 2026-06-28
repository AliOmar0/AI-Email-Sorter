import { Router, type IRouter } from "express";
import { isAIConfigured } from "../lib/aiClient";
import { runAutoLabelForAllAccounts } from "../lib/autoLabel";
import { runDailyDigestForAllAccounts } from "../lib/dailyDigest";
import { extractCronSecret, secretMatches } from "../lib/cronAuth";
import { asyncRoute } from "../middlewares/asyncRoute";

const router: IRouter = Router();

function requireCron(
  req: import("express").Request,
  res: import("express").Response,
): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) {
    // Disabled until configured — never run unauthenticated.
    res.status(503).json({ error: "Cron is not configured" });
    return false;
  }
  if (!secretMatches(extractCronSecret(req.headers), expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!isAIConfigured()) {
    res.status(503).json({ error: "AI provider not configured" });
    return false;
  }
  return true;
}

// Scheduled background auto-labeling. Triggered by Vercel Cron (or any
// scheduler) — NOT a user session — so it is gated by CRON_SECRET instead of
// requireAuth, and lives among the public routes (before requireAuth).
//
// Accepts GET (Vercel Cron's default verb) and POST.
const handleAutoLabelCron = asyncRoute("cron.autoLabel", async (req, res) => {
  if (!requireCron(req, res)) return;
  const summary = await runAutoLabelForAllAccounts();
  const labeled = summary.results.reduce((n, r) => n + r.labeled, 0);
  req.log.info({ accounts: summary.accounts, labeled }, "cron auto-label complete");
  res.json({
    accounts: summary.accounts,
    labeled,
    results: summary.results,
  });
});

const handleDailyDigestCron = asyncRoute("cron.dailyDigest", async (req, res) => {
  if (!requireCron(req, res)) return;
  const summary = await runDailyDigestForAllAccounts();
  const sent = summary.results.filter((r) => r.sent).length;
  const emails = summary.results.reduce((n, r) => n + r.emails, 0);
  req.log.info(
    { accounts: summary.accounts, sent, emails },
    "cron daily digest complete",
  );
  res.json({
    accounts: summary.accounts,
    sent,
    emails,
    results: summary.results,
  });
});

router.get("/cron/auto-label", handleAutoLabelCron);
router.post("/cron/auto-label", handleAutoLabelCron);
router.get("/cron/daily-digest", handleDailyDigestCron);
router.post("/cron/daily-digest", handleDailyDigestCron);

export default router;
