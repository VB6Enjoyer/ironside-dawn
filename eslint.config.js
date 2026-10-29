import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),

  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },

  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/host/**/*.ts'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['eslint.config.js', 'vite.config.ts', 'tools/**/*.ts', '**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },

  // The simulation must stay headless and deterministic (ARCHITECTURE.md §1, §4.1).
  {
    files: ['src/sim/**/*.ts', 'src/content/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'The simulation must not depend on the UI framework.',
            },
            {
              group: ['**/ui', '**/ui/**', '**/host', '**/host/**'],
              message: 'The simulation must not import from the UI or the host.',
            },
            {
              group: ['node:*'],
              message: 'The simulation must run in a browser worker; no Node built-ins.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded Rng (src/sim/core/rng.ts) so worlds stay reproducible.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Use world time, not wall-clock time.' },
        { name: 'performance', message: 'Use world time, not wall-clock time.' },
        { name: 'crypto', message: 'Use the seeded Rng so worlds stay reproducible.' },
      ],
    },
  },
]);
