import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
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
            exclude: ['src/main/**/*.d.ts', 'src/main/**/*.swift'],
            // Soft floors to catch large regressions; raise over time.
            thresholds: {
              lines: 60,
              functions: 55,
              branches: 45,
              statements: 60,
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
          name: 'domain',
          environment: 'node',
          include: ['tests/domain/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/domain/**/*.ts'],
            exclude: ['src/domain/**/*.d.ts'],
            thresholds: {
              lines: 80,
              functions: 80,
              branches: 70,
              statements: 80,
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
