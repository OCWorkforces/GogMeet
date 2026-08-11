import { describe, it, expect } from "vitest";
import { aggregateParseDiagnostics, parseEvents } from "../../../src/main/swift/event-parser.js";
import { cleanDescription } from "../../../src/domain/services/clean-description.js";
import {
  classifySwiftError,
  SwiftHelperError,
  SWIFT_EXIT_CODES,
} from "../../../src/main/swift/event-validator.js";
import { isoFromNow } from "../../helpers/test-utils.js";

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
  return JSON.stringify([id, title, start, end, url, calendar, allDay, email, notes]);
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

  it("accepts a trailing CRLF after a record", () => {
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
  it("aggregates every closed diagnostic reason while retaining valid events", () => {
    const start = isoFromNow(30);
    const end = isoFromNow(60);
    const valid = makeLine(
      "valid-event",
      "Valid",
      start,
      end,
      "https://meet.google.com/valid-one-two",
      "Work",
      "false",
    );
    const invalidIso = makeLine(
      "invalid-iso",
      "Invalid ISO",
      "not-a-date",
      "also-not-a-date",
      "https://meet.google.com/invalid-iso-one",
      "Work",
      "false",
    );
    const invalidId = makeLine(
      " ",
      "Invalid ID",
      start,
      end,
      "https://meet.google.com/invalid-id-one",
      "Work",
      "false",
    );

    const result = parseEvents(
      [
        valid,
        "not-json",
        JSON.stringify(["too", "few", "fields"]),
        invalidIso,
        invalidId,
        valid,
      ].join("\n"),
    );

    expect(aggregateParseDiagnostics(result.diagnostics)).toEqual({
      total: 5,
      malformedRecord: 1,
      malformedFieldCount: 1,
      invalidIso: 1,
      invalidId: 1,
      duplicateUid: 1,
    });
    expect(result.events.map((event) => event.id)).toEqual(["valid-event"]);
  });

  it("emits malformed_field_count diagnostic for wrong field count", () => {
    const tooFew = JSON.stringify(["only", "three", "fields"]);
    const { events, diagnostics } = parseEvents(tooFew);
    expect(events).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      line: 1,
      reason: "malformed_field_count",
    });
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

  it("deduplicates by id and emits duplicate_uid diagnostic for skipped lines", () => {
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
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("dup-evt");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ line: 2, reason: "duplicate_uid" });
  });

  it("emits invalid_iso diagnostic when end is before start", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(30); // end < start
    const bad = makeLine(
      "evt-reverse",
      "Reverse",
      start,
      end,
      "https://meet.google.com/abc-defg-hij",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(bad);
    expect(events).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ line: 1, reason: "invalid_iso" });
  });
});

describe("parseEvents — JSON Lines protocol", () => {
  it("round-trips special characters within string fields", () => {
    const start = isoFromNow(30);
    const end = isoFromNow(60);
    const title = 'Plan\t"quoted"\\route\r\n日本語';
    const calendar = 'Core\t"team"\\東京';
    const email = 'owner\t"team"\\日本語@example.com';
    const notes = 'Notes\t"quoted"\\path\n日本語';
    const url = "https://meet.google.com/abc-defg-hij?label=%22backslash%5C%E6%97%A5%E6%9C%AC%E8%AA%9E";

    const { events, diagnostics } = parseEvents(
      makeLine("event-日本語", title, start, end, url, calendar, "false", email, notes),
    );

    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "event-日本語",
      title,
      meetUrl: url,
      calendarName: calendar,
      userEmail: email,
      description: notes,
    });
  });

  it("accepts CRLF and LF record boundaries", () => {
    const first = makeLine(
      "first",
      "First",
      isoFromNow(30),
      isoFromNow(60),
      "https://meet.google.com/first-one-two",
      "Work",
      "false",
    );
    const second = makeLine(
      "second",
      "Second",
      isoFromNow(90),
      isoFromNow(120),
      "https://meet.google.com/second-one-two",
      "Work",
      "false",
    );

    const { events, diagnostics } = parseEvents(`${first}\r\n${second}\n`);

    expect(diagnostics).toEqual([]);
    expect(events.map((event) => event.id)).toEqual(["first", "second"]);
  });

  it("reports malformed JSON records with safe reasons and physical line numbers", () => {
    const start = isoFromNow(30);
    const end = isoFromNow(60);
    const valid = makeLine(
      "valid",
      "Valid",
      start,
      end,
      "https://meet.google.com/valid-one-two",
      "Work",
      "false",
    );
    const nonArray = JSON.stringify({ kind: "not-an-array" });
    const nonString = JSON.stringify([
      "non-string",
      "Title",
      start,
      end,
      "https://meet.google.com/non-string-one-two",
      "Work",
      "false",
      "user@example.com",
      1,
    ]);
    const wrongLength = JSON.stringify([
      "wrong-length",
      "Title",
      start,
      end,
      "https://meet.google.com/wrong-length-one-two",
      "Work",
      "false",
      "user@example.com",
    ]);

    const { events, diagnostics } = parseEvents(
      `${valid}\r\nnot-json\n${nonArray}\r\n${nonString}\n${wrongLength}\r\n`,
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("valid");
    expect(diagnostics).toEqual([
      { line: 2, reason: "malformed_record" },
      { line: 3, reason: "malformed_record" },
      { line: 4, reason: "malformed_record" },
      { line: 5, reason: "malformed_field_count" },
    ]);
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

  it("extracts Calendly URL from URL field", () => {
    const line = makeLine(
      "calendly-evt",
      "Calendly Meeting",
      isoFromNow(20),
      isoFromNow(50),
      "https://calendly.com/events/abc-def/google_meet",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(line);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty("meetUrl");
  });

  it("produces event for Calendly URL field even when notes contain a Meet URL", () => {
    const line = makeLine(
      "calendly-mixed",
      "Mixed",
      isoFromNow(20),
      isoFromNow(50),
      "https://calendly.com/events/abc-def/google_meet",
      "Work",
      "false",
      "",
      "Join: https://meet.google.com/xyz-xyz-xyz",
    );
    const { events, diagnostics } = parseEvents(line);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty("meetUrl");
  });

  it("does not false-match google_meet substring inside Calendly URL path", () => {
    const line = makeLine(
      "calendly-substr",
      "Calendly Substring",
      isoFromNow(20),
      isoFromNow(50),
      "https://calendly.com/events/abc-def/google_meet",
      "Work",
      "false",
    );
    const { events, diagnostics } = parseEvents(line);
    expect(diagnostics).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toHaveProperty("meetUrl");
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
