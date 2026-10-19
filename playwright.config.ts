import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', fullyParallel: true, timeout: 30_000,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js apps/web --host 127.0.0.1 --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: false },
});
