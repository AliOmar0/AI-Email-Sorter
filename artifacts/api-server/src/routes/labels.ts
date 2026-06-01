import { Router, type IRouter } from "express";
import { db, labelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateLabelBody, UpdateLabelBody } from "@workspace/api-zod";
import { listLabelsWithCounts } from "../lib/emailRepo";

const router: IRouter = Router();

router.get("/labels", async (_req, res) => {
  res.json(await listLabelsWithCounts());
});

router.post("/labels", async (req, res) => {
  const body = CreateLabelBody.parse(req.body);
  const [created] = await db
    .insert(labelsTable)
    .values({
      name: body.name,
      color: body.color,
      description: body.description ?? null,
      isSystem: false,
    })
    .returning();
  res.status(201).json({
    id: created.id,
    name: created.name,
    color: created.color,
    description: created.description ?? null,
    isSystem: created.isSystem,
    emailCount: 0,
  });
});

router.patch("/labels/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const body = UpdateLabelBody.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates["name"] = body.name;
  if (body.color !== undefined) updates["color"] = body.color;
  if (body.description !== undefined) updates["description"] = body.description;

  if (Object.keys(updates).length > 0) {
    await db.update(labelsTable).set(updates).where(eq(labelsTable.id, id));
  }

  const labels = await listLabelsWithCounts();
  const label = labels.find((l) => l.id === id);
  if (!label) return res.status(404).json({ error: "Label not found" });
  return res.json(label);
});

router.delete("/labels/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [label] = await db
    .select()
    .from(labelsTable)
    .where(eq(labelsTable.id, id));
  if (!label) return res.status(404).json({ error: "Label not found" });
  if (label.isSystem)
    return res.status(400).json({ error: "System labels cannot be deleted" });

  await db.delete(labelsTable).where(eq(labelsTable.id, id));
  return res.status(204).end();
});

export default router;
