// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['lib/**', 'dist/**', 'node_modules/**', 'build/**', 'coverage/**'],
  },

  js.configs.recommended,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
        ecmaVersion: 2024,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // TypeScript-specific (belt-and-suspenders against tsconfig)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // Defer unused-var detection to TS plugin
      'no-unused-vars': 'off',

      // TypeScript handles undefined variable detection; base no-undef false-positives on globals (console, process, setTimeout, setImmediate)
      'no-undef': 'off',
      'no-unused-vars': 'off',

      // Prettier as a lint rule (run last; combined with eslint-config-prettier below)
      'prettier/prettier': 'error',
    },
  },

  // Disable all formatting rules conflicting with Prettier — MUST be last.
  prettierConfig,
];
