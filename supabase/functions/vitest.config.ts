import { defineConfig } from 'vitest/config';

// Edge Function logic (Ruling FN-1): the pure handlers next to each Deno entry, run under Node with
// fake dependencies. The Deno entries (index.ts, _shared/*) run only under the Supabase runtime.
export default defineConfig({
  test: {
    include: ['functions/**/*.test.ts'],
  },
});
