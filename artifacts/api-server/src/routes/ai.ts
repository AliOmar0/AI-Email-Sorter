import { Router, type IRouter } from "express";
import { db, emailsTable, emailLabelsTable } from "@workspace/db";
import { eq, inArray, notInArray } from "drizzle-orm";
import { AutoLabelEmailsBody, SuggestEmailGroupsBody } from "@workspace/api-zod";
import { getAIClient, isAIConfigured, AI_MODEL } from "../lib/aiClient";
import { listLabelsWithCounts, type ApiLabel } from "../lib/emailRepo";

const router: IRouter = Router();

const PALETTE = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
];

function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function emailContext(e: typeof emailsTable.$inferSelect): string {
  const body = e.body.length > 1200 ? e.body.slice(0, 1200) : e.body;
  return `From: ${e.sender} <${e.senderEmail}>\nSubject: ${e.subject}\nBody: ${body}`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) return JSON.parse(raw);
  return JSON.parse(raw.slice(start));
}

router.post("/ai/suggest-labels/:id", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [email] = await db
    .select()
    .from(emailsTable)
    .where(eq(emailsTable.id, id));
  if (!email) return res.status(404).json({ error: "Email not found" });

  const labels = await listLabelsWithCounts();
  const labelList = labels
    .map((l) => `- ${l.name} (id: ${l.id})${l.description ? `: ${l.description}` : ""}`)
    .join("\n");

  const prompt = `You are an expert email organizer. Analyze the email and suggest the most relevant labels.

Existing labels:
${labelList || "(none yet)"}

Email:
${emailContext(email)}

Return a JSON array (max 4 items) of suggestions, ordered by relevance. Each item:
{"labelId": <existing label id or null>, "name": "<label name>", "confidence": <0..1>, "reason": "<short reason>", "isNew": <true if not in existing labels>}
Prefer existing labels when they fit. Only propose a new label when nothing existing fits well. Respond with JSON only.`;

  try {
    const completion = await getAIClient().chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const content = completion.choices[0]?.message?.content ?? "[]";
    const parsed = extractJson(content) as Array<{
      labelId?: number | null;
      name: string;
      confidence?: number;
      reason?: string;
      isNew?: boolean;
    }>;

    const labelById = new Map(labels.map((l) => [l.id, l]));
    const suggestions = (Array.isArray(parsed) ? parsed : []).map((s) => {
      const existing = s.labelId != null ? labelById.get(s.labelId) : undefined;
      return {
        labelId: existing ? existing.id : null,
        name: existing ? existing.name : s.name,
        color: existing ? existing.color : pickColor(s.name),
        confidence:
          typeof s.confidence === "number"
            ? Math.max(0, Math.min(1, s.confidence))
            : 0.7,
        reason: s.reason ?? "",
        isNew: existing ? false : true,
      };
    });
    return res.json(suggestions);
  } catch (err) {
    req.log.error({ err }, "suggest-labels failed");
    return res.status(502).json({ error: "AI request failed" });
  }
});

router.post("/ai/auto-label", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const body = AutoLabelEmailsBody.parse(req.body);
  const labels = await listLabelsWithCounts();
  if (labels.length === 0)
    return res.json({ processed: 0, labeled: 0, items: [] });

  let targets: (typeof emailsTable.$inferSelect)[];
  if (body.emailIds && body.emailIds.length > 0) {
    targets = await db
      .select()
      .from(emailsTable)
      .where(inArray(emailsTable.id, body.emailIds));
  } else {
    const labeled = db
      .select({ emailId: emailLabelsTable.emailId })
      .from(emailLabelsTable);
    targets = await db
      .select()
      .from(emailsTable)
      .where(notInArray(emailsTable.id, labeled));
  }

  targets = targets.slice(0, 40);
  const labelList = labels.map((l) => `- ${l.name} (id: ${l.id})`).join("\n");
  const validIds = new Set(labels.map((l) => l.id));

  const items: { emailId: number; appliedLabelIds: number[] }[] = [];

  const runOne = async (email: typeof emailsTable.$inferSelect) => {
    const prompt = `Classify this email using ONLY the labels below. Pick the 1-2 most fitting label ids, or none if nothing fits.

Labels:
${labelList}

Email:
${emailContext(email)}

Respond with a JSON object: {"labelIds": [<id>, ...]}. JSON only.`;
    try {
      const completion = await getAIClient().chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      const parsed = extractJson(content) as { labelIds?: number[] };
      const ids = (parsed.labelIds ?? [])
        .filter((x) => validIds.has(x))
        .slice(0, 2);
      if (ids.length > 0) {
        await db
          .insert(emailLabelsTable)
          .values(ids.map((labelId) => ({ emailId: email.id, labelId })))
          .onConflictDoNothing();
      }
      items.push({ emailId: email.id, appliedLabelIds: ids });
    } catch (err) {
      req.log.error({ err, emailId: email.id }, "auto-label item failed");
      items.push({ emailId: email.id, appliedLabelIds: [] });
    }
  };

  const concurrency = 4;
  for (let i = 0; i < targets.length; i += concurrency) {
    await Promise.all(targets.slice(i, i + concurrency).map(runOne));
  }

  return res.json({
    processed: targets.length,
    labeled: items.filter((i) => i.appliedLabelIds.length > 0).length,
    items,
  });
});

router.post("/ai/group-suggestions", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const body = SuggestEmailGroupsBody.parse(req.body);

  let targets: (typeof emailsTable.$inferSelect)[];
  if (body.emailIds && body.emailIds.length > 0) {
    targets = await db
      .select()
      .from(emailsTable)
      .where(inArray(emailsTable.id, body.emailIds));
  } else {
    const labeled = db
      .select({ emailId: emailLabelsTable.emailId })
      .from(emailLabelsTable);
    targets = await db
      .select()
      .from(emailsTable)
      .where(notInArray(emailsTable.id, labeled));
  }

  targets = targets.slice(0, 40);
  if (targets.length === 0) return res.json([]);

  const list = targets
    .map(
      (e) =>
        `id:${e.id} | from:${e.sender} <${e.senderEmail}> | subject:${e.subject} | ${e.snippet}`,
    )
    .join("\n");

  const prompt = `You are organizing an inbox. Cluster these emails into a few meaningful groups of similar emails (by topic/purpose, e.g. newsletters, receipts, work projects, social). For each group propose a concise common label.

Emails:
${list}

Return a JSON array (2-5 groups). Each item:
{"suggestedLabel": "<short label>", "reason": "<why these belong together>", "emailIds": [<id>, ...]}
Only include emails from the list above. Skip emails that don't fit any group. JSON only.`;

  try {
    const completion = await getAIClient().chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const content = completion.choices[0]?.message?.content ?? "[]";
    const parsed = extractJson(content) as Array<{
      suggestedLabel: string;
      reason?: string;
      emailIds?: number[];
    }>;
    const validIds = new Set(targets.map((t) => t.id));
    const groups = (Array.isArray(parsed) ? parsed : [])
      .map((g) => ({
        suggestedLabel: g.suggestedLabel,
        suggestedColor: pickColor(g.suggestedLabel),
        reason: g.reason ?? "",
        emailIds: (g.emailIds ?? []).filter((x) => validIds.has(x)),
      }))
      .filter((g) => g.suggestedLabel && g.emailIds.length > 0);
    return res.json(groups);
  } catch (err) {
    req.log.error({ err }, "group-suggestions failed");
    return res.status(502).json({ error: "AI request failed" });
  }
});

export default router;
