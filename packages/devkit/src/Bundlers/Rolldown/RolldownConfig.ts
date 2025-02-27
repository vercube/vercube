import type { RolldownOptions } from 'rolldown';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { BuilderTypes } from '../../Support/BuilderTypes';
import UnpluginIsolatedDecl from 'unplugin-isolated-decl/rolldown';

export const getBuildOptions = async (ctx: BuilderTypes.BuildOptions): Promise<RolldownOptions> => {

  const pkg = (await import(resolve(process.cwd(), 'package.json'), { with: { type: 'json' } })).default;

  return {
    // Define the input options
    input: {
      index: ctx.input,
    },

    resolve: {
      tsconfigFilename: resolve(process.cwd(), 'tsconfig.json'),
    },

    external: [
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
      ...Object.keys(pkg.dependencies || {}),
      '@vercube/cli',
    ],

    // Define the output options
    output: {
      dir: resolve(process.cwd(), 'dist'),
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

    plugins: [
      UnpluginIsolatedDecl({
        transformer: 'oxc',
        patchCjsDefaultExport: true,
      }),
    ],
  };
};