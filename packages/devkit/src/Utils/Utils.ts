import {
  type RollupWatcher,
  type RollupOptions,
  watch as RollupWatch,
  rollup } from 'rollup';
import {
  type RolldownWatcher,
  type RolldownOptions,
  watch as RolldownWatch,
  rolldown } from 'rolldown';
import { getBuildOptions as getRollupBuildOptions } from '../Bundlers/Rollup/Config/RollupConfig';
import { getBuildOptions as getRolldownBuild } from '../Bundlers/Rolldown/RolldownConfig';
import { type ConfigTypes } from '@vercube/core';

/**
 * Returns the bundler config for the given bundler.
 * @param bundler - The bundler to get the config for.
 * @returns The bundler config.
 */
export async function getBundlerConfig(config: ConfigTypes.Config): Promise<RolldownOptions | RollupOptions> {
  const input = config.build?.entry ?? 'src/index.ts';
  const output = config.build?.output?.dir ?? 'dist';
  const bundler = config.build?.bundler ?? 'rolldown';

  // for now return always rolldown
  if (bundler === 'rolldown') {
    return getRolldownBuild({ input, output });
  }

  return getRollupBuildOptions({ input, output });
}

/**
 * Returns the watcher for the given bundler.
 * @param bundler - The bundler to get the watcher for.
 * @returns The watcher.
 */
export async function getWatcher(config: ConfigTypes.Config): Promise<RollupWatcher | RolldownWatcher> {
  const bundlerConfig = await getBundlerConfig(config);
  const bundler = config.build?.bundler ?? 'rolldown';

  // for now return always rolldown
  if (bundler === 'rolldown') {
    return RolldownWatch({
      ...(bundlerConfig as ReturnType<typeof getRolldownBuild>),
      onwarn: () => {},
    });
  }
  
  return RollupWatch({
    ...(bundlerConfig as ReturnType<typeof getRollupBuildOptions>),
    cache: true,
    onwarn: () => {},
  });

}

export function getBundler(bundler: 'rollup' | 'rolldown'): typeof rollup | typeof rolldown {
  switch (bundler) {
    case 'rollup': {
      return rollup;
    }
    default: {
      return rolldown;
    }
  }
}