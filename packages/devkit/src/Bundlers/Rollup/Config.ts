import type { ConfigTypes } from '@vercube/core';
import type { RollupOptions } from 'rollup';
import { resolve } from 'pathe';
import RollupTypescriptPlugin from '@rollup/plugin-typescript';
import RollupPluginCommonJS from '@rollup/plugin-commonjs';
import RollupPluginNodeResolve from '@rollup/plugin-node-resolve';
import { DEFAULT_EXTENSIONS } from './Utils/Utils';
import { RollupEsbuildPlugin } from './Plugins/EsbuildPlugin';

/**
 * Generates a Rollup configuration based on the provided build options.
 * 
 * @param {ConfigTypes.BuildOptions} [ctx] - Build configuration options
 * @returns {Promise<RollupOptions>} A promise that resolves to the Rollup configuration
 */
export async function getRollupConfig(ctx?: ConfigTypes.BuildOptions): Promise<RollupOptions> {
  const root = ctx?.root ?? process.cwd();
  const input = ctx?.entry ?? 'src/index.ts';
  const output = ctx?.output?.dir ?? 'dist';

  return {
    // Define the input options
    input: {
      index: input,
    },

    // Define the output options
    output: {
      dir: resolve(root, output),
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
        tsconfig: resolve(root, 'tsconfig.json'),
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