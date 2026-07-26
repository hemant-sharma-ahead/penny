import { defineConfig } from 'vitest/config';

// Tests for the Cloudflare Workers backend (workers/api-proxy, workers/auth, workers/groups).
// These live at the repo root (not inside a workspace package) since they test plain
// TypeScript modules under workers/ directly via relative imports, independent of the
// packages/core or apps/web-react build graphs.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/worker/**/*.test.ts'],
    passWithNoTests: true
  }
});
