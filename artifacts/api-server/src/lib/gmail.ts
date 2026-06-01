import { google, type gmail_v1, type Auth } from "googleapis";
import { nearestGmailColor, contrastTextColor } from "./gmailColors";

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
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  labels: ApiLabel[];
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

function decodeBody(data: string): string {
  return Buffer.from(data, "base64").toString("utf8");
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const mime = part.mimeType ?? "";
    if (part.body?.data) {
      if (mime === "text/html") htmlParts.push(decodeBody(part.body.data));
      else if (mime === "text/plain") textParts.push(decodeBody(part.body.data));
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);

  if (htmlParts.length > 0) return htmlParts.join("\n");
  if (textParts.length > 0) return textParts.join("\n");
  return "";
}

async function getLabelIndex(
  gmail: gmail_v1.Gmail,
): Promise<Map<string, LabelIndexEntry>> {
  const { data } = await gmail.users.labels.list({ userId: "me" });
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
  const result: ApiLabel[] = [];
  for (const id of labelIds) {
    const entry = index.get(id);
    if (!entry) continue;
    const visible =
      !entry.isSystem || id.startsWith("CATEGORY_");
    if (!visible) continue;
    result.push({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      description: null,
      isSystem: entry.isSystem,
      emailCount: 0,
    });
  }
  return result;
}

function toApiEmail(
  m: gmail_v1.Schema$Message,
  index: Map<string, LabelIndexEntry>,
  body: string,
): ApiEmail {
  const headers = m.payload?.headers;
  const { sender, senderEmail } = parseFrom(header(headers, "From"));
  const labelIds = m.labelIds ?? [];
  const receivedAt = m.internalDate
    ? new Date(Number(m.internalDate)).toISOString()
    : new Date().toISOString();
  return {
    id: m.id ?? "",
    sender,
    senderEmail,
    subject: header(headers, "Subject"),
    snippet: m.snippet ?? "",
    body: body || m.snippet || "",
    receivedAt,
    isRead: !labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    labels: mapEmailLabels(labelIds, index),
  };
}

// Bounded working-set size. A real mailbox can hold tens of thousands of
// messages and each one costs a metadata fetch, so we operate over a recent
// window rather than the entire mailbox. Call sites pass an explicit limit.
export const DEFAULT_EMAIL_LIMIT = 50;

export async function listEmails(
  auth: OAuth2Client,
  opts: { labelId?: string; view?: string; search?: string },
  limit: number = DEFAULT_EMAIL_LIMIT,
): Promise<ApiEmail[]> {
  const gmail = gmailClient(auth);
  const q: string[] = [];
  if (opts.search) q.push(opts.search);
  if (opts.view === "unread") q.push("is:unread");
  if (opts.view === "starred") q.push("is:starred");
  if (opts.view === "unlabeled") q.push("has:nouserlabels");
  if (q.length === 0 && !opts.labelId) q.push("in:inbox");

  // Page through messages.list (consuming nextPageToken) until we reach the
  // requested limit or the result set is exhausted.
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: q.length ? q.join(" ") : undefined,
      labelIds: opts.labelId ? [opts.labelId] : undefined,
      maxResults: Math.min(100, limit - ids.length),
      pageToken,
    });
    for (const m of list.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < limit);

  if (ids.length === 0) return [];

  const index = await getLabelIndex(gmail);
  const msgs = await Promise.all(
    ids.map((id) =>
      gmail.users.messages
        .get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
        .then((r) => r.data),
    ),
  );
  return msgs.map((m) => toApiEmail(m, index, ""));
}

export async function getEmail(
  auth: OAuth2Client,
  id: string,
): Promise<ApiEmail> {
  const gmail = gmailClient(auth);
  const index = await getLabelIndex(gmail);
  const { data } = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
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
    await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { addLabelIds, removeLabelIds },
    });
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

  const { data } = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "minimal",
  });
  const current = (data.labelIds ?? []).filter(
    (lid) => index.get(lid)?.isSystem === false,
  );
  const target = [...new Set(labelIds)].filter(
    (lid) => index.get(lid)?.isSystem === false,
  );
  const addLabelIds = target.filter((x) => !current.includes(x));
  const removeLabelIds = current.filter((x) => !target.includes(x));

  if (addLabelIds.length || removeLabelIds.length) {
    await gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }
  return getEmail(auth, id);
}

export async function removeEmailLabel(
  auth: OAuth2Client,
  id: string,
  labelId: string,
): Promise<ApiEmail> {
  const gmail = gmailClient(auth);
  await gmail.users.messages.modify({
    userId: "me",
    id,
    requestBody: { removeLabelIds: [labelId] },
  });
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

  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: {
      ids,
      addLabelIds: action === "add" ? [labelId] : [],
      removeLabelIds: action === "remove" ? [labelId] : [],
    },
  });

  const index = await getLabelIndex(gmail);
  const msgs = await Promise.all(
    ids.map((id) =>
      gmail.users.messages
        .get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
        .then((r) => r.data),
    ),
  );
  return msgs.map((m) => toApiEmail(m, index, ""));
}

export async function listLabels(auth: OAuth2Client): Promise<ApiLabel[]> {
  const gmail = gmailClient(auth);
  const { data } = await gmail.users.labels.list({ userId: "me" });
  const visible = (data.labels ?? []).filter(isVisibleLabel);

  const detailed = await Promise.all(
    visible.map((l) =>
      gmail.users.labels.get({ userId: "me", id: l.id! }).then((r) => r.data),
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
  const { data } = await gmail.users.labels.create({
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
  });
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
  const { data } = await gmail.users.labels.patch({
    userId: "me",
    id,
    requestBody,
  });
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
  await gmail.users.labels.delete({ userId: "me", id });
}

export async function getLabelById(
  auth: OAuth2Client,
  id: string,
): Promise<{ isSystem: boolean } | null> {
  const gmail = gmailClient(auth);
  try {
    const { data } = await gmail.users.labels.get({ userId: "me", id });
    return { isSystem: data.type !== "user" };
  } catch {
    return null;
  }
}
