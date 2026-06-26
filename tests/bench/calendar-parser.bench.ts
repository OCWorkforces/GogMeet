import { bench, describe } from "vitest";
import { parseEvents } from "../../src/main/swift/event-parser.js";

const EVENT_COUNT = 20;
const MINUTE_MS = 60_000;
const baseTime = Date.now() + 10 * MINUTE_MS;

function isoFromBase(minutes: number): string {
  return new Date(baseTime + minutes * MINUTE_MS).toISOString();
}

const rawSwiftOutput = Array.from({ length: EVENT_COUNT }, (_, index) =>
  [
    `calendar-event-${index}`,
    `Calendar Meeting ${index}`,
    isoFromBase(index),
    isoFromBase(index + 30),
    "https://meet.google.com/abc-def-ghi",
    index % 2 === 0 ? "Engineering" : "Product",
    "false",
    "user@example.com",
    `Agenda for meeting ${index}`,
  ].join("\t"),
).join("\n");

describe("calendar parser benchmark", () => {
  bench("parseEvents/20 swift rows", () => {
    parseEvents(rawSwiftOutput);
  });
});
