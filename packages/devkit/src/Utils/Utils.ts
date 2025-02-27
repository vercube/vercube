import { watch as RollupWatch, type RollupWatcher, type RollupOptions } from 'rollup';
import { watch as RolldownWatch, type RolldownWatcher, type RolldownOptions } from 'rolldown';
import { getBuildOptions as getRollupBuildOptions } from '../Bundlers/Rollup/Config/RollupConfig';
import { getBuildOptions as getRolldownBuild } from '../Bundlers/Rolldown/RolldownConfig';

/**
 * Returns the bundler config for the given bundler.
 * @param bundler - The bundler to get the config for.
 * @returns The bundler config.
 */
export async function getBundlerConfig(bundler: 'rollup' | 'rolldown'): Promise<RolldownOptions | RollupOptions> {
  // for now return always rolldown
  if (bundler === 'rolldown') {
    return getRolldownBuild({
      input:'src/index.ts',
      output: 'dist',
    });
  }

  return getRollupBuildOptions({
    input:'src/index.ts',
    output: 'dist',
  });
}

/**
 * Returns the watcher for the given bundler.
 * @param bundler - The bundler to get the watcher for.
 * @returns The watcher.
 */
export async function getWatcher(bundler: 'rollup' | 'rolldown'): Promise<RollupWatcher | RolldownWatcher> {
  const config = await getBundlerConfig(bundler);

  // for now return always rolldown
  if (bundler === 'rolldown') {
    return RolldownWatch({
      ...(config as ReturnType<typeof getRolldownBuild>),
      onwarn: () => {},
    });
  }
  
  return RollupWatch({
    ...(config as ReturnType<typeof getRollupBuildOptions>),
    cache: true,
    onwarn: () => {},
  });

}