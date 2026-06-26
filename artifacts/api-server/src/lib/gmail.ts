import { google, type gmail_v1, type Auth } from "googleapis";
import sanitizeHtml from "sanitize-html";
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
  bodyHtml: string;
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
  // Gmail returns part bodies as base64url (URL-safe alphabet using - and _).
  // Decoding with plain "base64" silently corrupts any bytes that map to those
  // characters, so we must use the base64url decoder.
  return Buffer.from(data, "base64url").toString("utf8");
}

interface ExtractedBody {
  // Sanitized HTML suitable for rendering in an isolated frame; "" if none.
  html: string;
  // Plain-text rendering for previews and AI context.
  text: string;
}

// Safe inline-style property allowlist. Deliberately excludes anything that can
// fetch external resources or break layout out of the frame (background-image,
// position, etc.) — only visual/text formatting is permitted, with strict value
// patterns so no url()/expression() payloads slip through.
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d.,\s%]+\)$/i, /^[a-z]+$/i];
const LENGTH = [/^[\d.]+(?:px|em|rem|%|pt)$/i];
// Box dimensions: like LENGTH but the unit is optional so bare "0" is allowed
// (hidden preheaders commonly use height:0 / max-height:0).
const SIZE = [/^[\d.]+(?:px|em|rem|%|pt|vh|vw)?$/i];
const ALLOWED_STYLES = {
  "*": {
    color: COLOR,
    "background-color": COLOR,
    "text-align": [/^(left|right|center|justify)$/i],
    "text-decoration": [/^[\w\s-]+$/i],
    "font-size": LENGTH,
    "font-weight": [/^(normal|bold|bolder|lighter|\d{3})$/i],
    "font-style": [/^(normal|italic|oblique)$/i],
    "font-family": [/^[\w\s,'"-]+$/i],
    "line-height": [/^[\d.]+(?:px|em|rem|%)?$/i],
    padding: [/^[\d.\s]+(?:px|em|rem|%)?$/i],
    margin: [/^[\d.\s]+(?:px|em|rem|%)?(?:\sauto)?$/i],
    width: SIZE,
    "max-width": SIZE,
    "min-width": SIZE,
    height: SIZE,
    "max-height": SIZE,
    "min-height": SIZE,
    // Visibility/layout properties: kept so senders' intentionally-hidden
    // content (preheaders, spacers) stays hidden instead of leaking into the
    // rendered body as stray text or blank gaps. These are purely visual and
    // safe inside the sandboxed, script-less frame.
    display: [
      /^(none|block|inline|inline-block|flex|inline-flex|table|table-row|table-cell|grid|list-item)$/i,
    ],
    visibility: [/^(visible|hidden|collapse)$/i],
    overflow: [/^(visible|hidden|auto|scroll)$/i],
    "overflow-x": [/^(visible|hidden|auto|scroll)$/i],
    "overflow-y": [/^(visible|hidden|auto|scroll)$/i],
    border: [/^[\w\s#(),.%-]+$/i],
    "border-radius": [/^[\d.\s]+(?:px|em|rem|%)?$/i],
  },
};

// Whitelist-based HTML sanitization for untrusted email bodies: strips scripts,
// <style>, event handlers, iframes, forms, etc. Keeps common formatting plus
// (https) links and images (incl. inline data: images) so the email still reads
// like the sender intended. Output is additionally rendered inside a sandboxed,
// script-less iframe on the client.
function sanitizeEmailHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "center",
      "font",
    ]),
    allowedAttributes: {
      "*": ["style", "align", "width", "height", "bgcolor", "color"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
      font: ["color", "face", "size"],
    },
    allowedStyles: ALLOWED_STYLES,
    // Links may only point to safe schemes; inline data: URLs are confined to
    // image sources so they cannot be used as clickable navigation targets.
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "data"] },
    // Drop the *content* of these tags entirely (not just the tag) so an
    // email's <title>, stylesheet text, or <head> metadata never leaks into the
    // rendered body as stray text.
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "head"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}

// Convert an HTML fragment to readable plain text (used when no text/plain part
// exists and for AI context, where markup is noise).
function htmlToText(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
): ExtractedBody {
  if (!payload) return { html: "", text: "" };
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

  const rawHtml = htmlParts.join("\n");
  const rawText = textParts.join("\n");
  const html = rawHtml ? sanitizeEmailHtml(rawHtml) : "";
  const text = rawText.trim() || (rawHtml ? htmlToText(rawHtml) : "");
  return { html, text };
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
  return msgs.map((m) => toApiEmail(m, index, { html: "", text: "" }));
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
  return msgs.map((m) => toApiEmail(m, index, { html: "", text: "" }));
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
