import { defineConfig } from '@playwright/test';

// Web smoke test on the static export (Task 2.8). The export runs in preview mode (PREVIEW-2:
// EXPO_PUBLIC_PREVIEW=1, fake data client, /__preview/* routes). CI exports in its own step and sets
// E2E_SKIP_EXPORT=1; locally the web server command exports first.
const PORT = 4173;
const serve = `pnpm exec serve dist -l ${PORT} --no-port-switching`;
const command = process.env.E2E_SKIP_EXPORT === '1' ? serve : `pnpm exec expo export -p web && ${serve}`;

const phone = { viewport: { width: 390, height: 844 }, locale: 'ar' } as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    trace: 'off',
    // Optional local override, e.g. PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium.
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [
    { name: 'mobile-light', use: { ...phone, colorScheme: 'light' } },
    { name: 'mobile-dark', use: { ...phone, colorScheme: 'dark' } },
  ],
  webServer: {
    command,
    url: `http://127.0.0.1:${PORT}/__preview/today`,
    env: { EXPO_PUBLIC_PREVIEW: '1', EXPO_NO_TELEMETRY: '1' },
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
