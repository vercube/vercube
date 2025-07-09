import { defineConfig } from 'tsdown';
import defaultConfig from '../../tsdown.config';

// return config for tsdown
export default defineConfig({
  ...defaultConfig,
  entry: [
    './src/index.ts',
    './src/Storages/**/*.ts',
  ],
});