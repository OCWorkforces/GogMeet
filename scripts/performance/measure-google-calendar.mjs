#!/usr/bin/env node
/**
 * Measure Google polling field set / pagination (measurement only).
 * Does not write production cache or tokens.
 * Live paired shadows require GOGMEET_GOOGLE_BENCH_TOKEN (never logged).
 *
 * Usage: bun run perf:google
 * Docs: docs/performance/measurement-lab.md
 */
import { join } from "node:path";
import {
  shadowListSelectedCalendarsAndEvents,
  compareShadowSnapshots,
} from "./helpers/google-shadow.mjs";
import { percentile, coefficientOfVariation, writeReceiptJson } from "./helpers/stats.mjs";

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
  if (
    a.calendarCount !== undefined &&
    b.calendarCount !== undefined &&
    a.calendarCount !== b.calendarCount
  ) {
    return "calendar-mismatch";
  }
  if (a.calendarIds && b.calendarIds && a.calendarIds.join("|") !== b.calendarIds.join("|")) {
    return "calendar-mismatch";
  }
  if (a.pageCount !== b.pageCount) return "page-count-mismatch";
  if (a.rawEventCount !== undefined && b.rawEventCount !== undefined) {
    if (a.rawEventCount !== b.rawEventCount) return "event-mismatch";
  } else if (a.eventIds.join("|") !== b.eventIds.join("|")) {
    return "event-mismatch";
  }
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

async function runLivePairedShadows(accessToken) {
  const warmups = 3;
  const pairs = 10;
  const latencies = [];
  const bytes = [];
  let lastMismatch = null;
  let lastSnap = null;

  for (let i = 0; i < warmups; i++) {
    await shadowListSelectedCalendarsAndEvents(accessToken);
  }

  for (let i = 0; i < pairs; i++) {
    const a = await shadowListSelectedCalendarsAndEvents(accessToken);
    const b = await shadowListSelectedCalendarsAndEvents(accessToken);
    latencies.push(a.durationMs, b.durationMs);
    bytes.push(a.transferredBytes, b.transferredBytes);
    const mismatch = compareShadowSnapshots(a, b) ?? compareShadow(a, b);
    if (mismatch) lastMismatch = mismatch;
    lastSnap = a;
  }

  const sortedLat = [...latencies].sort((a, b) => a - b);
  const sortedBytes = [...bytes].sort((a, b) => a - b);
  return {
    pairs,
    warmups,
    mismatch: lastMismatch,
    p50LatencyMs: percentile(sortedLat, 50),
    p95LatencyMs: percentile(sortedLat, 95),
    medianBytes: percentile(sortedBytes, 50),
    coefficientOfVariation: coefficientOfVariation(latencies),
    last: lastSnap
      ? {
          calendarCount: lastSnap.calendarCount,
          pageCount: lastSnap.pageCount,
          eventCount: lastSnap.rawEventCount,
          errorClass: lastSnap.errorClass,
          transferredBytes: lastSnap.transferredBytes,
        }
      : null,
  };
}

async function main() {
  const token = process.env["GOGMEET_GOOGLE_BENCH_TOKEN"];
  const evidenceDir = join(
    process.cwd(),
    ".omo/evidence/gogmeet-performance/task-10-google-measurement",
  );

  const pages = synthesizePagedResponse(3, 5);
  const flat = flattenPages(pages);
  const syntheticBytes = pages.map((p) => p.byteLength);
  const syntheticLatencies = pages.map((_, i) => 12 + i * 3);

  let status = "blocked";
  let reason = "missing-bench-credential-env";
  let live = null;

  if (token && token.length > 0) {
    try {
      live = await runLivePairedShadows(token);
      if (live.mismatch) {
        status = "rejected";
        reason = `paired-shadow-mismatch:${live.mismatch}`;
        process.stderr.write(`[perf:google] paired shadow mismatch: ${live.mismatch}\n`);
        // Nonzero for equivalence failure per plan
        const receipt = buildReceipt({
          status,
          reason,
          flat,
          syntheticBytes,
          syntheticLatencies,
          live,
        });
        writeReceiptJson(evidenceDir, receipt);
        process.exit(1);
      }
      const coef = live.coefficientOfVariation;
      // Live baseline has no alternate field-set candidate yet → cannot claim retained improvement.
      // Equivalence-only success is rejected for product optimization (measurement complete).
      if (coef !== null && coef >= 0.1) {
        status = "rejected";
        reason = "variance-invalid";
      } else if (live.last?.errorClass === "auth") {
        status = "blocked";
        reason = "bench-credential-auth-failed";
      } else {
        status = "rejected";
        reason = "equivalence-ok-no-candidate-optimization";
      }
    } catch (err) {
      status = "blocked";
      reason = "live-shadow-transport-failed";
      live = {
        errorClass: err instanceof Error ? err.name : "unknown",
        // never include err.message if it might embed URLs with tokens
      };
      process.stderr.write("[perf:google] live shadow failed (details redacted)\n");
    }
  }

  const receipt = buildReceipt({
    status,
    reason,
    flat,
    syntheticBytes,
    syntheticLatencies,
    live,
  });
  writeReceiptJson(evidenceDir, receipt);
  process.exit(0);
}

function buildReceipt({ status, reason, flat, syntheticBytes, syntheticLatencies, live }) {
  const sortedLat = [...syntheticLatencies].sort((a, b) => a - b);
  return redactTrace(
    {
      version: 1,
      experiment: "google-polling",
      status,
      reason,
      platform: process.platform,
      arch: process.arch,
      mappingFields: MAPPING_FIELDS,
      synthetic: {
        pageCount: flat.pageCount,
        eventCount: flat.eventIds.length,
        pageTokensSeen: flat.pageTokensSeen,
        transferredBytes: syntheticBytes.reduce((a, b) => a + b, 0),
        p50LatencyMs: percentile(sortedLat, 50),
        p95LatencyMs: percentile(sortedLat, 95),
        coefficientOfVariation: coefficientOfVariation(syntheticLatencies),
      },
      live,
      retainedCriteria: {
        medianBytesImproveAtLeastPct: 15,
        p95LatencyRegressAtMostPct: 5,
        p95LatencyRegressAtMostMs: 25,
        maxCoefficientOfVariation: 0.1,
      },
      productChange: "none",
    },
    { allowFieldPaths: true },
  );
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("measure-google-calendar.mjs") ||
    process.argv[1].includes("measure-google-calendar"));

if (isMain) {
  main().catch(() => {
    process.stderr.write("[perf:google] fatal (redacted)\n");
    process.exit(1);
  });
}
