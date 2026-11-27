import { defineConfig } from '@playwright/test';

// Admin e2e (Ruling E2E-1). Tier (a) runs everywhere against `next build && next start`: with nothing
// listening at the default Supabase URL every request counts as signed out. Tier (b) (signed-in
// scenarios) needs a Supabase stack: E2E_SUPABASE_URL + E2E_SERVICE_ROLE_KEY, and the app built
// against that stack through NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (CI job
// `admin-e2e`). E2E_SKIP_BUILD=1 reuses an existing `.next` build.
const PORT = 3100;
const start = `pnpm exec next start -p ${PORT}`;
const command = process.env.E2E_SKIP_BUILD === '1' ? start : `pnpm exec next build && ${start}`;
const signedInTier = Boolean(process.env.E2E_SUPABASE_URL && process.env.E2E_SERVICE_ROLE_KEY);

export default defineConfig({
  testDir: './e2e',
  // Seeds the tier (b) users; a no-op without a Supabase stack.
  globalSetup: './e2e/seed.ts',
  fullyParallel: true,
  // why: each sign-in issues a fresh one-time code that replaces the user's previous one, so the
  // signed-in tier must not sign the same user in from two workers at once.
  workers: signedInTier ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    locale: 'ar',
    trace: 'off',
    // Optional local override, e.g. PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium.
    launchOptions: process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command,
    url: `http://127.0.0.1:${PORT}/login`,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'e2e-dummy-anon-key',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
