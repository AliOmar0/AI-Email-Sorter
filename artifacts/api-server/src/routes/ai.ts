import { Router, type IRouter } from "express";
import {
  AutoLabelEmailsBody,
  SuggestEmailGroupsBody,
  DigestEmailsBody,
} from "@workspace/api-zod";
import { getAIClient, isAIConfigured, AI_MODEL } from "../lib/aiClient";
import { clientForAccount } from "../lib/google";
import {
  listEmails,
  getEmail,
  listLabels,
  setEmailLabels,
  type ApiEmail,
  type ApiLabel,
} from "../lib/gmail";
import {
  applyAutoLabels,
  emailContext,
  extractJson,
  userLabels,
} from "../lib/aiLabeling";
import { asyncRoute } from "../middlewares/asyncRoute";

const router: IRouter = Router();

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

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

router.post("/ai/suggest-labels/:id", asyncRoute("ai.suggestLabels", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const auth = clientForAccount(req.account!);
  const email = await getEmail(auth, param(req.params.id));
  const labels = userLabels(await listLabels(auth));

  const labelList = labels.map((l) => `- ${l.name} (id: ${l.id})`).join("\n");

  const prompt = `You are an expert email organizer. Analyze the email and suggest the most relevant labels.

Existing labels:
${labelList || "(none yet)"}

Email:
${emailContext(email)}

Return a JSON array (max 4 items) of suggestions, ordered by relevance. Each item:
{"labelId": "<existing label id or null>", "name": "<label name>", "confidence": <0..1>, "reason": "<short reason>", "isNew": <true if not in existing labels>}
Prefer existing labels when they fit. Only propose a new label when nothing existing fits well. Respond with JSON only.`;

  try {
    const completion = await getAIClient().chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const content = completion.choices[0]?.message?.content ?? "[]";
    const parsed = extractJson(content) as Array<{
      labelId?: string | null;
      name: string;
      confidence?: number;
      reason?: string;
      isNew?: boolean;
    }>;

    const labelById = new Map(labels.map((l) => [l.id, l]));
    const suggestions = (Array.isArray(parsed) ? parsed : []).map((s) => {
      const existing =
        s.labelId != null ? labelById.get(String(s.labelId)) : undefined;
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
}));

router.post("/ai/auto-label", asyncRoute("ai.autoLabel", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const auth = clientForAccount(req.account!);
  const body = AutoLabelEmailsBody.parse(req.body);
  const labels = userLabels(await listLabels(auth));
  if (labels.length === 0)
    return res.json({ processed: 0, labeled: 0, items: [], remaining: 0 });

  // Cap the unlabeled working set: each email is a separate AI call, so we
  // bound cost/latency rather than processing an entire mailbox at once.
  const MAX_PER_REQUEST = 40;
  let targets: ApiEmail[];
  if (body.emailIds && body.emailIds.length > 0) {
    targets = await Promise.all(
      body.emailIds.slice(0, MAX_PER_REQUEST).map((id) => getEmail(auth, id)),
    );
  } else {
    targets = await listEmails(auth, { view: "unlabeled" }, MAX_PER_REQUEST);
  }

  // Shared with the scheduled cron. The budget stays safely under the serverless
  // maxDuration; the client resumes with another request using `remaining`.
  const outcome = await applyAutoLabels(auth, targets, labels, {
    budgetMs: 22_000,
    concurrency: 3,
  });
  return res.json(outcome);
}));

router.post("/ai/group-suggestions", asyncRoute("ai.groupSuggestions", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const auth = clientForAccount(req.account!);
  const body = SuggestEmailGroupsBody.parse(req.body);

  // Bounded working set: grouping reasons over a recent unlabeled window.
  let targets: ApiEmail[];
  if (body.emailIds && body.emailIds.length > 0) {
    targets = await Promise.all(
      body.emailIds.slice(0, 50).map((id) => getEmail(auth, id)),
    );
  } else {
    targets = await listEmails(auth, { view: "unlabeled" }, 50);
  }

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
{"suggestedLabel": "<short label>", "reason": "<why these belong together>", "emailIds": ["<id>", ...]}
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
      emailIds?: string[];
    }>;
    const validIds = new Set(targets.map((t) => t.id));
    const groups = (Array.isArray(parsed) ? parsed : [])
      .map((g) => ({
        suggestedLabel: g.suggestedLabel,
        suggestedColor: pickColor(g.suggestedLabel),
        reason: g.reason ?? "",
        emailIds: (g.emailIds ?? [])
          .map((x) => String(x))
          .filter((x) => validIds.has(x)),
      }))
      .filter((g) => g.suggestedLabel && g.emailIds.length > 0);
    return res.json(groups);
  } catch (err) {
    req.log.error({ err }, "group-suggestions failed");
    return res.status(502).json({ error: "AI request failed" });
  }
}));

router.post("/ai/digest", asyncRoute("ai.digest", async (req, res) => {
  if (!isAIConfigured())
    return res.status(503).json({ error: "AI provider not configured" });

  const auth = clientForAccount(req.account!);
  const body = DigestEmailsBody.parse(req.body);

  // Scope the digest to the requested view/label, optionally unread-only.
  const search = body.onlyUnread ? "is:unread" : undefined;
  const emails = await listEmails(
    auth,
    { labelId: body.labelId, view: body.view, search },
    25,
  );

  if (emails.length === 0) {
    return res.json({ summary: "No emails to summarize.", count: 0, items: [] });
  }

  const list = emails
    .map(
      (e, i) =>
        `[${i}] id:${e.id} | from:${e.sender} <${e.senderEmail}> | subject:${e.subject}\n${(e.body || e.snippet).slice(0, 500)}`,
    )
    .join("\n\n");

  const prompt = `You are an assistant that summarizes a batch of emails into a useful digest.

Emails:
${list}

Return a JSON object:
{"summary": "<2-4 sentence overview of the whole batch: themes, anything urgent or needing action>", "items": [{"id": "<email id>", "summary": "<one concise sentence>"}]}
Include an item for every email above, in the same order. Respond with JSON only.`;

  try {
    const completion = await getAIClient().chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = extractJson(content) as {
      summary?: string;
      items?: Array<{ id?: string; summary?: string }>;
    };

    const byId = new Map(emails.map((e) => [e.id, e]));
    const items = (parsed.items ?? [])
      .map((it) => {
        const email = it.id != null ? byId.get(String(it.id)) : undefined;
        if (!email) return null;
        return {
          id: email.id,
          subject: email.subject,
          sender: email.sender,
          summary: it.summary ?? "",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return res.json({
      summary: parsed.summary ?? "",
      count: emails.length,
      items,
    });
  } catch (err) {
    req.log.error({ err }, "digest failed");
    return res.status(502).json({ error: "AI request failed" });
  }
}));

export default router;
