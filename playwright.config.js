const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const appPath = 'file://' + path.join(__dirname, 'index.html').replace(/\\/g, '/');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: appPath,
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
