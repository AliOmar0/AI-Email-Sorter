import { Router, type IRouter } from "express";
import { db, emailsTable, emailLabelsTable } from "@workspace/db";
import { eq, and, ilike, or, desc, inArray, sql, notInArray } from "drizzle-orm";
import { UpdateEmailBody, SetEmailLabelsBody, BulkLabelEmailsBody } from "@workspace/api-zod";
import {
  getEmailById,
  getEmailsByIds,
  getLabelsForEmails,
  serializeEmail,
} from "../lib/emailRepo";

const router: IRouter = Router();

router.get("/emails", async (req, res) => {
  const labelIdRaw = req.query["labelId"];
  const view = typeof req.query["view"] === "string" ? req.query["view"] : "all";
  const search =
    typeof req.query["search"] === "string" ? req.query["search"].trim() : "";

  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(emailsTable.subject, pattern),
        ilike(emailsTable.sender, pattern),
        ilike(emailsTable.senderEmail, pattern),
        ilike(emailsTable.body, pattern),
      ),
    );
  }

  if (view === "starred") conditions.push(eq(emailsTable.isStarred, true));
  if (view === "unread") conditions.push(eq(emailsTable.isRead, false));

  const labeledSubquery = db
    .select({ emailId: emailLabelsTable.emailId })
    .from(emailLabelsTable);

  if (view === "unlabeled") {
    conditions.push(notInArray(emailsTable.id, labeledSubquery));
  }

  if (labelIdRaw !== undefined) {
    const labelId = Number(labelIdRaw);
    if (!Number.isNaN(labelId)) {
      const withLabel = db
        .select({ emailId: emailLabelsTable.emailId })
        .from(emailLabelsTable)
        .where(eq(emailLabelsTable.labelId, labelId));
      conditions.push(inArray(emailsTable.id, withLabel));
    }
  }

  const rows = await db
    .select()
    .from(emailsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(emailsTable.receivedAt));

  const labelMap = await getLabelsForEmails(rows.map((r) => r.id));
  res.json(rows.map((r) => serializeEmail(r, labelMap.get(r.id) ?? [])));
});

router.get("/emails/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const email = await getEmailById(id);
  if (!email) return res.status(404).json({ error: "Email not found" });
  return res.json(email);
});

router.patch("/emails/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const body = UpdateEmailBody.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (body.isRead !== undefined) updates["isRead"] = body.isRead;
  if (body.isStarred !== undefined) updates["isStarred"] = body.isStarred;

  if (Object.keys(updates).length > 0) {
    await db.update(emailsTable).set(updates).where(eq(emailsTable.id, id));
  }

  const email = await getEmailById(id);
  if (!email) return res.status(404).json({ error: "Email not found" });
  return res.json(email);
});

router.put("/emails/:id/labels", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const body = SetEmailLabelsBody.parse(req.body);

  const [exists] = await db
    .select({ id: emailsTable.id })
    .from(emailsTable)
    .where(eq(emailsTable.id, id));
  if (!exists) return res.status(404).json({ error: "Email not found" });

  const unique = [...new Set(body.labelIds)];
  await db.transaction(async (tx) => {
    await tx.delete(emailLabelsTable).where(eq(emailLabelsTable.emailId, id));
    if (unique.length > 0) {
      await tx
        .insert(emailLabelsTable)
        .values(unique.map((labelId) => ({ emailId: id, labelId })))
        .onConflictDoNothing();
    }
  });

  const email = await getEmailById(id);
  if (!email) return res.status(404).json({ error: "Email not found" });
  return res.json(email);
});

router.delete("/emails/:id/labels/:labelId", async (req, res) => {
  const id = Number(req.params.id);
  const labelId = Number(req.params.labelId);
  if (Number.isNaN(id) || Number.isNaN(labelId))
    return res.status(400).json({ error: "Invalid id" });

  await db
    .delete(emailLabelsTable)
    .where(
      and(
        eq(emailLabelsTable.emailId, id),
        eq(emailLabelsTable.labelId, labelId),
      ),
    );

  const email = await getEmailById(id);
  if (!email) return res.status(404).json({ error: "Email not found" });
  return res.json(email);
});

router.post("/emails/bulk-label", async (req, res) => {
  const body = BulkLabelEmailsBody.parse(req.body);
  const emailIds = [...new Set(body.emailIds)];

  if (emailIds.length > 0) {
    if (body.action === "add") {
      await db
        .insert(emailLabelsTable)
        .values(emailIds.map((emailId) => ({ emailId, labelId: body.labelId })))
        .onConflictDoNothing();
    } else {
      await db
        .delete(emailLabelsTable)
        .where(
          and(
            eq(emailLabelsTable.labelId, body.labelId),
            inArray(emailLabelsTable.emailId, emailIds),
          ),
        );
    }
  }

  const emails = await getEmailsByIds(emailIds);
  res.json(emails);
});

export default router;
