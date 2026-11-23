import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
