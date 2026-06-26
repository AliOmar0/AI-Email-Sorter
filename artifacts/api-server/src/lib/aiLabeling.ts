import type { Auth } from "googleapis";
import { getAIClient, AI_MODEL } from "./aiClient";
import { setEmailLabels, type ApiEmail, type ApiLabel } from "./gmail";
import { logger } from "./logger";

type OAuth2Client = Auth.OAuth2Client;

// Compact, token-bounded representation of an email for the model.
export function emailContext(e: ApiEmail): string {
  const body = e.body.length > 1200 ? e.body.slice(0, 1200) : e.body;
  return `From: ${e.sender} <${e.senderEmail}>\nSubject: ${e.subject}\nBody: ${body}`;
}

// Models sometimes wrap JSON in prose or ``` fences; pull the first JSON value.
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) return JSON.parse(raw);
  return JSON.parse(raw.slice(start));
}

// Only custom (non-system) labels are candidates for AI organizing.
export function userLabels(labels: ApiLabel[]): ApiLabel[] {
  return labels.filter((l) => !l.isSystem);
}

export interface AutoLabelItem {
  emailId: string;
  appliedLabelIds: string[];
}

export interface AutoLabelOutcome {
  processed: number;
  labeled: number;
  items: AutoLabelItem[];
  remaining: number;
}

// Ask the model which of the given labels (if any) fit a single email.
async function classifyEmail(
  email: ApiEmail,
  labelList: string,
  validIds: Set<string>,
): Promise<string[]> {
  const prompt = `Classify this email using ONLY the labels below. Pick the 1-2 most fitting label ids, or none if nothing fits.

Labels:
${labelList}

Email:
${emailContext(email)}

Respond with a JSON object: {"labelIds": ["<id>", ...]}. JSON only.`;

  const completion = await getAIClient().chat.completions.create({
    model: AI_MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson(content) as { labelIds?: string[] };
  return (parsed.labelIds ?? [])
    .map((x) => String(x))
    .filter((x) => validIds.has(x))
    .slice(0, 2);
}

// Classify a batch of emails and apply the matched user labels, merging with
// any labels they already have. Bounded by a wall-clock budget so it stays
// within a serverless function's max duration; returns how many were left
// unprocessed so the caller can resume.
//
// Shared by the interactive /ai/auto-label route and the scheduled cron.
export async function applyAutoLabels(
  auth: OAuth2Client,
  emails: ApiEmail[],
  labels: ApiLabel[],
  opts: { budgetMs?: number; concurrency?: number } = {},
): Promise<AutoLabelOutcome> {
  const candidates = userLabels(labels);
  if (candidates.length === 0 || emails.length === 0) {
    return { processed: 0, labeled: 0, items: [], remaining: emails.length };
  }

  const labelList = candidates.map((l) => `- ${l.name} (id: ${l.id})`).join("\n");
  const validIds = new Set(candidates.map((l) => l.id));
  const items: AutoLabelItem[] = [];

  const runOne = async (email: ApiEmail) => {
    try {
      const ids = await classifyEmail(email, labelList, validIds);
      if (ids.length > 0) {
        const existing = email.labels.filter((l) => !l.isSystem).map((l) => l.id);
        await setEmailLabels(auth, email.id, [...new Set([...existing, ...ids])]);
      }
      items.push({ emailId: email.id, appliedLabelIds: ids });
    } catch (err) {
      logger.error({ err, emailId: email.id }, "auto-label item failed");
      items.push({ emailId: email.id, appliedLabelIds: [] });
    }
  };

  const budgetMs = opts.budgetMs ?? 22_000;
  const concurrency = opts.concurrency ?? 3;
  const startedAt = Date.now();
  let processed = 0;
  for (let i = 0; i < emails.length; i += concurrency) {
    if (Date.now() - startedAt > budgetMs) break;
    const batch = emails.slice(i, i + concurrency);
    await Promise.all(batch.map(runOne));
    processed += batch.length;
  }

  return {
    processed,
    labeled: items.filter((i) => i.appliedLabelIds.length > 0).length,
    items,
    remaining: emails.length - processed,
  };
}
