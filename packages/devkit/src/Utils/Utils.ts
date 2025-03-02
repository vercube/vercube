/* eslint-disable unicorn/no-useless-switch-case */
import type { DevKitTypes } from '../Support/DevKitTypes';
import { build as rolldownBuild } from '../Bundlers/Rolldown/Build';
import { watch as rolldownWatch } from '../Bundlers/Rolldown/Watch';
import { build as rollupBuild } from '../Bundlers/Rollup/Build';
import { watch as rollupWatch } from '../Bundlers/Rollup/Watch';

/**
 * Returns the appropriate build function based on the specified bundler
 * @param {string} bundler - The bundler to use ('rollup' or 'rolldown')
 * @returns {DevKitTypes.BuildFunc} The build function for the specified bundler
 */
export function getBuildFunc(bundler: string): DevKitTypes.BuildFunc {
  switch (bundler) {
    case 'rollup': { 
      return rollupBuild;
    }
    case 'rolldown':
    default: {
      return rolldownBuild;
    }
  }
}

/**
 * Returns the appropriate watch function based on the specified bundler
 * @param {string} bundler - The bundler to use ('rollup' or 'rolldown')
 * @returns {DevKitTypes.WatchFunc} The watch function for the specified bundler
 */
export function getWatchFunc(bundler: string): DevKitTypes.WatchFunc {
  switch (bundler) {
    case 'rollup': {
      return rollupWatch;
    }
    case 'rolldown':
    default: {
      return rolldownWatch;
    }
  }
}