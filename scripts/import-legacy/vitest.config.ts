import { defineConfig } from 'vitest/config';

// The integration tests in run.test.ts share the local database, so files must not run in parallel.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
