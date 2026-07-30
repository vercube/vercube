import { defineConfig } from '@vercube/core';
import { DevtoolsPlugin } from '@vercube/devtools';
import type { AppTypes } from './src/Types/AppTypes';

export default defineConfig<AppTypes.Config>({
  logLevel: 'debug',

  plugins: [DevtoolsPlugin],

  server: {
    port: 3001,
  },

  runtime: {
    something: {
      enabled: true,
    },
  },
});
