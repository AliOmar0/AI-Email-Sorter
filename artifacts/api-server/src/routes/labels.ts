import { Router, type IRouter } from "express";
import { CreateLabelBody, UpdateLabelBody } from "@workspace/api-zod";
import { clientForAccount } from "../lib/google";
import {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  getLabelById,
} from "../lib/gmail";
import { asyncRoute } from "../middlewares/asyncRoute";

const router: IRouter = Router();

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.get("/labels", asyncRoute("labels.list", async (req, res) => {
  const auth = clientForAccount(req.account!);
  res.json(await listLabels(auth));
}));

router.post("/labels", asyncRoute("labels.create", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = CreateLabelBody.parse(req.body);
  const label = await createLabel(auth, {
    name: body.name,
    color: body.color,
  });
  res.status(201).json(label);
}));

router.patch("/labels/:id", asyncRoute("labels.update", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = UpdateLabelBody.parse(req.body);
  const label = await updateLabel(auth, param(req.params.id), {
    name: body.name,
    color: body.color,
  });
  res.json(label);
}));

router.delete("/labels/:id", asyncRoute("labels.delete", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const id = param(req.params.id);
  const label = await getLabelById(auth, id);
  if (!label) {
    res.status(404).json({ error: "Label not found" });
    return;
  }
  if (label.isSystem) {
    res.status(400).json({ error: "System labels cannot be deleted" });
    return;
  }
  await deleteLabel(auth, id);
  res.status(204).end();
}));

export default router;
