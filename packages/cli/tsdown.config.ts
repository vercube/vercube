import { defineConfig } from 'tsdown';
// @ts-expect-error - allowImportingTsExtensions is enabled in tsconfig.json TSDown does not support it
import defaultConfig from '../../tsdown.config.ts';

export default defineConfig({
  ...defaultConfig,
  entry: ['./src/index.ts', './src/toolkit.ts'],
});
