import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', '**/.worktrees/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'junit.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov', 'clover'],
      exclude: ['node_modules/', 'src/test/setup.ts'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
    },
  },
});
