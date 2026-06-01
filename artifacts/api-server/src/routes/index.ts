import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import emailsRouter from "./emails";
import labelsRouter from "./labels";
import aiRouter from "./ai";
import statsRouter from "./stats";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated user
router.use(requireAuth);
router.use(emailsRouter);
router.use(labelsRouter);
router.use(aiRouter);
router.use(statsRouter);

export default router;
