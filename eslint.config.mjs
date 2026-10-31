import { defineConfig } from 'eslint/config';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

// Lints tests only: it enforces the mechanical test-reliability rules.
export default defineConfig(
  {
    files: ['tests/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Give the test its own fresh state instead of random input.' },
        { object: 'it', property: 'only', message: 'Remove .only before committing.' },
        { object: 'test', property: 'only', message: 'Remove .only before committing.' },
        { object: 'describe', property: 'only', message: 'Remove .only before committing.' },
      ],
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['tests/e2e/**/*.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      // Specs that need native tools skip through the shared guard in tests/support/frame-review-dependencies.ts.
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      'playwright/no-conditional-in-test': 'error',
      // Shared assertion helpers are named expectSomething.
      'playwright/expect-expect': ['warn', { assertFunctionPatterns: ['^expect[A-Z]'] }],
    },
  },
);
