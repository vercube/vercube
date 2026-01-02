import { defineConfig } from 'tsdown';
// @ts-expect-error - allowImportingTsExtensions is enabled in tsconfig.json TSDown does not support it
import defaultConfig from '../../tsdown.config.ts';

// return config for tsdown
export default defineConfig({
  ...defaultConfig,
  entry: ['./src/index.ts', './src/Drivers/**/*.ts'],
});
