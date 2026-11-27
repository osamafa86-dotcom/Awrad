import config from '@awrad/config/eslint';

export default [
  ...config,
  {
    // CommonJS tool configs (Babel, Metro, Tailwind, Jest) must use require().
    files: ['*.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
