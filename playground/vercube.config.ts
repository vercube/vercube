import { defineConfig } from '@vercube/core';
import { AppTypes } from './src/Types/AppTypes';

export default defineConfig<AppTypes.Config>({
  logLevel: 'debug',

  server: {
    port: 3001,
  },

  websockets: true,

  runtime: {
    something: {
      enabled: true,
    },
  },

});