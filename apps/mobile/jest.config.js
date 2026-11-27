/** @type {import('jest').Config} */
module.exports = {
  // jest-expo's default transformIgnorePatterns already transform everything under node_modules/.pnpm.
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: {
    // The package's "react-native" exports are .mjs files that Jest does not transform; use its CJS build.
    '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
};
