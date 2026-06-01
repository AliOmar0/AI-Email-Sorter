import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailsRouter from "./emails";
import labelsRouter from "./labels";
import aiRouter from "./ai";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emailsRouter);
router.use(labelsRouter);
router.use(aiRouter);
router.use(statsRouter);

export default router;
