import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    viewport: { width: 1920, height: 1080 },
    browserName: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  timeout: 120000,
});
