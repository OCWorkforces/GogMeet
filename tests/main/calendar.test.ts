import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseEvents, cleanDescription } from "../../src/main/calendar.js";
import type { MeetingEvent } from "../../src/shared/models.js";

// Helper to create tab-delimited Swift output
function makeSwiftLine(
  id: string,
  title: string,
  start: string,
  end: string,
  url: string,
  calendar: string,
  allDay: string,
  email?: string,
  notes?: string,
): string {
  const parts = [id, title, start, end, url, calendar, allDay];
  if (email !== undefined) {
    parts.push(email);
  }
  if (notes !== undefined) {
    parts.push(notes);
  }
  return parts.join("\t");
}

// Helper to get ISO strings for relative times
function isoFromNow(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

describe("parseEvents", () => {
  it("parses valid 8-field input correctly", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-1",
      "Team Standup",
      start,
      end,
      "https://meet.google.com/abc-def-ghi",
      "Work",
      "false",
      "user@example.com",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      id: "evt-1",
      title: "Team Standup",
      startDate: start,
      endDate: end,
      meetUrl: "https://meet.google.com/abc-def-ghi",
      calendarName: "Work",
      isAllDay: false,
      userEmail: "user@example.com",
    });
  });

  it("parses 7-field input (without email)", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-2",
      "Quick Sync",
      start,
      end,
      "https://meet.google.com/xyz",
      "Personal",
      "false",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].userEmail).toBeUndefined();
  });

  it("skips lines with fewer than 7 fields", () => {
    const input = "evt-1\tTitle\t2024-01-01"; // Only 3 fields
    const events = parseEvents(input);
    expect(events).toHaveLength(0);
  });

  it("filters out events before today midnight", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // Yesterday
    pastDate.setHours(10, 0, 0, 0);

    const input = makeSwiftLine(
      "evt-past",
      "Past Meeting",
      pastDate.toISOString(),
      new Date(pastDate.getTime() + 30 * 60 * 1000).toISOString(),
      "https://meet.google.com/past",
      "Work",
      "false",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(0);
  });

  it("filters out events beyond 2 days from today midnight", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3); // 3 days from now
    futureDate.setHours(10, 0, 0, 0);

    const input = makeSwiftLine(
      "evt-future",
      "Future Meeting",
      futureDate.toISOString(),
      new Date(futureDate.getTime() + 30 * 60 * 1000).toISOString(),
      "https://meet.google.com/future",
      "Work",
      "false",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(0);
  });

  it("deduplicates events by id", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const line = makeSwiftLine(
      "evt-dup",
      "Same Event",
      start,
      end,
      "https://meet.google.com/dup",
      "Work",
      "false",
    );
    const input = `${line}\n${line}`;

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
  });

  it("sorts events by startDate ascending", () => {
    const start1 = isoFromNow(120);
    const end1 = isoFromNow(150);
    const start2 = isoFromNow(30);
    const end2 = isoFromNow(60);

    const input = [
      makeSwiftLine(
        "evt-late",
        "Later",
        start1,
        end1,
        "https://meet.google.com/late",
        "Work",
        "false",
      ),
      makeSwiftLine(
        "evt-early",
        "Earlier",
        start2,
        end2,
        "https://meet.google.com/early",
        "Work",
        "false",
      ),
    ].join("\n");

    const events = parseEvents(input);
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe("evt-early");
    expect(events[1].id).toBe("evt-late");
  });

  it("handles all-day events", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-allday",
      "All Day Event",
      start,
      end,
      "",
      "Personal",
      "true",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].isAllDay).toBe(true);
  });

  it("handles optional meetUrl (empty string becomes undefined)", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-nourl",
      "No URL Event",
      start,
      end,
      "",
      "Work",
      "false",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].meetUrl).toBeUndefined();
  });

  it("handles optional userEmail (empty/whitespace excluded)", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-noemail",
      "No Email",
      start,
      end,
      "https://meet.google.com/x",
      "Work",
      "false",
      "   ",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].userEmail).toBeUndefined();
  });

  it("returns empty array for empty input", () => {
    expect(parseEvents("")).toEqual([]);
    expect(parseEvents("   ")).toEqual([]);
  });

  it("returns empty array for malformed dates", () => {
    const input = makeSwiftLine(
      "evt-bad",
      "Bad Date",
      "not-a-date",
      "also-bad",
      "https://meet.google.com/bad",
      "Work",
      "false",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(0);
  });

  it("trims whitespace from fields", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "  evt-trim  ",
      "  Trimmed Title  ",
      start,
      end,
      "  https://meet.google.com/trim  ",
      "  Work  ",
      "  false  ",
      "  user@example.com  ",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("evt-trim");
    expect(events[0].title).toBe("Trimmed Title");
    expect(events[0].meetUrl).toBe("https://meet.google.com/trim");
    expect(events[0].calendarName).toBe("Work");
    expect(events[0].userEmail).toBe("user@example.com");
  });

  it("handles multiple valid events", () => {
    const start1 = isoFromNow(30);
    const end1 = isoFromNow(60);
    const start2 = isoFromNow(120);
    const end2 = isoFromNow(150);
    const start3 = isoFromNow(240);
    const end3 = isoFromNow(270);

    const input = [
      makeSwiftLine(
        "evt-1",
        "Meeting 1",
        start1,
        end1,
        "https://meet.google.com/1",
        "Work",
        "false",
      ),
      makeSwiftLine(
        "evt-2",
        "Meeting 2",
        start2,
        end2,
        "https://meet.google.com/2",
        "Personal",
        "false",
      ),
      makeSwiftLine(
        "evt-3",
        "Meeting 3",
        start3,
        end3,
        "https://meet.google.com/3",
        "Work",
        "false",
      ),
    ].join("\n");

    const events = parseEvents(input);
    expect(events).toHaveLength(3);
    expect(events[0].title).toBe("Meeting 1");
    expect(events[1].title).toBe("Meeting 2");
    expect(events[2].title).toBe("Meeting 3");
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-crlf",
      "CRLF Event",
      start,
      end,
      "https://meet.google.com/crlf",
      "Work",
      "false",
    ).replace(/\n/g, "\r\n");

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
  });

  it("skips empty lines in input", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = [
      "",
      makeSwiftLine(
        "evt-1",
        "Meeting 1",
        start,
        end,
        "https://meet.google.com/1",
        "Work",
        "false",
      ),
      "   ",
      makeSwiftLine(
        "evt-2",
        "Meeting 2",
        start,
        end,
        "https://meet.google.com/2",
        "Work",
        "false",
      ),
      "",
    ].join("\n");

    const events = parseEvents(input);
    expect(events).toHaveLength(2);
    expect(events).toHaveLength(2);
  });

  it("parses 9-field input with description", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-desc",
      "Meeting with Notes",
      start,
      end,
      "https://meet.google.com/desc",
      "Work",
      "false",
      "user@example.com",
      "This is a meeting note",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].description).toBe("This is a meeting note");
  });

  it("excludes empty or whitespace-only description", () => {
    const start = isoFromNow(60);
    const end = isoFromNow(90);
    const input = makeSwiftLine(
      "evt-nodesc",
      "Meeting No Desc",
      start,
      end,
      "https://meet.google.com/nodesc",
      "Work",
      "false",
      "user@example.com",
      "   ",
    );

    const events = parseEvents(input);
    expect(events).toHaveLength(1);
    expect(events[0].description).toBeUndefined();
  });
});

describe("cleanDescription", () => {
  it("strips Outlook text-border artifacts (-::~:~::~:...)"
    , () => {
    const input =
      "-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-";
    expect(cleanDescription(input)).toBe("");
  });

  it("strips long underscore separator lines", () => {
    const input = "Hello\n________________________________\nWorld";
    expect(cleanDescription(input)).toBe("Hello\nWorld");
  });

  it("strips long dash separator lines", () => {
    const input = "Agenda\n--------------------------------\n1. Item";
    expect(cleanDescription(input)).toBe("Agenda\n1. Item");
  });

  it("strips Outlook bordered separators (* ___ *)", () => {
    const input = "Notes\n* _______________________________ *\nMore notes";
    expect(cleanDescription(input)).toBe("Notes\nMore notes");
  });

  it("returns empty string when description is only artifacts", () => {
    const input =
      "-::~:~::~:~:~:~:~::~:~::-\n________________________________\n-::~:~::~:~::-";
    expect(cleanDescription(input)).toBe("");
  });

  it("preserves real content mixed with artifacts", () => {
    const input =
      "-::~:~::~:~::~:~::-\nPlease join the meeting\n-::~:~::~:~::~:~::-\nAgenda:\n1. Review Q4 results\n________________________________";
    expect(cleanDescription(input)).toBe(
      "Please join the meeting\nAgenda:\n1. Review Q4 results", 
);
  });

  it("preserves normal descriptions unchanged", () => {
    const input = "Quarterly review meeting.\nPlease prepare your updates.";
    expect(cleanDescription(input)).toBe(input);
  });

  it("does not strip short dashes or meaningful content", () => {
    const input = "Key points:\n- Item 1\n- Item 2";
    expect(cleanDescription(input)).toBe(input);
  });
});
