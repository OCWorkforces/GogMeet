/**
 * Production-shaped JSON Lines fixtures for the calendar parser benchmark.
 * Matches the Swift helper protocol: one JSON array of exactly nine strings per line.
 */

export const SWIFT_JSONL_FIELD_COUNT = 9 as const;

export type CalendarParserFixtureKind =
  | "count-1"
  | "count-20"
  | "count-100"
  | "malformed"
  | "duplicate"
  | "large-description";

export interface CalendarParserFixture {
  readonly kind: CalendarParserFixtureKind;
  readonly raw: string;
  /** Expected diagnostic count after parseEvents (0 for valid workloads). */
  readonly expectedDiagnosticsMin: number;
}

function isoLocalDayOffset(dayOffset: number, hour: number, minute: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Build one nine-field JSONL record matching googlemeet-events.swift output. */
export function buildSwiftJsonlRecord(fields: {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  meetUrl?: string;
  calendarName?: string;
  isAllDay?: boolean;
  userEmail?: string;
  description?: string;
}): string {
  const record: string[] = [
    fields.id,
    fields.title,
    fields.startIso,
    fields.endIso,
    fields.meetUrl ?? "https://meet.google.com/abc-def-ghi",
    fields.calendarName ?? "Engineering",
    fields.isAllDay === true ? "true" : "false",
    fields.userEmail ?? "user@example.com",
    fields.description ?? "",
  ];
  if (record.length !== SWIFT_JSONL_FIELD_COUNT) {
    throw new Error(`Expected ${SWIFT_JSONL_FIELD_COUNT} fields, got ${record.length}`);
  }
  return JSON.stringify(record);
}

export function buildValidEventLines(count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const day = i % 2; // today / tomorrow
    const hour = 9 + (i % 8);
    const start = isoLocalDayOffset(day, hour, 0);
    const end = isoLocalDayOffset(day, hour, 30);
    lines.push(
      buildSwiftJsonlRecord({
        id: `calendar-event-${i}`,
        title: `Calendar Meeting ${i}`,
        startIso: start,
        endIso: end,
        meetUrl: "https://meet.google.com/abc-def-ghi",
        calendarName: i % 2 === 0 ? "Engineering" : "Product",
        description: `Agenda for meeting ${i}`,
      }),
    );
  }
  return lines.join("\n");
}

export function buildMalformedLines(): string {
  return [
    "not-json",
    JSON.stringify(["too", "few", "fields"]),
    buildSwiftJsonlRecord({
      id: "bad-dates",
      title: "Bad",
      startIso: "not-a-date",
      endIso: "also-bad",
    }),
  ].join("\n");
}

export function buildDuplicateIdLines(): string {
  const start = isoLocalDayOffset(0, 10, 0);
  const end = isoLocalDayOffset(0, 10, 30);
  const a = buildSwiftJsonlRecord({
    id: "dup-id",
    title: "First",
    startIso: start,
    endIso: end,
  });
  const b = buildSwiftJsonlRecord({
    id: "dup-id",
    title: "Second",
    startIso: start,
    endIso: end,
  });
  return `${a}\n${b}`;
}

export function buildLargeDescriptionLines(): string {
  // >2 MiB description field to stress parser without invalid JSON.
  const description = "D".repeat(2 * 1024 * 1024 + 64);
  return buildSwiftJsonlRecord({
    id: "large-desc",
    title: "Large description meeting",
    startIso: isoLocalDayOffset(0, 14, 0),
    endIso: isoLocalDayOffset(0, 15, 0),
    description,
  });
}

/** Generate all named fixtures outside of any timed region. */
export function generateCalendarParserFixtures(): readonly CalendarParserFixture[] {
  return [
    { kind: "count-1", raw: buildValidEventLines(1), expectedDiagnosticsMin: 0 },
    { kind: "count-20", raw: buildValidEventLines(20), expectedDiagnosticsMin: 0 },
    { kind: "count-100", raw: buildValidEventLines(100), expectedDiagnosticsMin: 0 },
    { kind: "malformed", raw: buildMalformedLines(), expectedDiagnosticsMin: 1 },
    // Parser records duplicate_uid diagnostics (first-wins).
    { kind: "duplicate", raw: buildDuplicateIdLines(), expectedDiagnosticsMin: 1 },
    { kind: "large-description", raw: buildLargeDescriptionLines(), expectedDiagnosticsMin: 0 },
  ];
}

/**
 * Correctness preflight: valid fixtures must parse with zero diagnostics and
 * expected event counts; malformed must produce diagnostics.
 * Returns 0 on success, 1 on failure.
 */
export function preflightCalendarParserFixtures(
  parse: (raw: string) => { events: readonly unknown[]; diagnostics: readonly unknown[] },
): number {
  const fixtures = generateCalendarParserFixtures();
  for (const fixture of fixtures) {
    const result = parse(fixture.raw);
    if (fixture.kind === "malformed" || fixture.kind === "duplicate") {
      if (result.diagnostics.length < fixture.expectedDiagnosticsMin) {
        console.error(
          `[bench:preflight] ${fixture.kind} produced ${result.diagnostics.length} diagnostics`,
        );
        return 1;
      }
      if (fixture.kind === "duplicate" && result.events.length !== 1) {
        console.error(`[bench:preflight] duplicate expected 1 event, got ${result.events.length}`);
        return 1;
      }
      continue;
    }
    if (result.diagnostics.length > 0) {
      console.error(
        `[bench:preflight] ${fixture.kind} produced ${result.diagnostics.length} diagnostics`,
      );
      return 1;
    }
    if (fixture.kind === "count-1" && result.events.length !== 1) return 1;
    if (fixture.kind === "count-20" && result.events.length !== 20) return 1;
    if (fixture.kind === "count-100" && result.events.length !== 100) return 1;
    if (fixture.kind === "large-description" && result.events.length !== 1) return 1;
  }
  return 0;
}
