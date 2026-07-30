import { bench, describe } from "vitest";

/**
 * Synthetic tray-menu materialization cost (measurement-only).
 * Does not invoke Electron Menu.buildFromTemplate outside a packaged host;
 * native timing is blocked in the perf:tray harness when unavailable.
 */

function buildSyntheticTemplate(eventCount: number): Array<{ label: string; enabled: boolean }> {
  return Array.from({ length: eventCount }, (_, i) => ({
    label: `Meeting ${i}`,
    enabled: true,
  }));
}

const envMeta = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
};

describe("tray menu template materialization", () => {
  // eslint-disable-next-line no-console
  console.log("[bench:tray-menu] meta", JSON.stringify(envMeta));

  for (const n of [20, 200, 1000] as const) {
    bench(
      `template/${n}-events`,
      () => {
        void JSON.stringify(buildSyntheticTemplate(n));
      },
      { warmupIterations: 5, iterations: 30 },
    );
  }
});
