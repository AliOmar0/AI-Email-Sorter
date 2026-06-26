import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import cronRouter from "./cron";
import emailsRouter from "./emails";
import labelsRouter from "./labels";
import aiRouter from "./ai";
import statsRouter from "./stats";
import settingsRouter from "./settings";
import accountsRouter from "./accounts";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
// Cron is machine-triggered (gated by CRON_SECRET, not a user session), so it
// must be reachable without requireAuth.
router.use(cronRouter);

// Everything below requires an authenticated user
router.use(requireAuth);
router.use(emailsRouter);
router.use(labelsRouter);
router.use(aiRouter);
router.use(statsRouter);
router.use(settingsRouter);
router.use(accountsRouter);

export default router;
