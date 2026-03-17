import { builtinModules } from 'node:module';
import { defu } from 'defu';
import { resolve } from 'pathe';
import UnpluginIsolatedDecl from 'unplugin-isolated-decl/rolldown';
import type { ConfigTypes } from '@vercube/core';
import type { RolldownOptions } from 'rolldown';

/**
 * Generates a Rolldown configuration based on the provided build options.
 *
 * Builds a base config from `ctx` (entry, output, tsconfig, plugins, defines, etc.) and then
 * deep-merges it with `ctx.rolldownConfig` using `defu`, so user-supplied options take precedence
 * over the defaults. The `input`, `output`, and `onwarn` fields are always controlled internally
 * and cannot be overridden via `rolldownConfig`.
 *
 * @param ctx - Build configuration options. When omitted, sensible defaults are used
 *              (entry: `src/index.ts`, output: `dist`, tsconfig: `tsconfig.json`, dts: `true`).
 * @returns A promise that resolves to the merged Rolldown configuration.
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

  const baseOptions: RolldownOptions = {
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

  return defu(ctx?.rolldownConfig ?? {}, baseOptions);
}
