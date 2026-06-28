import { Router, type IRouter } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { asyncRoute } from "../middlewares/asyncRoute";

const router: IRouter = Router();

// Per-user preferences for scheduled AI features.
router.patch(
  "/settings",
  asyncRoute("settings.update", async (req, res) => {
    const body = UpdateSettingsBody.parse(req.body);
    const updates: {
      autoLabelEnabled?: boolean;
      dailyDigestEnabled?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };
    if (body.autoLabelEnabled !== undefined) {
      updates.autoLabelEnabled = body.autoLabelEnabled;
    }
    if (body.dailyDigestEnabled !== undefined) {
      updates.dailyDigestEnabled = body.dailyDigestEnabled;
    }
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.user!.id))
      .returning();
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      autoLabelEnabled: user.autoLabelEnabled,
      dailyDigestEnabled: user.dailyDigestEnabled,
    });
  }),
);

export default router;
