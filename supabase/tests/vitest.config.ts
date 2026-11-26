import { defineConfig } from 'vitest/config';

// All test files share one database, so they must not run in parallel.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
