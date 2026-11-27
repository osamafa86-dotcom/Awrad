import config from '@awrad/config/eslint';

export default [
  ...config,
  { ignores: ['next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
];
