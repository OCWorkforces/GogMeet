#!/usr/bin/env node
/**
 * Measure Google polling field set / pagination (measurement only).
 * Does not alter production requests. Live shadow requires GOGMEET_GOOGLE_BENCH_TOKEN.
 *
 * Usage: bun run perf:google
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Fields consumed by production mapGoogleEvent + listSelectedCalendarIds. */
export const MAPPING_FIELDS = Object.freeze([
  "id",
  "status",
  "summary",
  "start.dateTime",
  "start.date",
  "end.dateTime",
  "end.date",
  "hangoutLink",
  "location",
  "description",
  "conferenceData.entryPoints.uri",
  "attendees.self",
  "attendees.responseStatus",
  "nextPageToken",
  "items",
  "selected",
  "primary",
]);

/** Whole-string / secret-like value patterns (not substrings of structural keys). */
const FORBIDDEN_VALUE =
  /\b(authorization|password|secret|pkce|verifier)\b|meet\.google|@[\w.-]+\.[a-z]{2,}/i;
const FORBIDDEN_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "password",
  "secret",
  "email",
  "title",
  "description",
  "pkce",
  "verifier",
]);

export function synthesizePagedResponse(pageCount, eventCountPerPage) {
  const pages = [];
  for (let p = 0; p < pageCount; p++) {
    const items = Array.from({ length: eventCountPerPage }, (_, i) => ({
      id: `evt-${p}-${i}`,
      status: "confirmed",
      summary: `Synthetic ${p}-${i}`,
      start: { dateTime: "2026-07-30T10:00:00.000Z" },
      end: { dateTime: "2026-07-30T11:00:00.000Z" },
      hangoutLink: "https://meet.example.test/abc",
      location: null,
      description: null,
      conferenceData: { entryPoints: [{ uri: "https://meet.example.test/abc" }] },
      attendees: [{ self: true, responseStatus: "accepted" }],
    }));
    pages.push({
      items,
      nextPageToken: p < pageCount - 1 ? `page-${p + 1}` : undefined,
      byteLength: JSON.stringify({ items }).length,
    });
  }
  return pages;
}

export function flattenPages(pages) {
  const events = [];
  let pageTokensSeen = 0;
  for (const page of pages) {
    if (typeof page.nextPageToken === "string") pageTokensSeen += 1;
    for (const item of page.items ?? []) events.push(item.id);
  }
  return { eventIds: events, pageTokensSeen, pageCount: pages.length };
}

export function compareShadow(a, b) {
  if (a.calendarIds.join("|") !== b.calendarIds.join("|")) return "calendar-mismatch";
  if (a.pageCount !== b.pageCount) return "page-count-mismatch";
  if (a.eventIds.join("|") !== b.eventIds.join("|")) return "event-mismatch";
  if (a.errorClass !== b.errorClass) return "error-mismatch";
  return null;
}

/**
 * Reject secret-like free-form strings and exact forbidden keys.
 * Structural field-path inventories (mappingFields) are allowlisted.
 */
export function redactTrace(row, options = {}) {
  const allowFieldPaths = options.allowFieldPaths === true;
  function walk(value, keyPath) {
    if (typeof value === "string") {
      if (allowFieldPaths && keyPath.includes("mappingFields")) return;
      if (FORBIDDEN_VALUE.test(value)) {
        throw new Error(`forbidden value at ${keyPath}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${keyPath}[${i}]`));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(k)) {
          throw new Error(`forbidden key: ${k}`);
        }
        walk(v, keyPath ? `${keyPath}.${k}` : k);
      }
    }
  }
  walk(row, "");
  return row;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function cv(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((acc, d) => acc + (d - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / mean;
}

function main() {
  const token = process.env["GOGMEET_GOOGLE_BENCH_TOKEN"];
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-10-google-measurement",
  );
  mkdirSync(evidenceDir, { recursive: true });

  // Synthetic harness always runs (deterministic substitutes).
  const pages = synthesizePagedResponse(3, 5);
  const flat = flattenPages(pages);
  const bytes = pages.map((p) => p.byteLength);
  const latencies = pages.map((_, i) => 12 + i * 3);

  const baseline = {
    calendarIds: ["primary"],
    pageCount: flat.pageCount,
    eventIds: flat.eventIds,
    errorClass: null,
    transferredBytes: bytes.reduce((a, b) => a + b, 0),
    latenciesMs: latencies,
  };

  // Candidate field set includes every mapping field + nextPageToken.
  const candidateFields = [...MAPPING_FIELDS];
  const missingRequired = MAPPING_FIELDS.filter((f) => !candidateFields.includes(f));

  let status = "rejected";
  let reason = "no-live-shadow-or-below-threshold";
  let live = null;

  if (!token) {
    status = "blocked";
    reason = "missing-bench-credential-env";
  } else if (missingRequired.length > 0) {
    status = "rejected";
    reason = "missing-required-fields";
    process.stderr.write(`[perf:google] missing fields: ${missingRequired.join(",")}\n`);
    process.exit(1);
  } else {
    // Live shadow is intentionally a no-op network call here: credential env
    // alone is insufficient for a safe authenticated call without full OAuth
    // client setup. Treat as blocked for external prereq completeness.
    status = "blocked";
    reason = "live-shadow-requires-full-oauth-harness";
    live = { note: "credential-present-but-shadow-not-executed" };
  }

  // retained thresholds (documented; synthetic baseline cannot retain).
  const p50 = percentile([...latencies].sort((a, b) => a - b), 50);
  const p95 = percentile([...latencies].sort((a, b) => a - b), 95);
  const coef = cv(latencies);

  const receipt = redactTrace(
    {
      version: 1,
      task: 10,
      status,
      reason,
      platform: process.platform,
      arch: process.arch,
      mappingFields: MAPPING_FIELDS,
      synthetic: {
        pageCount: baseline.pageCount,
        eventCount: baseline.eventIds.length,
        pageTokensSeen: flat.pageTokensSeen,
        transferredBytes: baseline.transferredBytes,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        coefficientOfVariation: coef,
      },
      live,
      retainedCriteria: {
        medianBytesImproveAtLeastPct: 15,
        p95LatencyRegressAtMostPct: 5,
        p95LatencyRegressAtMostMs: 25,
        maxCoefficientOfVariation: 0.1,
      },
    },
    { allowFieldPaths: true },
  );

  writeFileSync(join(evidenceDir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  // blocked and rejected synthetic runs exit 0 when receipt is conforming.
  process.exit(0);
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-google-calendar.mjs") ||
    process.argv[1].includes("measure-google-calendar"));

if (isMain) {
  main();
}
