import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { outDir: 'dist', target: 'es2020' },
  // `npm run dev` + `npm run worker` (port 8787): Vite serves the UI with HMR and forwards
  // the API and sockets to wrangler. /dev/kit.html is a kit preview (dev only, not built).
  server: {
    proxy: {
      '^/api/': 'http://localhost:8787',
      '^/ws/': { target: 'ws://localhost:8787', ws: true },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
