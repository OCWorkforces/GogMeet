import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const occurrenceIdentitySource = fileURLToPath(
  new URL("../../../src/main/swift/event-occurrence-identity.swift", import.meta.url),
);

describe.skipIf(process.platform !== "darwin")("eventRecordIdentifier", () => {
  it(
    "distinguishes recurrence occurrences and remains stable for identical inputs",
    { timeout: 60_000 },
    async () => {
      // Given
      const directory = await mkdtemp(join(tmpdir(), "gogmeet-event-identity-"));
      const mainSource = join(directory, "main.swift");
      const executable = join(directory, "event-identity");
      await writeFile(
        mainSource,
        [
          "import Foundation",
          "let start = Date(timeIntervalSince1970: 1_700_000_000)",
          "let firstOccurrence = Date(timeIntervalSince1970: 1_700_000_100)",
          "let secondOccurrence = Date(timeIntervalSince1970: 1_700_086_500)",
          "let identifiers = [",
          '  eventRecordIdentifier(calendarItemIdentifier: "series-id", occurrenceDate: firstOccurrence, startDate: start),',
          '  eventRecordIdentifier(calendarItemIdentifier: "series-id", occurrenceDate: secondOccurrence, startDate: start),',
          '  eventRecordIdentifier(calendarItemIdentifier: "series-id", occurrenceDate: firstOccurrence, startDate: start),',
          '  eventRecordIdentifier(calendarItemIdentifier: "series-id", occurrenceDate: nil, startDate: firstOccurrence),',
          "]",
          "identifiers.forEach { print($0) }",
        ].join("\n"),
        "utf-8",
      );

      try {
        // When
        await execFileAsync("swiftc", [occurrenceIdentitySource, mainSource, "-o", executable], {
          timeout: 55_000,
        });
        const { stdout } = await execFileAsync(executable, [], { timeout: 5_000 });
        const identifiers = stdout.trim().split("\n");
        const [first, second, repeated, fallback] = identifiers;

        // Then
        expect(identifiers).toHaveLength(4);
        expect(first).not.toBe(second);
        expect(first).toBe(repeated);
        expect(first).toBe(fallback);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
