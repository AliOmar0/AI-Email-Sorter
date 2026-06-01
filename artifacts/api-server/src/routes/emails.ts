import { Router, type IRouter } from "express";
import {
  UpdateEmailBody,
  SetEmailLabelsBody,
  BulkLabelEmailsBody,
} from "@workspace/api-zod";
import { clientForUser } from "../lib/google";
import {
  listEmails,
  getEmail,
  updateEmailState,
  setEmailLabels,
  removeEmailLabel,
  bulkLabel,
} from "../lib/gmail";

const router: IRouter = Router();

router.get("/emails", async (req, res) => {
  const auth = clientForUser(req.user!);
  const labelId =
    typeof req.query["labelId"] === "string" ? req.query["labelId"] : undefined;
  const view =
    typeof req.query["view"] === "string" ? req.query["view"] : undefined;
  const search =
    typeof req.query["search"] === "string"
      ? req.query["search"].trim()
      : undefined;

  const emails = await listEmails(auth, { labelId, view, search });
  res.json(emails);
});

// bulk-label must be registered before "/emails/:id" so it isn't captured as an id.
router.post("/emails/bulk-label", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = BulkLabelEmailsBody.parse(req.body);
  const emails = await bulkLabel(auth, body.emailIds, body.labelId, body.action);
  res.json(emails);
});

router.get("/emails/:id", async (req, res) => {
  const auth = clientForUser(req.user!);
  const email = await getEmail(auth, req.params.id);
  res.json(email);
});

router.patch("/emails/:id", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = UpdateEmailBody.parse(req.body);
  const email = await updateEmailState(auth, req.params.id, {
    isRead: body.isRead,
    isStarred: body.isStarred,
  });
  res.json(email);
});

router.put("/emails/:id/labels", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = SetEmailLabelsBody.parse(req.body);
  const email = await setEmailLabels(auth, req.params.id, body.labelIds);
  res.json(email);
});

router.delete("/emails/:id/labels/:labelId", async (req, res) => {
  const auth = clientForUser(req.user!);
  const email = await removeEmailLabel(
    auth,
    req.params.id,
    req.params.labelId,
  );
  res.json(email);
});

export default router;
