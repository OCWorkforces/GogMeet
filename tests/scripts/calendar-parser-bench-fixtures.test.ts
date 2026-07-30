import { describe, it, expect } from "vitest";
import { parseEvents } from "../../src/main/swift/event-parser.js";
import {
  SWIFT_JSONL_FIELD_COUNT,
  buildSwiftJsonlRecord,
  buildValidEventLines,
  generateCalendarParserFixtures,
  preflightCalendarParserFixtures,
} from "../bench/calendar-parser-fixtures.js";

describe("calendar-parser-bench fixtures", () => {
  it("builds exactly nine JSON string fields with valid escaping", () => {
    const line = buildSwiftJsonlRecord({
      id: "id-1",
      title: 'Title with "quotes" and \\ backslash',
      startIso: new Date().toISOString(),
      endIso: new Date(Date.now() + 60_000).toISOString(),
      description: "line1\nline2",
    });
    const parsed: unknown = JSON.parse(line);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as unknown[]).length).toBe(SWIFT_JSONL_FIELD_COUNT);
    expect((parsed as unknown[]).every((f) => typeof f === "string")).toBe(true);
  });

  it("valid lines parse with zero diagnostics", () => {
    const raw = buildValidEventLines(5);
    const result = parseEvents(raw);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events.length).toBe(5);
  });

  it("preflight returns 0 for the full fixture set", () => {
    expect(preflightCalendarParserFixtures(parseEvents)).toBe(0);
  });

  it("preflight returns nonzero when parser is broken (malformed-only fixture)", () => {
    const fixtures = generateCalendarParserFixtures();
    const malformed = fixtures.find((f) => f.kind === "malformed");
    expect(malformed).toBeDefined();
    const brokenParse = (): { events: []; diagnostics: [] } => ({
      events: [],
      diagnostics: [],
    });
    // Malformed fixture expects diagnostics; brokenParse returns none → fail.
    expect(preflightCalendarParserFixtures(brokenParse)).toBe(1);
  });

  it("large-description fixture exceeds 2 MiB and still parses", () => {
    const large = generateCalendarParserFixtures().find((f) => f.kind === "large-description");
    expect(large).toBeDefined();
    expect(large!.raw.length).toBeGreaterThan(2 * 1024 * 1024);
    const result = parseEvents(large!.raw);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);
  });
});
