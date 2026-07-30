import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  MAPPING_FIELDS,
  synthesizePagedResponse,
  flattenPages,
  compareShadow,
  redactTrace,
} from "../../scripts/performance/measure-google-calendar.mjs";

const script = join(process.cwd(), "scripts/performance/measure-google-calendar.mjs");

describe("perf:google synthetic harness", () => {
  it("includes nextPageToken and every mapping field", () => {
    expect(MAPPING_FIELDS).toContain("nextPageToken");
    expect(MAPPING_FIELDS).toContain("id");
    expect(MAPPING_FIELDS).toContain("summary");
    expect(MAPPING_FIELDS).toContain("hangoutLink");
    expect(MAPPING_FIELDS).toContain("conferenceData.entryPoints.uri");
    expect(MAPPING_FIELDS).toContain("attendees.responseStatus");
  });

  it("synthesizes multi-page responses with nextPageToken", () => {
    const pages = synthesizePagedResponse(3, 4);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.nextPageToken).toBe("page-1");
    expect(pages[2]?.nextPageToken).toBeUndefined();
    const flat = flattenPages(pages);
    expect(flat.eventIds).toHaveLength(12);
    expect(flat.pageTokensSeen).toBe(2);
  });

  it("equality comparison rejects page/event mismatches", () => {
    const a = {
      calendarIds: ["primary"],
      pageCount: 2,
      eventIds: ["a", "b"],
      errorClass: null,
    };
    expect(compareShadow(a, { ...a, pageCount: 3 })).toBe("page-count-mismatch");
    expect(compareShadow(a, { ...a, eventIds: ["a"] })).toBe("event-mismatch");
    expect(compareShadow(a, a)).toBeNull();
  });

  it("redacts forbidden keys/values", () => {
    expect(() => redactTrace({ token: "x" })).toThrow(/forbidden key/);
    expect(() => redactTrace({ note: "password=1" })).toThrow(/forbidden value/);
    expect(() =>
      redactTrace({ version: 1, operation: "google-http", note: "ok", pageTokensSeen: 2 }),
    ).not.toThrow();
    expect(() =>
      redactTrace(
        { mappingFields: ["description", "nextPageToken"] },
        { allowFieldPaths: true },
      ),
    ).not.toThrow();
  });

  it("perf:google exits 0 with blocked/rejected terminal receipt", () => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env },
    });
    expect(result.status).toBe(0);
    const receipt = JSON.parse(result.stdout);
    expect(receipt.version).toBe(1);
    expect(receipt.task).toBe(10);
    expect(["blocked", "rejected", "retained", "skipped"]).toContain(receipt.status);
    expect(receipt.mappingFields).toEqual(expect.arrayContaining(["nextPageToken"]));
  });
});
