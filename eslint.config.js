// @ts-check
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";

/**
 * Clean Architecture layer elements.
 * More-specific patterns first; `main-rest` is the catch-all for remaining main code.
 * @see docs/clean-architecture-refactor-plan.md — Import boundary enforcement
 */
const boundaryElements = [
  { type: "domain", pattern: "src/domain/**" },
  { type: "shared", pattern: "src/shared/**" },
  { type: "application", pattern: "src/main/application/**" },
  { type: "facades", pattern: "src/main/facades/**" },
  { type: "infrastructure", pattern: "src/main/infrastructure/**" },
  { type: "composition", pattern: "src/main/composition/**" },
  { type: "scheduler", pattern: "src/main/scheduler/**" },
  { type: "ipc", pattern: "src/main/ipc-handlers/**" },
  { type: "swift", pattern: "src/main/swift/**" },
  { type: "calendar", pattern: "src/main/calendar/**" },
  { type: "preload", pattern: "src/preload/**" },
  { type: "renderer", pattern: "src/renderer/**" },
  { type: "main-rest", pattern: "src/main/**" },
];

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["lib/**", "dist/**", "node_modules/**", "build/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    // Implementation sources only — ambient `*.d.ts` (e.g. renderer env typing preload) excluded from layer edges
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.d.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        sourceType: "module",
        ecmaVersion: 2024,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
      boundaries,
    },
    settings: {
      "boundaries/elements": boundaryElements,
      // Resolve TS sources that use `.js` import specifiers (verbatimModuleSyntax).
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
        node: {
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // TypeScript-specific (belt-and-suspenders against tsconfig)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Defer unused-var detection to TS plugin
      "no-unused-vars": "off",

      // TypeScript handles undefined variable detection; base no-undef false-positives on globals
      "no-undef": "off",

      // Prettier as a lint rule (run last; combined with eslint-config-prettier below)
      "prettier/prettier": "error",

      // ── Clean Architecture layer boundaries (warn; escalate later) ──
      // Escalate domain/application purity to error when ready.
      // Sentrux is secondary/local — see .sentrux/rules.toml header + CA plan.
      "boundaries/dependencies": [
        "warn",
        {
          default: "allow",
          policies: [
            // Pure domain: only other domain modules (no process code)
            {
              from: { element: { type: "domain" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "shared",
                        "application",
                        "facades",
                        "infrastructure",
                        "composition",
                        "scheduler",
                        "ipc",
                        "swift",
                        "calendar",
                        "preload",
                        "renderer",
                        "main-rest",
                      ],
                    },
                  },
                },
              },
            },
            // Shared: process isolation (may import domain)
            {
              from: { element: { type: "shared" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "application",
                        "facades",
                        "infrastructure",
                        "composition",
                        "scheduler",
                        "ipc",
                        "swift",
                        "calendar",
                        "preload",
                        "renderer",
                        "main-rest",
                      ],
                    },
                  },
                },
              },
            },
            // Renderer: never import main process modules
            {
              from: { element: { type: "renderer" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "application",
                        "facades",
                        "infrastructure",
                        "composition",
                        "scheduler",
                        "ipc",
                        "swift",
                        "calendar",
                        "main-rest",
                        "preload",
                      ],
                    },
                  },
                },
              },
            },
            // Preload: only shared/domain (not main logic)
            {
              from: { element: { type: "preload" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "application",
                        "facades",
                        "infrastructure",
                        "composition",
                        "scheduler",
                        "ipc",
                        "swift",
                        "calendar",
                        "main-rest",
                        "renderer",
                      ],
                    },
                  },
                },
              },
            },
            // Swift leaf: no application orchestration modules
            {
              from: { element: { type: "swift" } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "facades",
                        "scheduler",
                        "ipc",
                        "application",
                        "composition",
                      ],
                    },
                  },
                },
              },
            },
            // Facades must not import Swift (calendar-watcher still violates)
            {
              from: { element: { type: "facades" } },
              disallow: {
                to: { element: { type: "swift" } },
              },
            },
          ],
        },
      ],
    },
  },

  // Pure domain: no Electron / Node I/O (enforced as error once domain has code)
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "Pure domain must not import Electron.",
            },
          ],
          patterns: [
            {
              group: ["node:*", "fs", "fs/*", "path", "path/*", "child_process", "os", "crypto"],
              message: "Pure domain must not import Node I/O / process modules.",
            },
          ],
        },
      ],
    },
  },


  // Application layer: no Electron / Node I/O (ports only)
  {
    files: ["src/main/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "Application layer must not import Electron; use ports.",
            },
          ],
          patterns: [
            {
              group: ["node:fs", "node:fs/*", "fs", "fs/*", "child_process", "node:child_process"],
              message: "Application layer must not import Node I/O; use infrastructure adapters.",
            },
          ],
        },
      ],
    },
  },

  // Disable all formatting rules conflicting with Prettier — MUST be last.
  prettierConfig,
];
