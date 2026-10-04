// Shared ESLint flat config (ADR-0012): typescript-eslint, import-x (no-cycle), react-hooks, jsx-a11y, prettier.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @param {{ react?: boolean, tsconfigRootDir: string }} options */
export function config({ react = false, tsconfigRootDir }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', '**/*.gen.ts', 'drizzle/**', 'public/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node, ...(react ? globals.browser : {}) },
        parserOptions: { tsconfigRootDir },
      },
      plugins: { 'import-x': importX },
      rules: {
        'import-x/no-cycle': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
        'no-console': ['error', { allow: ['warn', 'error'] }],
      },
      settings: {
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: `${tsconfigRootDir}/tsconfig.json` }),
        ],
      },
    },
    ...(react
      ? [
          jsxA11y.flatConfigs.recommended,
          {
            plugins: { 'react-hooks': reactHooks },
            rules: {
              'react-hooks/rules-of-hooks': 'error',
              'react-hooks/exhaustive-deps': 'warn',
            },
          },
        ]
      : []),
    prettier,
  );
}
