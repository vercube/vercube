import { defineConfig, withPluginOptions } from '@vercube/core';
import { HealthPlugin } from './src/Plugins/HealthPlugin';

/**
 * The HTTP route and the `plugin-info` CLI command both come from `HealthPlugin`
 * (no `setup()` callback in `createApp` required).
 *
 * `withPluginOptions` infers `HealthPluginOptions` from the class - no `satisfies` / `typeof` needed.
 */
export default defineConfig({
  logLevel: 'debug',
  server: {
    port: 3000,
  },
  plugins: [withPluginOptions(HealthPlugin, { externals: ['some-native-module'] })],
});
