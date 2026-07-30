import { defineConfig } from "vitest/config";

/**
 * Isolated bench config — not part of vitest.workspace.ts so normal CI / coverage
 * never runs microbenchmarks as product gates.
 */
export default defineConfig({
  test: {
    include: ["tests/bench/**/*.bench.ts"],
    environment: "node",
    // Vitest bench mode is enabled via `vitest bench`
  },
});
