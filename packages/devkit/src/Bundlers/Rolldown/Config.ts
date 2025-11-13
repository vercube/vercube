import { builtinModules } from 'node:module';
import { resolve } from 'pathe';
import UnpluginIsolatedDecl from 'unplugin-isolated-decl/rolldown';
import type { ConfigTypes } from '@vercube/core';
import type { RolldownOptions } from 'rolldown';

/**
 * Generates a Rolldown configuration based on the provided build options.
 *
 * @param {ConfigTypes.BuildOptions} [ctx] - Build configuration options
 * @returns {Promise<RolldownOptions>} A promise that resolves to the Rolldown configuration
 */
export async function getRolldownConfig(ctx?: ConfigTypes.BuildOptions): Promise<RolldownOptions> {
  const root = ctx?.root ?? process.cwd();
  const pkg = (await import(resolve(root, 'package.json'), { with: { type: 'json' } })).default;
  const input = ctx?.entry ?? 'src/index.ts';
  const output = ctx?.output?.dir ?? 'dist';
  const tsconfig = ctx?.tsconfig ?? 'tsconfig.json';
  const dts = ctx?.dts ?? true;
  const customPlugins = ctx?.plugins ?? [];

  const defaultPlugins = [];

  if (dts) {
    defaultPlugins.push(
      UnpluginIsolatedDecl({
        transformer: 'oxc',
        patchCjsDefaultExport: true,
      }),
    );
  }

  return {
    // Define the input options
    input: typeof input === 'string' ? { index: input } : input,

    tsconfig: resolve(root, tsconfig),

    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      ...Object.keys(pkg.dependencies || {}),
      '@vercube/cli',
    ],

    transform: {
      define: {
        ...ctx?.define,
      },
    },

    // Define the output options
    output: {
      dir: resolve(root, output),
      entryFileNames: '[name].mjs',
      format: 'esm',
      exports: 'auto',
      externalLiveBindings: false,
      sourcemap: true,
    },

    onwarn: (warning, warn) => {
      if (!warning.code || !['CIRCULAR_DEPENDENCY'].includes(warning.code)) {
        warn(warning);
      }
    },

    plugins: [...defaultPlugins, ...customPlugins],
  };
}
