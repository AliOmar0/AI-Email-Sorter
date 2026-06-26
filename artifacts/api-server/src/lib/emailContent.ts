// Untrusted-email-content handling, isolated from the Gmail API client so it
// can be unit-tested without the googleapis runtime. This is the main
// attacker-controlled-input surface: HTML sanitization, charset decoding, body
// extraction, and List-Unsubscribe parsing all live here.
//
// Only `sanitize-html` is imported at runtime; the googleapis import is
// type-only (erased at build/strip time) so this module stays dependency-light.
import sanitizeHtml from "sanitize-html";
import type { gmail_v1 } from "googleapis";

export interface ExtractedBody {
  // Sanitized HTML suitable for rendering in an isolated frame; "" if none.
  html: string;
  // Plain-text rendering for previews and AI context.
  text: string;
  // Whether the sanitized HTML had remote images neutralized (tracking pixels).
  hasRemoteImages: boolean;
}

// Normalize a charset label from a part's Content-Type into something
// TextDecoder accepts. Common email charsets (ISO-8859-1, windows-1252, etc.)
// must be honored or their bytes render as mojibake when force-decoded as UTF-8.
export function normalizeCharset(charset: string | undefined): string {
  const c = (charset || "utf-8").trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!c || c === "us-ascii" || c === "ascii") return "utf-8";
  // ISO-8859-1 is, per the WHATWG Encoding Standard, decoded as windows-1252;
  // TextDecoder maps the label itself, so just pass it through.
  return c;
}

// The windows-1252 0x80–0x9F (C1) block. Per the WHATWG Encoding Standard,
// BOTH the "windows-1252" and "iso-8859-1"/"latin1" labels decode through this
// table — and real-world mail labelled iso-8859-1 almost always carries cp1252
// bytes (smart quotes, em dash, €). Node's bundled ICU is inconsistent here
// across platforms, so we map this range ourselves for deterministic output.
// 0x81/0x8D/0x8F/0x90/0x9D are unused → mapped to the identity C1 code point.
const CP1252_C1 = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const WINDOWS_1252_LABELS = new Set([
  "windows-1252",
  "cp1252",
  "cp-1252",
  "x-cp1252",
  "iso-8859-1",
  "iso8859-1",
  "latin1",
  "l1",
]);

function decodeWindows1252(buf: Buffer): string {
  let out = "";
  for (const b of buf) {
    if (b >= 0x80 && b <= 0x9f) out += String.fromCharCode(CP1252_C1[b - 0x80]);
    else out += String.fromCharCode(b);
  }
  return out;
}

export function decodeBody(data: string, charset?: string): string {
  // Gmail returns part bodies as base64url (URL-safe alphabet using - and _).
  // Decoding with plain "base64" silently corrupts any bytes that map to those
  // characters, so we must use the base64url decoder.
  const buf = Buffer.from(data, "base64url");
  const label = normalizeCharset(charset);

  // Single-byte Latin family: decode via the explicit windows-1252 table so the
  // C1 range (smart quotes, dashes, €) is correct regardless of platform ICU.
  if (WINDOWS_1252_LABELS.has(label)) return decodeWindows1252(buf);

  try {
    // fatal:false so undecodable bytes become U+FFFD instead of throwing.
    return new TextDecoder(label, { fatal: false }).decode(buf);
  } catch {
    // Unknown/unsupported label (TextDecoder throws on construction): fall back
    // to UTF-8 rather than failing the whole message.
    return buf.toString("utf8");
  }
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
export const ALLOWED_STYLES = {
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
//
// Remote (http/https) <img> sources are neutralized by default: the src is
// moved to a data-blocked-src attribute so nothing is fetched until the user
// chooses to display images. This kills tracking pixels and speeds up load.
// Inline data: images stay as-is (no network, no tracking).
export function sanitizeEmailHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "center",
      "font",
    ]),
    allowedAttributes: {
      "*": ["style", "align", "width", "height", "bgcolor", "color"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style", "data-blocked-src"],
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
      // Hold back remote images: move src → data-blocked-src so the browser
      // never requests them until the user opts in. data: images are local and
      // left untouched.
      img: (tagName, attribs) => {
        const src = attribs["src"];
        if (src && /^https?:/i.test(src)) {
          const { src: _omit, ...rest } = attribs;
          return { tagName, attribs: { ...rest, "data-blocked-src": src } };
        }
        return { tagName, attribs };
      },
    },
  });
}

// True when sanitized HTML contains at least one held-back remote image.
export function htmlHasBlockedImages(html: string): boolean {
  return /data-blocked-src=/.test(html);
}

// Convert an HTML fragment to readable plain text (used when no text/plain part
// exists and for AI context, where markup is noise).
export function htmlToText(raw: string): string {
  return sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Pull the charset out of a part's Content-Type header (e.g.
// `text/html; charset="iso-8859-1"`), if present.
function partCharset(part: gmail_v1.Schema$MessagePart): string | undefined {
  const ct = part.headers?.find((h) => h.name?.toLowerCase() === "content-type");
  const match = /charset\s*=\s*"?([^";]+)"?/i.exec(ct?.value ?? "");
  return match?.[1];
}

export function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
): ExtractedBody {
  if (!payload) return { html: "", text: "", hasRemoteImages: false };
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const mime = part.mimeType ?? "";
    if (part.body?.data) {
      const charset = partCharset(part);
      if (mime === "text/html")
        htmlParts.push(decodeBody(part.body.data, charset));
      else if (mime === "text/plain")
        textParts.push(decodeBody(part.body.data, charset));
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);

  const rawHtml = htmlParts.join("\n");
  const rawText = textParts.join("\n");
  const html = rawHtml ? sanitizeEmailHtml(rawHtml) : "";
  const text = rawText.trim() || (rawHtml ? htmlToText(rawHtml) : "");
  return { html, text, hasRemoteImages: htmlHasBlockedImages(html) };
}

// Parse a List-Unsubscribe header (RFC 2369): a comma-separated list of
// <https://...> and/or <mailto:...> targets. Prefer the https target for a
// one-click web unsubscribe; expose the mailto as a fallback.
export function parseListUnsubscribe(value: string): {
  url: string | null;
  mailto: string | null;
} {
  let url: string | null = null;
  let mailto: string | null = null;
  for (const m of value.matchAll(/<([^>]+)>/g)) {
    const target = m[1].trim();
    if (/^https:\/\//i.test(target) && !url) url = target;
    else if (/^mailto:/i.test(target) && !mailto) mailto = target;
  }
  return { url, mailto };
}
