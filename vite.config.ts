/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: './',
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['src/test/setup.ts'],
          css: true,
        },
      },
      {
        test: {
          name: 'mcp',
          include: ['mcp/src/**/*.test.ts'],
          environment: 'node',
          globals: true,
          globalSetup: ['mcp/test/global-setup.ts'],
        },
      },
    ],
  },
});
