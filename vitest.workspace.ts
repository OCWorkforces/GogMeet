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
    ],
  },
});
