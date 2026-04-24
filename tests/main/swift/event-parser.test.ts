import { describe, it, expect } from "vitest";
import {
  parseEvents,
  cleanDescription,
  classifySwiftError,
  SwiftHelperError,
  SWIFT_EXIT_CODES,
} from "../../../src/main/swift/event-parser.js";
import { isoFromNow } from "../../helpers/test-utils.js";

/** Build a 9-field tab-delimited Swift line. */
function makeLine(
  id: string,
  title: string,
  start: string,
  end: string,
  url: string,
  calendar: string,
  allDay: string,
  email = "",
  notes = "",
): string {
  return [id, title, start, end, url, calendar, allDay, email, notes].join("\t");
}

describe("parseEvents — happy path", () => {
  it("parses a single valid event line correctly", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const line = makeLine(
      "evt-1",
      "Standup",
      start,
      end,
      "https://meet.google.com/aaa-bbbb-ccc",
      "Work",
      "false",
      "user@example.com",
      "Daily standup",
    );

    const { events, diagnostics } = parseEvents(line);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "evt-1",
      title: "Standup",
      meetUrl: "https://meet.google.com/aaa-bbbb-ccc",
      calendarName: "Work",
      isAllDay: false,
      userEmail: "user@example.com",
      description: "Daily standup",
    });
    // start/end are normalised through `new Date(...).toISOString()` so they
    // equal the canonical UTC representation, not the raw string.
    expect(new Date(events[0]!.startDate).toISOString()).toBe(
      new Date(start).toISOString(),
    );
  });

  it("parses multiple lines and sorts ascending by startDate", () => {
    const lateStart = isoFromNow(120);
    const earlyStart = isoFromNow(30);
    const input = [
      makeLine("late", "Late", lateStart, isoFromNow(150), "https://meet.google.com/x-x-x", "Work", "false"),
      makeLine("early", "Early", earlyStart, isoFromNow(60), "https://meet.google.com/y-y-y", "Work", "false"),
    ].join("\n");

    const { events } = parseEvents(input);
    expect(events.map((e) => e.id)).toEqual(["early", "late"]);
  });
});

describe("parseEvents — empty / whitespace input", () => {
  it("returns empty events and diagnostics for empty string", () => {
    expect(parseEvents("")).toEqual({ events: [], diagnostics: [] });
  });

  it("skips blank lines silently (no diagnostics)", () => {
    const valid = makeLine(
      "only-evt",
      "Solo",
      isoFromNow(45),
      isoFromNow(75),
      "https://meet.google.com/zzz-zzzz-zzz",
      "Work",
      "false",
    );
    const input = `\n\n${valid}\n\n`;
    const { events, diagnostics } = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(diagnostics).toEqual([]);
  });

  it("strips trailing CRLF on lines", () => {
    const valid = makeLine(
      "crlf-evt",
      "Carriage",
      isoFromNow(40),
      isoFromNow(70),
      "https://meet.google.com/crlf-crlf-crl",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(`${valid}\r\n`);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("crlf-evt");
  });
});

describe("parseEvents — malformed input", () => {
  it("emits malformed_field_count diagnostic for wrong field count", () => {
    const tooFew = ["only", "three", "fields"].join("\t");
    const { events, diagnostics } = parseEvents(tooFew);
    expect(events).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 1,
      reason: "malformed_field_count",
    });
    expect(diagnostics[0]?.raw).toContain("only");
  });

  it("emits invalid_iso diagnostic for unparseable dates", () => {
    const bad = makeLine(
      "evt-bad-date",
      "BadDate",
      "not-a-date",
      "also-not",
      "https://meet.google.com/abc-defg-hij",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(bad);
    expect(events).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ line: 1, reason: "invalid_iso" });
  });

  it("emits invalid_id diagnostic for empty id field", () => {
    const bad = makeLine(
      "   ",
      "Untitled",
      isoFromNow(30),
      isoFromNow(60),
      "https://meet.google.com/aaa-bbbb-ccc",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(bad);
    expect(events).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ line: 1, reason: "invalid_id" });
  });

  it("silently filters out-of-range events (not today/tomorrow)", () => {
    const lastWeek = isoFromNow(-60 * 24 * 7);
    const lastWeekEnd = isoFromNow(-60 * 24 * 7 + 30);
    const line = makeLine(
      "old-evt",
      "Old",
      lastWeek,
      lastWeekEnd,
      "https://meet.google.com/aaa-bbbb-ccc",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(line);
    expect(events).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it("deduplicates by id silently", () => {
    const start = isoFromNow(45);
    const dup = makeLine(
      "dup-evt",
      "First",
      start,
      isoFromNow(75),
      "https://meet.google.com/aaa-bbbb-ccc",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(`${dup}\n${dup}`);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
  });
});

describe("parseEvents — all-day events", () => {
  it("sets isAllDay=true when allDay field is 'true'", () => {
    const line = makeLine(
      "ad-1",
      "All Hands",
      isoFromNow(120),
      isoFromNow(180),
      "https://meet.google.com/all-day1-evt",
      "Work",
      "true",
    );
    const { events } = parseEvents(line);
    expect(events).toHaveLength(1);
    expect(events[0]?.isAllDay).toBe(true);
  });

  it("treats any value other than 'true' as false", () => {
    const line = makeLine(
      "ad-2",
      "Half Hands",
      isoFromNow(120),
      isoFromNow(180),
      "https://meet.google.com/all-day2-evt",
      "Work",
      "TRUE", // case-sensitive — should be false
    );
    const { events } = parseEvents(line);
    expect(events[0]?.isAllDay).toBe(false);
  });
});

describe("parseEvents — URL handling", () => {
  it("omits meetUrl when URL field is empty", () => {
    const line = makeLine(
      "no-url-evt",
      "URL-less",
      isoFromNow(20),
      isoFromNow(50),
      "",
      "Work",
      "false",
    );
    const { events } = parseEvents(line);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("meetUrl");
  });

  it("omits meetUrl (but keeps the event) when URL fails brand validation", () => {
    const line = makeLine(
      "bad-url-evt",
      "Bad URL",
      isoFromNow(20),
      isoFromNow(50),
      "http://insecure.example.com/", // not https → fails asMeetUrl
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(line);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("meetUrl");
  });
});

describe("parseEvents — notes handling", () => {
  it("omits description when notes field is empty/whitespace", () => {
    const line = makeLine(
      "no-notes",
      "Quiet",
      isoFromNow(15),
      isoFromNow(45),
      "https://meet.google.com/quiet-evt-zzz",
      "Work",
      "false",
      "",
      "   ",
    );
    const { events } = parseEvents(line);
    expect(events[0]).not.toHaveProperty("description");
  });

  it("preserves notes containing special characters and strips HTML", () => {
    const notes = `Agenda: 1) <a href="https://x">link</a> 2) review & merge — α/β`;
    const line = makeLine(
      "rich-notes",
      "Rich",
      isoFromNow(20),
      isoFromNow(60),
      "https://meet.google.com/rich-evt-aaa",
      "Work",
      "false",
      "",
      notes,
    );
    const { events } = parseEvents(line);
    expect(events[0]?.description).toBe(
      "Agenda: 1) link 2) review & merge — α/β",
    );
  });
});

describe("cleanDescription", () => {
  it("strips Outlook-style border artifacts", () => {
    const input = "Hello\n-::~:~::~:~:~:~:~::-\nWorld";
    expect(cleanDescription(input)).toBe("Hello\nWorld");
  });

  it("strips long underscore/dash separator lines", () => {
    expect(cleanDescription("Top\n__________\nBottom")).toBe("Top\nBottom");
    expect(cleanDescription("Top\n----------\nBottom")).toBe("Top\nBottom");
  });

  it("preserves short separator-like text that is not a divider", () => {
    // 4 dashes is below the threshold (5+) — kept.
    expect(cleanDescription("Hi\n----\nBye")).toBe("Hi\n----\nBye");
  });

  it("returns empty string for HTML-only input", () => {
    expect(cleanDescription("<p></p>")).toBe("");
  });
});

describe("classifySwiftError", () => {
  it("returns 'unknown' for non-exec-error inputs", () => {
    const err = classifySwiftError("plain string");
    expect(err).toBeInstanceOf(SwiftHelperError);
    expect(err.kind).toBe("unknown");
    expect(err.exitCode).toBeUndefined();
  });

  it("classifies PERMISSION_DENIED exit code", () => {
    const err = classifySwiftError({
      code: SWIFT_EXIT_CODES.PERMISSION_DENIED,
      message: "denied",
      stderr: "",
    });
    expect(err.kind).toBe("permission-denied");
    expect(err.exitCode).toBe(2);
  });

  it("classifies NO_CALENDARS exit code", () => {
    const err = classifySwiftError({
      code: SWIFT_EXIT_CODES.NO_CALENDARS,
      message: "no cals",
      stderr: "",
    });
    expect(err.kind).toBe("no-calendars");
    expect(err.exitCode).toBe(3);
  });

  it("classifies OTHER exit code and surfaces stderr", () => {
    const err = classifySwiftError({
      code: SWIFT_EXIT_CODES.OTHER,
      message: "boom",
      stderr: "stack trace here",
    });
    expect(err.kind).toBe("swift-error");
    expect(err.message).toContain("stack trace here");
    expect(err.stderr).toBe("stack trace here");
  });

  it("classifies unrecognised numeric exit code as 'unknown'", () => {
    const err = classifySwiftError({ code: 99, message: "weird", stderr: "" });
    expect(err.kind).toBe("unknown");
    expect(err.exitCode).toBe(99);
    expect(err.message).toContain("99");
  });
});
