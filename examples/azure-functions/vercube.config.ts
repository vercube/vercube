import { defineConfig } from '@vercube/core';

export default defineConfig({
  logLevel: 'debug',
  server: {
    port: 3000,
  },

  build: {
    entry: ['./src/index.ts', './src/functions/httpTrigger.ts'],
  },
});
