import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['tests/setup/vitest.setup.js'],
    pool: 'forks', // avoid thread workers on Windows
    threads: false,
  },
});
