import { defineConfig } from 'tsdown';
// @ts-expect-error - allowImportingTsExtensions is enabled in tsconfig.json TSDown does not support it
import defaultConfig from '../../tsdown.config.ts';

// Build the plugin entry plus the runtime files loaded by the dev worker.
export default defineConfig({
  ...defaultConfig,
  entry: ['./src/index.ts', './src/runtime/**/*.ts'],
});
