import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{js,mjs,ts}'], languageOptions: { globals: globals.node } },
  { files: ['**/*.d.ts'], rules: { '@typescript-eslint/triple-slash-reference': 'off' } },
];
