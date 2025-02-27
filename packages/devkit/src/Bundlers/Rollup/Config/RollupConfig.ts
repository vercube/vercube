import type { RollupOptions } from 'rollup';
import { resolve } from 'node:path';
import RollupTypescriptPlugin from '@rollup/plugin-typescript';
import RollupPluginCommonJS from '@rollup/plugin-commonjs';
import RollupPluginNodeResolve from '@rollup/plugin-node-resolve';
import { DEFAULT_EXTENSIONS } from '../Utils/Utils';
import { RollupEsbuildPlugin } from '../Plugins/EsbuildPlugin';
import { BuilderTypes } from 'packages/devkit/src/Support/BuilderTypes';

export function getBuildOptions(ctx: BuilderTypes.BuildOptions): RollupOptions {

  return {
    // Define the input options
    input: {
      index: ctx.input,
    },

    // Define the output options
    output: {
      dir: resolve(process.cwd(), 'dist'),
      entryFileNames: '[name].mjs',
      format: 'esm',
      exports: 'auto',
      generatedCode: {
        constBindings: true,
      },
      externalLiveBindings: false,
      freeze: false,
      sourcemap: false,
      importAttributesKey: 'with',
    },

    // Define the warning handler
    onwarn(warning, rollupWarn) {
      if (!warning.code || !['CIRCULAR_DEPENDENCY'].includes(warning.code)) {
        rollupWarn(warning);
      }
    },

    // Define the plugins
    plugins: [
      RollupPluginCommonJS({
        extensions: DEFAULT_EXTENSIONS,
        ignoreTryCatch: true,
      }),
      RollupTypescriptPlugin({
        tsconfig: resolve(process.cwd(), 'tsconfig.json'),
      }),
      RollupPluginNodeResolve({
        extensions: DEFAULT_EXTENSIONS,
      }),
      RollupEsbuildPlugin({
        target: 'esnext',
        sourcemap: false,
      }),
    ],

  };

}