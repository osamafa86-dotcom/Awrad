import config from '@awrad/config/eslint';

export default [
  ...config,
  // Deno-only Edge Function entries (see tsconfig.json); their handlers are linted.
  { ignores: ['functions/*/index.ts', 'functions/_shared/auth.ts'] },
];
