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
];
