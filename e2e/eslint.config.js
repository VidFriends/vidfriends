import { config } from '@vidfriends/config/eslint';

export default [
  ...config({ tsconfigRootDir: import.meta.dirname }),
  // Load-test scripts: k6 runtime globals; seed progress goes to stdout.
  {
    files: ['load/**'],
    languageOptions: { globals: { __ENV: 'readonly', __VU: 'readonly', open: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
];
