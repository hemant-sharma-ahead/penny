import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'node_modules', '**/node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier
    ],
    languageOptions: {
      globals: globals.browser
    },
    rules: {
      'no-console': 'warn',

      // Architecture boundaries — prevent accidental PII leaks and coupling.
      // Enforced per-package now: these rules apply repo-wide by default, then get switched off in
      // the one file/directory that's allowed to break them (see the two overrides below).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@anthropic-ai/*'],
              message: 'Anthropic SDK may only be imported from packages/core/src/core/ai-safety/anthropicClient.ts'
            },
            {
              group: ['dexie'],
              message: 'Dexie may only be imported from packages/core/src/core/db/'
            }
          ]
        }
      ]
    }
  },
  {
    // Allow Dexie in the db core layer
    files: ['packages/core/src/core/db/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    // Allow Anthropic SDK in the ai-safety layer
    files: ['packages/core/src/core/ai-safety/anthropicClient.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    // Provider files intentionally export both a Provider component and a hook
    files: [
      'apps/web-legacy/src/context/*.tsx',
      'packages/core/src/core/sync/SyncProvider.tsx',
      'apps/mobile/src/theme/ThemeProvider.tsx'
    ],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  }
]);
