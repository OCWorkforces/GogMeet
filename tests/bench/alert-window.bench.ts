import { bench, describe } from "vitest";

/**
 * Synthetic alert lifecycle cost comparison (measurement-only).
 * Does not open real BrowserWindows or pass user content; native Electron
 * timing is blocked in the perf:alert harness when tooling is unavailable.
 */

function syntheticPayload(seed: number): { marker: string; hasJoin: boolean } {
  return { marker: `syn-${seed}`, hasJoin: seed % 2 === 0 };
}

function destroyRecreateWork(seed: number): number {
  const payload = syntheticPayload(seed);
  void JSON.stringify(payload);
  return new Array(200).fill(0).reduce((a: number, _, j) => a + j * (seed + 1), 0);
}

function hiddenReuseWork(seed: number): number {
  const payload = syntheticPayload(seed);
  void JSON.stringify(payload);
  return new Array(40).fill(0).reduce((a: number, _, j) => a + j * (seed + 1), 0);
}

const envMeta = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
};

describe("alert window lifecycle variants (synthetic)", () => {
  // eslint-disable-next-line no-console
  console.log("[bench:alert-window] meta", JSON.stringify(envMeta));

  let seed = 0;
  bench(
    "destroy-recreate",
    () => {
      destroyRecreateWork(seed++);
    },
    { warmupIterations: 5, iterations: 30 },
  );

  seed = 0;
  bench(
    "hidden-reuse",
    () => {
      hiddenReuseWork(seed++);
    },
    { warmupIterations: 5, iterations: 30 },
  );
});
