// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'playwright-report/**',
      'allure-results/**',
      'allure-report/**',
      'test-results/**',
      'node_modules/**',
      'api-client/schema.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tests/**/*.ts'],
    plugins: { playwright },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Real waits are tied to a DOM or network signal, never an arbitrary clock.
      'playwright/no-wait-for-timeout': 'error',
      // { force: true } bypasses Playwright's actionability checks — a classic
      // flakiness smell that hides a real timing or locator problem instead of
      // fixing it.
      'playwright/no-force-option': 'error',
      'playwright/no-nth-methods': 'error',
    },
  },
  {
    // Plain Node scripts, not covered by the TypeScript config's implicit globals.
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        AbortSignal: 'readonly',
        URL: 'readonly',
      },
    },
  },
  prettier,
);
