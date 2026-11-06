import { defineConfig } from '@vercube/core';

export default defineConfig({
  server: {
    port: Number(process.env.PORT ?? 3000),
  },
});
