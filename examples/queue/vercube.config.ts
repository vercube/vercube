import { defineConfig } from '@vercube/core';
import { DevtoolsPlugin } from '@vercube/devtools';

export default defineConfig({
  logLevel: 'debug',
  plugins: [DevtoolsPlugin],
  server: {
    port: 3000,
  },
});
