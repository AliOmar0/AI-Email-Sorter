import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSinceQuery, newestReceivedAt } from "../src/lib/autoLabelHelpers.ts";
import { extractCronSecret, secretMatches } from "../src/lib/cronAuth.ts";

// ---------------------------------------------------------------------------
// Watermark / query helpers
// ---------------------------------------------------------------------------

test("buildSinceQuery returns undefined when there is no cursor", () => {
  assert.equal(buildSinceQuery(null), undefined);
});

test("buildSinceQuery emits a Gmail after: query in whole seconds", () => {
  const d = new Date("2025-01-02T03:04:05.678Z");
  assert.equal(buildSinceQuery(d), `after:${Math.floor(d.getTime() / 1000)}`);
});

test("newestReceivedAt returns null for an empty set", () => {
  assert.equal(newestReceivedAt([]), null);
});

test("newestReceivedAt picks the latest receivedAt", () => {
  const emails = [
    { receivedAt: "2025-01-01T00:00:00.000Z" },
    { receivedAt: "2025-03-15T12:00:00.000Z" },
    { receivedAt: "2025-02-01T00:00:00.000Z" },
  ];
  assert.equal(
    newestReceivedAt(emails)?.toISOString(),
    "2025-03-15T12:00:00.000Z",
  );
});

test("newestReceivedAt ignores unparseable dates", () => {
  const emails = [
    { receivedAt: "not-a-date" },
    { receivedAt: "2025-01-01T00:00:00.000Z" },
  ];
  assert.equal(
    newestReceivedAt(emails)?.toISOString(),
    "2025-01-01T00:00:00.000Z",
  );
});

// ---------------------------------------------------------------------------
// Cron secret extraction + comparison
// ---------------------------------------------------------------------------

test("extractCronSecret reads a Bearer authorization header", () => {
  assert.equal(extractCronSecret({ authorization: "Bearer s3cret" }), "s3cret");
});

test("extractCronSecret reads an x-cron-secret header", () => {
  assert.equal(extractCronSecret({ "x-cron-secret": "abc" }), "abc");
});

test("extractCronSecret handles array-valued headers and missing headers", () => {
  assert.equal(extractCronSecret({ authorization: ["Bearer arr"] }), "arr");
  assert.equal(extractCronSecret({}), null);
});

test("secretMatches is true only for an exact match", () => {
  assert.equal(secretMatches("topsecret", "topsecret"), true);
  assert.equal(secretMatches("topsecret", "different"), false);
  assert.equal(secretMatches("short", "longersecret"), false);
});

test("secretMatches rejects when either side is missing", () => {
  assert.equal(secretMatches(null, "x"), false);
  assert.equal(secretMatches("x", undefined), false);
  assert.equal(secretMatches(null, undefined), false);
});
