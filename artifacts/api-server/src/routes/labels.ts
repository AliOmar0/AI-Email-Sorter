import { Router, type IRouter } from "express";
import { CreateLabelBody, UpdateLabelBody } from "@workspace/api-zod";
import { clientForUser } from "../lib/google";
import {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelById,
} from "../lib/gmail";

const router: IRouter = Router();

router.get("/labels", async (req, res) => {
  const auth = clientForUser(req.user!);
  res.json(await listLabels(auth));
});

router.post("/labels", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = CreateLabelBody.parse(req.body);
  const label = await createLabel(auth, {
    name: body.name,
    color: body.color,
  });
  res.status(201).json(label);
});

router.patch("/labels/:id", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = UpdateLabelBody.parse(req.body);
  const label = await updateLabel(auth, req.params.id, {
    name: body.name,
    color: body.color,
  });
  res.json(label);
});

router.delete("/labels/:id", async (req, res) => {
  const auth = clientForUser(req.user!);
  const label = await getLabelById(auth, req.params.id);
  if (!label) {
    res.status(404).json({ error: "Label not found" });
    return;
  }
  if (label.isSystem) {
    res.status(400).json({ error: "System labels cannot be deleted" });
    return;
  }
  await deleteLabel(auth, req.params.id);
  res.status(204).end();
});

export default router;
