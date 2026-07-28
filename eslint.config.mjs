import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**', '**/.vercel/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    settings: { next: { rootDir: ['apps/website/', 'apps/admin/'] } },
    rules: {
      ...nextPlugin.configs['core-web-vitals'].rules,
      // This monorepo uses the App Router only; there is no Pages directory to resolve.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  { files: ['**/*.{js,mjs,ts}'], languageOptions: { globals: globals.node } },
  { files: ['**/*.d.ts'], rules: { '@typescript-eslint/triple-slash-reference': 'off' } },
];
