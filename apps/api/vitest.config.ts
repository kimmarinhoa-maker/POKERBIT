import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    name: 'api',
    root: './src',
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../../packages/engine'),
      '@importer': path.resolve(__dirname, '../../packages/importer'),
    },
  },
});
