import { defineConfig } from 'vitest/config';
import path from 'path';

// No UI/component test suite exists yet for this app — all current tests are
// pure-logic tests that live in packages/core/tests. This config is a placeholder
// so `pnpm --filter web-legacy test` succeeds and is ready once component tests
// (e.g. Track 3-equivalent web component tests) are added.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
});
