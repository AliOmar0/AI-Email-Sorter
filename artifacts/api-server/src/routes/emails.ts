import { Router, type IRouter } from "express";
import {
  UpdateEmailBody,
  SetEmailLabelsBody,
  BulkLabelEmailsBody,
  BulkEmailActionBody,
  SendEmailBody,
} from "@workspace/api-zod";
import { clientForAccount } from "../lib/google";
import {
  listEmailsPaged,
  getEmail,
  updateEmailState,
  setEmailLabels,
  removeEmailLabel,
  bulkLabel,
  bulkAction,
  unsubscribeEmail,
  sendEmail,
} from "../lib/gmail";
import { asyncRoute } from "../middlewares/asyncRoute";

const router: IRouter = Router();

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.get("/emails", asyncRoute("emails.list", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const labelId =
    typeof req.query["labelId"] === "string" ? req.query["labelId"] : undefined;
  const view =
    typeof req.query["view"] === "string" ? req.query["view"] : undefined;
  const search =
    typeof req.query["search"] === "string"
      ? req.query["search"].trim()
      : undefined;
  const pageToken =
    typeof req.query["pageToken"] === "string"
      ? req.query["pageToken"]
      : undefined;

  const page = await listEmailsPaged(auth, { labelId, view, search, pageToken });
  res.json(page);
}));

// bulk-* and send must be registered before "/emails/:id" so they aren't
// captured as an id.
router.post("/emails/bulk-label", asyncRoute("emails.bulkLabel", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = BulkLabelEmailsBody.parse(req.body);
  const emails = await bulkLabel(auth, body.emailIds, body.labelId, body.action);
  res.json(emails);
}));

router.post("/emails/bulk-action", asyncRoute("emails.bulkAction", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = BulkEmailActionBody.parse(req.body);
  const emails = await bulkAction(auth, body.emailIds, body.action);
  res.json(emails);
}));

router.post("/emails/send", asyncRoute("emails.send", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = SendEmailBody.parse(req.body);
  const result = await sendEmail(auth, {
    to: body.to,
    cc: body.cc,
    subject: body.subject,
    body: body.body,
    inReplyToId: body.inReplyToId,
  });
  res.json(result);
}));

router.get("/emails/:id", asyncRoute("emails.get", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const email = await getEmail(auth, param(req.params.id));
  res.json(email);
}));

router.post("/emails/:id/unsubscribe", asyncRoute("emails.unsubscribe", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const result = await unsubscribeEmail(auth, param(req.params.id));
  res.json(result);
}));

router.patch("/emails/:id", asyncRoute("emails.update", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = UpdateEmailBody.parse(req.body);
  const email = await updateEmailState(auth, param(req.params.id), {
    isRead: body.isRead,
    isStarred: body.isStarred,
  });
  res.json(email);
}));

router.put("/emails/:id/labels", asyncRoute("emails.setLabels", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const body = SetEmailLabelsBody.parse(req.body);
  const email = await setEmailLabels(auth, param(req.params.id), body.labelIds);
  res.json(email);
}));

router.delete("/emails/:id/labels/:labelId", asyncRoute("emails.removeLabel", async (req, res) => {
  const auth = clientForAccount(req.account!);
  const email = await removeEmailLabel(
    auth,
    param(req.params.id),
    param(req.params.labelId),
  );
  res.json(email);
}));

export default router;
