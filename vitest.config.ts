import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      AUTH_TOKEN: 'test-token',
      CLAUDE_CODE_OAUTH_TOKEN: 'test-oauth-token',
    },
  },
});
