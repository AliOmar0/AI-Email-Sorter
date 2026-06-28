import { google, type gmail_v1, type Auth } from "googleapis";
import { nearestGmailColor, contrastTextColor } from "./gmailColors";
import {
  extractBody,
  parseListUnsubscribe,
  type ExtractedBody,
} from "./emailContent";

type OAuth2Client = Auth.OAuth2Client;

export interface ApiLabel {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  isSystem: boolean;
  emailCount: number;
}

export interface ApiEmail {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  snippet: string;
  body: string;
  bodyHtml: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  labels: ApiLabel[];
  // True when the sanitized HTML body contains remote (http/https) <img> tags
  // whose src has been neutralized into data-blocked-src so the client can hold
  // them back until the user opts in ("Display images") — kills tracking pixels.
  hasRemoteImages: boolean;
  // Best https one-click/managed unsubscribe target from the List-Unsubscribe
  // header (RFC 2369), or null. mailto fallback when only a mailto: is offered.
  unsubscribeUrl: string | null;
  unsubscribeMailto: string | null;
}

interface LabelIndexEntry {
  id: string;
  name: string;
  color: string | null;
  isSystem: boolean;
}

const HIDDEN_SYSTEM_LABELS = new Set([
  "UNREAD",
  "STARRED",
  "IMPORTANT",
  "SENT",
  "DRAFT",
  "SPAM",
  "TRASH",
  "CHAT",
  "INBOX",
]);

function gmailClient(auth: OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: "v1", auth });
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function statusOf(err: unknown): number | undefined {
  const e = err as { code?: unknown; response?: { status?: unknown } };
  if (typeof e?.response?.status === "number") return e.response.status;
  if (typeof e?.code === "number") return e.code;
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gmail enforces per-user rate limits and occasionally returns transient 5xx.
// Retry those a few times with exponential backoff + jitter. Non-retryable
// errors (4xx other than 429) propagate immediately so the central error
// handler can map them (e.g. 401 → "session expired").
export async function withGmailRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      if (status === undefined || !RETRYABLE_STATUS.has(status)) throw err;
      if (i === attempts - 1) break;
      const backoff = Math.min(8000, 2 ** i * 500) + Math.random() * 250;
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function prettyLabelName(raw: string): string {
  if (raw.startsWith("CATEGORY_")) {
    const rest = raw.slice("CATEGORY_".length).toLowerCase();
    return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return raw;
}

// A label is "visible" (i.e. something a user organizes by) when it is a custom
// user label or a Gmail category. Operational labels (UNREAD, INBOX, ...) are hidden.
function isVisibleLabel(l: gmail_v1.Schema$Label): boolean {
  if (l.type === "user") return true;
  return Boolean(l.id && l.id.startsWith("CATEGORY_"));
}

function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function parseFrom(from: string): { sender: string; senderEmail: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return { sender: name || email, senderEmail: email };
  }
  return { sender: from.trim(), senderEmail: from.trim() };
}

async function getLabelIndex(
  gmail: gmail_v1.Gmail,
): Promise<Map<string, LabelIndexEntry>> {
  const { data } = await withGmailRetry(() =>
    gmail.users.labels.list({ userId: "me" }),
  );
  const map = new Map<string, LabelIndexEntry>();
  for (const l of data.labels ?? []) {
    if (!l.id) continue;
    map.set(l.id, {
      id: l.id,
      name: prettyLabelName(l.name ?? l.id),
      color: l.color?.backgroundColor ?? null,
      isSystem: l.type !== "user",
    });
  }
  return map;
}

function mapEmailLabels(
  labelIds: string[],
  index: Map<string, LabelIndexEntry>,
): ApiLabel[] {
  // Dedupe by display name: Gmail's CATEGORY_* tabs (e.g. CATEGORY_PROMOTIONS)
  // pretty-print to the same name as a user's own label ("Promotions"), which
  // otherwise renders two identical badges. Prefer the user label over the
  // system category when names collide.
  const byName = new Map<string, ApiLabel>();
  for (const id of labelIds) {
    const entry = index.get(id);
    if (!entry) continue;
    const visible = !entry.isSystem || id.startsWith("CATEGORY_");
    if (!visible) continue;
    const key = entry.name.toLowerCase();
    const existing = byName.get(key);
    if (existing && existing.isSystem === false) continue;
    byName.set(key, {
      id: entry.id,
      name: entry.name,
      color: entry.color,
      description: null,
      isSystem: entry.isSystem,
      emailCount: 0,
    });
  }
  return [...byName.values()];
}

function toApiEmail(
  m: gmail_v1.Schema$Message,
  index: Map<string, LabelIndexEntry>,
  body: ExtractedBody,
): ApiEmail {
  const headers = m.payload?.headers;
  const { sender, senderEmail } = parseFrom(header(headers, "From"));
  const labelIds = m.labelIds ?? [];
  const receivedAt = m.internalDate
    ? new Date(Number(m.internalDate)).toISOString()
    : new Date().toISOString();
  const listUnsub = header(headers, "List-Unsubscribe");
  const { url: unsubscribeUrl, mailto: unsubscribeMailto } = listUnsub
    ? parseListUnsubscribe(listUnsub)
    : { url: null, mailto: null };
  return {
    id: m.id ?? "",
    sender,
    senderEmail,
    subject: header(headers, "Subject"),
    snippet: m.snippet ?? "",
    body: body.text || m.snippet || "",
    bodyHtml: body.html,
    receivedAt,
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    labels: mapEmailLabels(labelIds, index),
    hasRemoteImages: body.hasRemoteImages,
    unsubscribeUrl,
    unsubscribeMailto,
  };
}

// Bounded working-set size. A real mailbox can hold tens of thousands of
// messages and each one costs a metadata fetch, so we operate over a recent
// window rather than the entire mailbox. Call sites pass an explicit limit.
export const DEFAULT_EMAIL_LIMIT = 50;

const EMPTY_BODY: ExtractedBody = { html: "", text: "", hasRemoteImages: false };

export interface EmailPage {
  emails: ApiEmail[];
  // Opaque cursor for the next page; null when the window is exhausted.
  nextPageToken: string | null;
}

function buildQuery(opts: {
  labelId?: string;
  view?: string;
  search?: string;
}): string[] {
  const q: string[] = [];
  if (opts.search) q.push(opts.search);
  if (opts.view === "unread") q.push("is:unread");
  if (opts.view === "starred") q.push("is:starred");
  if (opts.view === "unlabeled") q.push("has:nouserlabels");
  if (q.length === 0 && !opts.labelId) q.push("in:inbox");
  return q;
}

// Paged email listing. Returns up to `limit` emails plus a cursor to fetch the
// next window (infinite scroll / "load more"). `pageToken` resumes from a prior
// page. Internal AI/stats callers use the array-returning listEmails wrapper.
export async function listEmailsPaged(
  auth: OAuth2Client,
  opts: { labelId?: string; view?: string; search?: string; pageToken?: string },
  limit: number = DEFAULT_EMAIL_LIMIT,
): Promise<EmailPage> {
  const gmail = gmailClient(auth);
  const q = buildQuery(opts);

  // Page through messages.list (consuming nextPageToken) until we reach the
  // requested limit or the result set is exhausted, carrying the final token so
  // the caller can request the following window.
  const ids: string[] = [];
  let pageToken: string | undefined = opts.pageToken;
  let nextPageToken: string | null = null;
  do {
    const list = await withGmailRetry(() =>
      gmail.users.messages.list({
        userId: "me",
        q: q.length ? q.join(" ") : undefined,
        labelIds: opts.labelId ? [opts.labelId] : undefined,
        maxResults: Math.min(100, limit - ids.length),
        pageToken,
      }),
    );
    for (const m of list.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = list.data.nextPageToken ?? undefined;
    nextPageToken = pageToken ?? null;
  } while (pageToken && ids.length < limit);

  if (ids.length === 0) return { emails: [], nextPageToken: null };

  const index = await getLabelIndex(gmail);
  const msgs = await Promise.all(
    ids.map((id) =>
      withGmailRetry(() =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ).then((r) => r.data),
    ),
  );
  return {
    emails: msgs.map((m) => toApiEmail(m, index, EMPTY_BODY)),
    nextPageToken,
  };
}

export async function listEmails(
  auth: OAuth2Client,
  opts: { labelId?: string; view?: string; search?: string },
  limit: number = DEFAULT_EMAIL_LIMIT,
): Promise<ApiEmail[]> {
  const { emails } = await listEmailsPaged(auth, opts, limit);
  return emails;
}

export async function getEmail(
  auth: OAuth2Client,
  id: string,
): Promise<ApiEmail> {
  const gmail = gmailClient(auth);
  const index = await getLabelIndex(gmail);
  const { data } = await withGmailRetry(() =>
    gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    }),
  );
  return toApiEmail(data, index, extractBody(data.payload));
}

export async function updateEmailState(
  auth: OAuth2Client,
  id: string,
  state: { isRead?: boolean; isStarred?: boolean },
): Promise<ApiEmail> {
  const gmail = gmailClient(auth);
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];
  if (state.isRead === true) removeLabelIds.push("UNREAD");
  if (state.isRead === false) addLabelIds.push("UNREAD");
  if (state.isStarred === true) addLabelIds.push("STARRED");
  if (state.isStarred === false) removeLabelIds.push("STARRED");

  if (addLabelIds.length || removeLabelIds.length) {
    await withGmailRetry(() =>
      gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds, removeLabelIds },
      }),
    );
  }
  return getEmail(auth, id);
}

export async function setEmailLabels(
  auth: OAuth2Client,
  id: string,
  labelIds: string[],
): Promise<ApiEmail> {
  const gmail = gmailClient(auth);
  const index = await getLabelIndex(gmail);

  const { data } = await withGmailRetry(() =>
    gmail.users.messages.get({
      userId: "me",
      id,
      format: "minimal",
    }),
  );
  const current = (data.labelIds ?? []).filter(
    (lid) => index.get(lid)?.isSystem === false,
  );
  const target = [...new Set(labelIds)].filter(
    (lid) => index.get(lid)?.isSystem === false,
  );
  const addLabelIds = target.filter((x) => !current.includes(x));
  const removeLabelIds = current.filter((x) => !target.includes(x));

  if (addLabelIds.length || removeLabelIds.length) {
    await withGmailRetry(() =>
      gmail.users.messages.modify({
        userId: "me",
        id,
        requestBody: { addLabelIds, removeLabelIds },
      }),
    );
  }
  return getEmail(auth, id);
}

export async function removeEmailLabel(
  auth: OAuth2Client,
  id: string,
  labelId: string,
): Promise<ApiEmail> {
  const gmail = gmailClient(auth);
  await withGmailRetry(() =>
    gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { removeLabelIds: [labelId] },
    }),
  );
  return getEmail(auth, id);
}

export async function bulkLabel(
  auth: OAuth2Client,
  emailIds: string[],
  labelId: string,
  action: "add" | "remove",
): Promise<ApiEmail[]> {
  const gmail = gmailClient(auth);
  const ids = [...new Set(emailIds)];
  if (ids.length === 0) return [];

  await withGmailRetry(() =>
    gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids,
        addLabelIds: action === "add" ? [labelId] : [],
        removeLabelIds: action === "remove" ? [labelId] : [],
      },
    }),
  );

  const index = await getLabelIndex(gmail);
  const msgs = await Promise.all(
    ids.map((id) =>
      withGmailRetry(() =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ).then((r) => r.data),
    ),
  );
  return msgs.map((m) => toApiEmail(m, index, EMPTY_BODY));
}

// Real mailbox actions beyond labelling. Maps a high-level action to Gmail
// label mutations / dedicated endpoints, applied in bulk via batchModify where
// possible. Returns the affected messages' fresh metadata state.
export type EmailAction =
  | "archive"
  | "trash"
  | "untrash"
  | "spam"
  | "markRead"
  | "markUnread"
  | "star"
  | "unstar";

export async function bulkAction(
  auth: OAuth2Client,
  emailIds: string[],
  action: EmailAction,
): Promise<ApiEmail[]> {
  const gmail = gmailClient(auth);
  const ids = [...new Set(emailIds)];
  if (ids.length === 0) return [];

  if (action === "trash") {
    // messages.trash applies Gmail's trash semantics (retention, auto-purge)
    // properly; batchModify can't add the TRASH system label.
    await Promise.all(
      ids.map((id) =>
        withGmailRetry(() => gmail.users.messages.trash({ userId: "me", id })),
      ),
    );
  } else if (action === "untrash") {
    await Promise.all(
      ids.map((id) =>
        withGmailRetry(() => gmail.users.messages.untrash({ userId: "me", id })),
      ),
    );
  } else {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    switch (action) {
      case "archive":
        removeLabelIds.push("INBOX");
        break;
      case "spam":
        addLabelIds.push("SPAM");
        removeLabelIds.push("INBOX");
        break;
      case "markRead":
        removeLabelIds.push("UNREAD");
        break;
      case "markUnread":
        addLabelIds.push("UNREAD");
        break;
      case "star":
        addLabelIds.push("STARRED");
        break;
      case "unstar":
        removeLabelIds.push("STARRED");
        break;
    }
    await withGmailRetry(() =>
      gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids, addLabelIds, removeLabelIds },
      }),
    );
  }

  // Trashed messages are still fetchable by id; their new label set reflects the
  // change so the client can reconcile the list.
  const index = await getLabelIndex(gmail);
  const msgs = await Promise.all(
    ids.map((id) =>
      withGmailRetry(() =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      )
        .then((r) => r.data)
        .catch(() => null),
    ),
  );
  return msgs
    .filter((m): m is gmail_v1.Schema$Message => m !== null)
    .map((m) => toApiEmail(m, index, EMPTY_BODY));
}

export interface UnsubscribeResult {
  // "posted" — performed an RFC 8058 one-click POST on the user's behalf.
  // "open"   — no one-click support; client should open `url` for the user.
  // "none"   — no usable unsubscribe target found.
  status: "posted" | "open" | "none";
  url: string | null;
}

// One-click unsubscribe via the List-Unsubscribe header. When the sender also
// advertises List-Unsubscribe-Post: List-Unsubscribe=One-Click (RFC 8058) and
// offers an https endpoint, we POST on the user's behalf. Otherwise we return
// the https/mailto target for the client to open in a new tab.
export async function unsubscribeEmail(
  auth: OAuth2Client,
  id: string,
): Promise<UnsubscribeResult> {
  const gmail = gmailClient(auth);
  const { data } = await withGmailRetry(() =>
    gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["List-Unsubscribe", "List-Unsubscribe-Post"],
    }),
  );
  const headers = data.payload?.headers;
  const listUnsub = header(headers, "List-Unsubscribe");
  if (!listUnsub) return { status: "none", url: null };

  const { url, mailto } = parseListUnsubscribe(listUnsub);
  const oneClick = /one-click/i.test(header(headers, "List-Unsubscribe-Post"));

  if (url && oneClick) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
        redirect: "follow",
      });
      if (resp.ok) return { status: "posted", url };
    } catch {
      // Fall through to letting the client open the link.
    }
  }

  // No one-click (or it failed): hand the best target back to the client.
  return { status: "open", url: url ?? mailto };
}

// Build a minimal RFC 5322 message and base64url-encode it for messages.send.
function buildRawMessage(input: {
  to: string;
  from: string;
  subject: string;
  body: string;
  cc?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
  ];
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  lines.push(`Subject: ${input.subject}`);
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) lines.push(`References: ${input.references}`);
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  // Body is base64 so non-ASCII/long lines survive transport intact.
  lines.push(Buffer.from(input.body, "utf8").toString("base64"));
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export interface SendInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  // When replying/forwarding, the source message id — used to thread the reply
  // (Gmail threadId + In-Reply-To/References headers).
  inReplyToId?: string;
}

export async function sendEmail(
  auth: OAuth2Client,
  input: SendInput,
): Promise<{ id: string; threadId: string | null }> {
  const gmail = gmailClient(auth);

  // Sender identity from the authenticated mailbox.
  const profile = await withGmailRetry(() =>
    gmail.users.getProfile({ userId: "me" }),
  );
  const from = profile.data.emailAddress ?? "me";

  let threadId: string | undefined;
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (input.inReplyToId) {
    const { data: src } = await withGmailRetry(() =>
      gmail.users.messages.get({
        userId: "me",
        id: input.inReplyToId!,
        format: "metadata",
        metadataHeaders: ["Message-ID", "References"],
      }),
    );
    threadId = src.threadId ?? undefined;
    const msgId = header(src.payload?.headers, "Message-ID");
    const refs = header(src.payload?.headers, "References");
    if (msgId) {
      inReplyTo = msgId;
      references = refs ? `${refs} ${msgId}` : msgId;
    }
  }

  const raw = buildRawMessage({
    to: input.to,
    from,
    cc: input.cc,
    subject: input.subject,
    body: input.body,
    inReplyTo,
    references,
  });

  const { data } = await withGmailRetry(() =>
    gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId },
    }),
  );
  return { id: data.id ?? "", threadId: data.threadId ?? null };
}

export async function listLabels(auth: OAuth2Client): Promise<ApiLabel[]> {
  const gmail = gmailClient(auth);
  const { data } = await withGmailRetry(() =>
    gmail.users.labels.list({ userId: "me" }),
  );
  const visible = (data.labels ?? []).filter(isVisibleLabel);

  const detailed = await Promise.all(
    visible.map((l) =>
      withGmailRetry(() =>
        gmail.users.labels.get({ userId: "me", id: l.id! }),
      ).then((r) => r.data),
    ),
  );

  return detailed
    .map((l) => ({
      id: l.id ?? "",
      name: prettyLabelName(l.name ?? l.id ?? ""),
      color: l.color?.backgroundColor ?? null,
      description: null,
      isSystem: l.type !== "user",
      emailCount: l.messagesTotal ?? 0,
    }))
    .sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function createLabel(
  auth: OAuth2Client,
  input: { name: string; color: string },
): Promise<ApiLabel> {
  const gmail = gmailClient(auth);
  const backgroundColor = nearestGmailColor(input.color);
  const { data } = await withGmailRetry(() =>
    gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: input.name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
        color: {
          backgroundColor,
          textColor: contrastTextColor(backgroundColor),
        },
      },
    }),
  );
  return {
    id: data.id ?? "",
    name: prettyLabelName(data.name ?? input.name),
    color: data.color?.backgroundColor ?? backgroundColor,
    description: null,
    isSystem: false,
    emailCount: 0,
  };
}

export async function updateLabel(
  auth: OAuth2Client,
  id: string,
  input: { name?: string; color?: string },
): Promise<ApiLabel> {
  const gmail = gmailClient(auth);
  const requestBody: gmail_v1.Schema$Label = {};
  if (input.name !== undefined) requestBody.name = input.name;
  if (input.color !== undefined) {
    const backgroundColor = nearestGmailColor(input.color);
    requestBody.color = {
      backgroundColor,
      textColor: contrastTextColor(backgroundColor),
    };
  }
  const { data } = await withGmailRetry(() =>
    gmail.users.labels.patch({
      userId: "me",
      id,
      requestBody,
    }),
  );
  return {
    id: data.id ?? id,
    name: prettyLabelName(data.name ?? ""),
    color: data.color?.backgroundColor ?? null,
    description: null,
    isSystem: data.type !== "user",
    emailCount: data.messagesTotal ?? 0,
  };
}

export async function deleteLabel(
  auth: OAuth2Client,
  id: string,
): Promise<void> {
  const gmail = gmailClient(auth);
  await withGmailRetry(() => gmail.users.labels.delete({ userId: "me", id }));
}

export async function getLabelById(
  auth: OAuth2Client,
  id: string,
): Promise<{ isSystem: boolean } | null> {
  const gmail = gmailClient(auth);
  try {
    const { data } = await withGmailRetry(() =>
      gmail.users.labels.get({ userId: "me", id }),
    );
    return { isSystem: data.type !== "user" };
  } catch {
    return null;
  }
}
