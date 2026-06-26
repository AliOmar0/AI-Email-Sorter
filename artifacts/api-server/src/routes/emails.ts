import { Router, type IRouter } from "express";
import {
  UpdateEmailBody,
  SetEmailLabelsBody,
  BulkLabelEmailsBody,
  BulkEmailActionBody,
  SendEmailBody,
} from "@workspace/api-zod";
import { clientForUser } from "../lib/google";
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
  const pageToken =
    typeof req.query["pageToken"] === "string"
      ? req.query["pageToken"]
      : undefined;

  const page = await listEmailsPaged(auth, { labelId, view, search, pageToken });
  res.json(page);
});

// bulk-* and send must be registered before "/emails/:id" so they aren't
// captured as an id.
router.post("/emails/bulk-label", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = BulkLabelEmailsBody.parse(req.body);
  const emails = await bulkLabel(auth, body.emailIds, body.labelId, body.action);
  res.json(emails);
});

router.post("/emails/bulk-action", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = BulkEmailActionBody.parse(req.body);
  const emails = await bulkAction(auth, body.emailIds, body.action);
  res.json(emails);
});

router.post("/emails/send", async (req, res) => {
  const auth = clientForUser(req.user!);
  const body = SendEmailBody.parse(req.body);
  const result = await sendEmail(auth, {
    to: body.to,
    cc: body.cc,
    subject: body.subject,
    body: body.body,
    inReplyToId: body.inReplyToId,
  });
  res.json(result);
});

router.get("/emails/:id", async (req, res) => {
  const auth = clientForUser(req.user!);
  const email = await getEmail(auth, req.params.id);
  res.json(email);
});

router.post("/emails/:id/unsubscribe", async (req, res) => {
  const auth = clientForUser(req.user!);
  const result = await unsubscribeEmail(auth, req.params.id);
  res.json(result);
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
