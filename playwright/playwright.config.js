// @ts-check
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.OO_BASE_URL || 'http://localhost:5080';
const slowMo = Number(process.env.OO_SLOWMO || '0');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // alert/pipeline flows touch shared org-level state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { slowMo },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
