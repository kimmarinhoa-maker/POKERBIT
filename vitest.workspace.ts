import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/importer/vitest.config.js',
  'packages/engine/vitest.config.js',
  'apps/api/vitest.config.ts',
]);
