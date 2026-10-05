import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // DB test files share one test database and reset it between cases, so they must not run in parallel.
    fileParallelism: false,
  },
});
