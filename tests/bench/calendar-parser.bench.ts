import { bench, describe } from "vitest";
import { parseEvents } from "../../src/main/swift/event-parser.js";
import {
  generateCalendarParserFixtures,
  preflightCalendarParserFixtures,
} from "./calendar-parser-fixtures.js";

// Fixtures generated outside timed regions.
const fixtures = generateCalendarParserFixtures();
const preflightCode = preflightCalendarParserFixtures(parseEvents);
if (preflightCode !== 0) {
  throw new Error("calendar-parser benchmark preflight failed — refusing to time invalid workloads");
}

const envMeta = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
};

describe("calendar parser benchmark (production JSONL)", () => {
  // Emit machine metadata once for receipt capture (not timed).
  // eslint-disable-next-line no-console
  console.log("[bench:calendar-parser] meta", JSON.stringify(envMeta));

  for (const fixture of fixtures) {
    if (fixture.kind === "malformed") continue; // preflight-only
    bench(
      `parseEvents/${fixture.kind}`,
      () => {
        parseEvents(fixture.raw);
      },
      { warmupIterations: 5, iterations: 30 },
    );
  }
});
