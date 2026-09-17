import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ColabVideoService Unit Tests',
    environment: 'node',
    globals: true,
    include: ['electron/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
    coverage: {
      provider: 'v8',
      include: ['electron/services/colabVideoService.ts'],
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
