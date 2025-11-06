import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    exclude: [...configDefaults.exclude, 'the-path-season-1-nft/tests/**', 'the-path-season-1-nft/node_modules/**'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
});
