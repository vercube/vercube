import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildConfig } from 'unbuild';
import TypescriptPlugin from '@rollup/plugin-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const BaseBuildOptions: BuildConfig = {
  declaration: true,
  clean: false,
  entries: [
    'src/index',
  ],
  rollup: {
    emitCJS: true,
    cjsBridge: true,
    output: {
      format: 'cjs',
    },
  },
  failOnWarn: false,
  hooks: {
    'rollup:options': (ctx, options) => {
      options.plugins.push(TypescriptPlugin({
        tsconfig: resolve(__dirname, '../../tsconfig.json'),
      }));
    },
  },
};