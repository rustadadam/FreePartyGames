import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { outDir: 'dist', target: 'es2020' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
