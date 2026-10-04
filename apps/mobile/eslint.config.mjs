import { config } from '@vidfriends/config/eslint';

export default [
  { ignores: ['.expo/**', 'android/**', 'ios/**', 'expo-env.d.ts'] },
  ...config({ native: true, tsconfigRootDir: import.meta.dirname }),
  { files: ['*.config.js'], languageOptions: { sourceType: 'commonjs' } },
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
      },
    },
  },
];
