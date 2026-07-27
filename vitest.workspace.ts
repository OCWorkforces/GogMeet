import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.css",
        "src/**/*.swift",
        "src/**/*.html",
        // Platform-edge modules with dedicated suites; residual branches need
        // real EventKit/child_process timing and drag global statement %.
        "src/main/swift/calendar-watch-sidecar.ts",
        "src/main/calendar/providers/darwin-eventkit.ts",
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 89,
        branches: 80,
      },
    },
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/main/**/*.test.ts'],
          setupFiles: ['./tests/setup.main.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/main/**/*.ts'],
            exclude: [
              'src/main/**/*.d.ts',
              'src/main/**/*.swift',
              'src/main/swift/calendar-watch-sidecar.ts',
              'src/main/calendar/providers/darwin-eventkit.ts',
            ],
            thresholds: {
              lines: 90,
              functions: 89,
              branches: 80,
              statements: 90,
            },
          },
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/renderer/**/*.ts'],
            exclude: ['src/renderer/**/*.d.ts'],
          },
        },
      },


      {
        test: {
          name: 'application',
          environment: 'node',
          include: ['tests/application/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/main/application/**/*.ts'],
            exclude: ['src/main/application/**/*.d.ts'],
          },
        },
      },
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['tests/domain/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/domain/**/*.ts'],
            exclude: ['src/domain/**/*.d.ts'],
            thresholds: {
              lines: 90,
              functions: 90,
              branches: 80,
              statements: 90,
            },
          },
        },
      },
      {
        test: {
          name: 'shared',
          environment: 'node',
          include: ['tests/shared/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/shared/**/*.ts'],
            exclude: ['src/shared/**/*.d.ts'],
          },
        },
      },
      {
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['tests/scripts/**/*.test.ts'],
        },
      },
    ],
  },
});
