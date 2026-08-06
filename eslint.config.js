// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    /**
     * The golden rule (02-arquitectura §3.1): @nanonogram/core imports nothing.
     * No packages, no node builtins, no DOM. Only relative paths inside core.
     *
     * This is enforced here rather than trusted, because it is the property the
     * Go server and the native Anbernic client depend on, and it is very easy
     * to break by reflex with a single convenient import.
     *
     * The import half of the rule is checked in
     * `packages/core/test/purity.test.ts`, which reads the source directly —
     * more legible than fighting minimatch, and it also checks that core's
     * package.json declares no runtime dependencies.
     */
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'fetch',
        'XMLHttpRequest',
        'performance',
        'setTimeout',
        'setInterval',
        'requestAnimationFrame',
      ],
    },
  },
);
