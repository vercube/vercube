import { defineConfig } from '@vercube/core';

export default defineConfig({
  logLevel: 'info',
  build: {
    // a Worker bundle is deployed, not imported: it needs no declarations
    dts: false,
  },
  server: {
    port: 3000,
  },
});
