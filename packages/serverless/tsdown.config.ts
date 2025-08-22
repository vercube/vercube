import { defineConfig } from 'tsdown';
import defaultConfig from '../../tsdown.config';
import { transformExports } from '../../scripts/utils';

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
