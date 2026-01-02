import { defineConfig } from 'tsdown';
// @ts-expect-error - allowImportingTsExtensions is enabled in tsconfig.json TSDown does not support it
import { transformExports } from '../../scripts/utils.ts';
// @ts-expect-error - allowImportingTsExtensions is enabled in tsconfig.json TSDown does not support it
import defaultConfig from '../../tsdown.config.ts';

// return config for tsdown
export default defineConfig({
  ...defaultConfig,
  exports: {
    customExports: (exports) => {
      const transformed = transformExports(exports);

      for (const [key, value] of Object.entries(exports)) {
        if (key.startsWith('./adapters/')) {
          transformed[key.replace('./adapters/', './')] = value;
          delete transformed[key];
        }
      }

      return transformed;
    },
  },
  entry: ['./src/index.ts', './src/Adapters/**/index.ts'],
});
