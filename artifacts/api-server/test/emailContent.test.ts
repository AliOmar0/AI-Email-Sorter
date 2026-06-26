import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeEmailHtml,
  decodeBody,
  extractBody,
  parseListUnsubscribe,
  normalizeCharset,
} from "../src/lib/emailContent.ts";

// base64url-encode a byte array (matches what Gmail returns for part bodies).
const b64url = (bytes: number[] | Buffer) =>
  Buffer.from(bytes as number[]).toString("base64url");

// ---------------------------------------------------------------------------
// sanitizeEmailHtml — the primary untrusted-input attack surface.
// ---------------------------------------------------------------------------

test("sanitizer removes <script> tags and their content", () => {
  const out = sanitizeEmailHtml(
    `<p>hi</p><script>alert(document.cookie)</script>`,
  );
  assert.ok(!/script/i.test(out));
  assert.ok(!/alert/.test(out));
  assert.match(out, /<p>hi<\/p>/);
});

test("sanitizer strips inline event handlers", () => {
  const out = sanitizeEmailHtml(`<a href="https://x.com" onclick="steal()">x</a>`);
  assert.ok(!/onclick/i.test(out));
  assert.ok(!/steal/.test(out));
});

test("sanitizer drops javascript: hrefs", () => {
  const out = sanitizeEmailHtml(`<a href="javascript:alert(1)">click</a>`);
  assert.ok(!/javascript:/i.test(out));
});

test("sanitizer drops the content of <style>/<title>/<head>", () => {
  const out = sanitizeEmailHtml(
    `<head><title>secret</title><style>.x{color:red}</style></head><p>body</p>`,
  );
  assert.ok(!/secret/.test(out));
  assert.ok(!/color:red/.test(out));
  assert.match(out, /body/);
});

test("sanitizer holds back remote images into data-blocked-src", () => {
  const out = sanitizeEmailHtml(
    `<img src="https://track.example.com/pixel.gif" alt="x">`,
  );
  assert.ok(!/\ssrc="https/.test(out), "remote src must be removed");
  assert.match(out, /data-blocked-src="https:\/\/track\.example\.com\/pixel\.gif"/);
});

test("sanitizer keeps inline data: images (no network, no tracking)", () => {
  const data = "data:image/png;base64,iVBORw0KGgo=";
  const out = sanitizeEmailHtml(`<img src="${data}" alt="logo">`);
  assert.match(out, /src="data:image\/png/);
  assert.ok(!/data-blocked-src/.test(out));
});

test("sanitizer forces target/rel hardening on links", () => {
  const out = sanitizeEmailHtml(`<a href="https://example.com">x</a>`);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
});

test("sanitizer rejects url() payloads in style", () => {
  const out = sanitizeEmailHtml(
    `<div style="background-image:url(https://evil.com/x)">x</div>`,
  );
  assert.ok(!/url\(/i.test(out));
});

// ---------------------------------------------------------------------------
// decodeBody — base64url + charset handling.
// ---------------------------------------------------------------------------

test("decodeBody reads base64url (URL-safe - and _) without corruption", () => {
  // Bytes 0xFB,0xFF base64-encode to "+/8=" — chars that differ in base64url
  // ("-_8"). Plain base64 decoding would corrupt them.
  const encoded = b64url([0xfb, 0xff]);
  assert.ok(/[-_]/.test(encoded));
  const decoded = decodeBody(encoded, "iso-8859-1");
  assert.equal(decoded, "\u00fb\u00ff"); // û ÿ
});

test("decodeBody round-trips UTF-8 with multibyte + emoji", () => {
  const original = "Héllo — wörld 😀";
  const encoded = Buffer.from(original, "utf8").toString("base64url");
  assert.equal(decodeBody(encoded, "utf-8"), original);
});

test("decodeBody honors windows-1252 smart quotes", () => {
  // 0x93/0x94 are “ ” in windows-1252 but control chars in latin1/utf-8.
  const encoded = b64url([0x93, 0x94]);
  assert.equal(decodeBody(encoded, "windows-1252"), "\u201c\u201d");
});

test("decodeBody decodes iso-8859-1 high bytes", () => {
  const encoded = b64url([0xe9]); // é
  assert.equal(decodeBody(encoded, "iso-8859-1"), "\u00e9");
});

test("decodeBody falls back to UTF-8 on an unknown charset label", () => {
  const original = "plain ascii";
  const encoded = Buffer.from(original, "utf8").toString("base64url");
  assert.equal(decodeBody(encoded, "x-totally-made-up"), original);
});

test("normalizeCharset maps ascii/us-ascii to utf-8 and lowercases", () => {
  assert.equal(normalizeCharset(undefined), "utf-8");
  assert.equal(normalizeCharset("US-ASCII"), "utf-8");
  assert.equal(normalizeCharset('"ISO-8859-1"'), "iso-8859-1");
});

// ---------------------------------------------------------------------------
// extractBody — MIME tree walking, charset propagation, image flag.
// ---------------------------------------------------------------------------

test("extractBody prefers the text/plain part for the text field", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      {
        mimeType: "text/plain",
        body: { data: Buffer.from("plain version", "utf8").toString("base64url") },
      },
      {
        mimeType: "text/html",
        body: { data: Buffer.from("<p>html version</p>", "utf8").toString("base64url") },
      },
    ],
  };
  const out = extractBody(payload as never);
  assert.equal(out.text, "plain version");
  assert.match(out.html, /html version/);
});

test("extractBody derives text from HTML when no text/plain part exists", () => {
  const payload = {
    mimeType: "text/html",
    body: { data: Buffer.from("<p>Hello <b>world</b></p>", "utf8").toString("base64url") },
  };
  const out = extractBody(payload as never);
  assert.match(out.text, /Hello world/);
});

test("extractBody applies the part's declared charset", () => {
  const payload = {
    mimeType: "text/html",
    headers: [{ name: "Content-Type", value: 'text/html; charset="windows-1252"' }],
    body: { data: b64url([0x3c, 0x70, 0x3e, 0x93, 0x94, 0x3c, 0x2f, 0x70, 0x3e]) }, // <p>“”</p>
  };
  const out = extractBody(payload as never);
  assert.match(out.html, /\u201c\u201d/);
});

test("extractBody flags remote images and blocks them", () => {
  const payload = {
    mimeType: "text/html",
    body: {
      data: Buffer.from(
        `<img src="https://track.example.com/x.gif">`,
        "utf8",
      ).toString("base64url"),
    },
  };
  const out = extractBody(payload as never);
  assert.equal(out.hasRemoteImages, true);
  assert.match(out.html, /data-blocked-src/);
});

test("extractBody returns empty body for missing payload", () => {
  const out = extractBody(undefined);
  assert.deepEqual(out, { html: "", text: "", hasRemoteImages: false });
});

// ---------------------------------------------------------------------------
// parseListUnsubscribe — RFC 2369 header parsing.
// ---------------------------------------------------------------------------

test("parseListUnsubscribe prefers https and keeps mailto fallback", () => {
  const res = parseListUnsubscribe(
    "<mailto:unsub@list.example.com>, <https://example.com/u/abc>",
  );
  assert.equal(res.url, "https://example.com/u/abc");
  assert.equal(res.mailto, "mailto:unsub@list.example.com");
});

test("parseListUnsubscribe returns nulls when no recognizable target", () => {
  const res = parseListUnsubscribe("not-a-bracketed-uri");
  assert.equal(res.url, null);
  assert.equal(res.mailto, null);
});

test("parseListUnsubscribe handles mailto-only", () => {
  const res = parseListUnsubscribe("<mailto:bye@x.com>");
  assert.equal(res.url, null);
  assert.equal(res.mailto, "mailto:bye@x.com");
});
