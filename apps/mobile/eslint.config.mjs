import { config } from '@vidfriends/config/eslint';

export default [
  { ignores: ['.expo/**', 'android/**', 'ios/**', 'expo-env.d.ts'] },
  ...config({ native: true, tsconfigRootDir: import.meta.dirname }),
  {
    files: ['*.config.js', 'plugins/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly' },
    },
  },
  {
    // Maestro scripts run in its GraalJS host with these globals and the flow's env.
    files: ['e2e/scripts/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        http: 'readonly',
        json: 'readonly',
        output: 'writable',
        SERVER_URL: 'readonly',
        TOKEN: 'readonly',
        HANDOFF_CHALLENGE: 'readonly',
        BODY: 'readonly',
      },
    },
  },
];
