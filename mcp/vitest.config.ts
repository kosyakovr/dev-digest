import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      // The contract-pin test reads the server's vendored contracts directly,
      // without needing server/node_modules (mirrors reviewer-core/vitest.config.ts).
      { find: '@devdigest/shared', replacement: path.resolve(__dirname, '../server/src/vendor/shared') },
      // Pin zod to this package's single copy so the pin test's schemas and
      // the server contracts' schemas are instances of the same zod.
      { find: /^zod$/, replacement: path.resolve(__dirname, 'node_modules/zod/index.js') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
