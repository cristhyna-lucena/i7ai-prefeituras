import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/visual',
  timeout: 30000,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder:'output/verification/sgdm/playwright-report', open:'never' }]],
  outputDir: 'output/verification/sgdm/test-results',
  use: { baseURL:'http://127.0.0.1:5180', browserName:'chromium', channel:'msedge', headless:true, screenshot:'only-on-failure' },
  webServer: [
    { command:'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort', url:'http://127.0.0.1:5180', reuseExistingServer:true },
  ],
});
