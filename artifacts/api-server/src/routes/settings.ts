import { Router, type IRouter } from "express";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Per-user preferences. Currently just the background auto-labeling opt-in.
router.patch("/settings", async (req, res, next) => {
  try {
    const body = UpdateSettingsBody.parse(req.body);
    const updates: { autoLabelEnabled?: boolean; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.autoLabelEnabled !== undefined) {
      updates.autoLabelEnabled = body.autoLabelEnabled;
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
    });
  } catch (err) {
    next(err);
  }
});

export default router;
