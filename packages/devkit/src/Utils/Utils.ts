/* eslint-disable @typescript-eslint/no-unused-vars */
 
import type { DevKitTypes } from '../Support/DevKitTypes';
import { build as rolldownBuild, watch as rolldownWatch } from '../Bundlers/Rolldown';
import { build as rollupBuild, watch as rollupWatch } from '../Bundlers/Rollup';

/**
 * Returns the appropriate build function based on the specified bundler
 * @param {string} bundler - The bundler to use ('rollup' or 'rolldown')
 * @returns {DevKitTypes.BuildFunc} The build function for the specified bundler
 */
export function getBuildFunc(bundler: string): DevKitTypes.BuildFunc {
  return rolldownBuild;
}

/**
 * Returns the appropriate watch function based on the specified bundler
 * @param {string} bundler - The bundler to use ('rollup' or 'rolldown')
 * @returns {DevKitTypes.WatchFunc} The watch function for the specified bundler
 */
export function getWatchFunc(bundler: string): DevKitTypes.WatchFunc {
  return rolldownWatch;
}