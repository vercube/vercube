/* eslint-disable no-constant-condition */
import consola from 'consola';
import { watch as RollupWatch, type RollupWatcher } from 'rollup';
import { watch as RolldownWatch, type RolldownWatcher } from 'rolldown';
import { getBuildOptions as getRollupBuildOptions } from '../Builder/Rollup/Config/RollupConfig';
import { getBuildOptions as getRolldownBuild } from '../Builder/Rolldown/RolldownConfig';
import type { DevServerTypes } from './Types';

/**
 * Creates a watcher for the given application.
 * @param {DevServerTypes.App} app - The application instance.
 */
export async function createWatcher(app: DevServerTypes.App): Promise<void> {
  const watcher = await getWatcher();
  let start: number;

  watcher.on('event', (event: any) => {
    switch (event.code) {
      // The watcher is (re)starting
      case 'START': {
        return;
      }

      // Building an individual bundle
      case 'BUNDLE_START': {
        console.clear();
        consola.info({ tag: 'build', message: 'Start building...' });
        start = Date.now();
        return;
      }

      // Finished building all bundles
      case 'END': {
        consola.success({ tag: 'build', message: `Built in ${Date.now() - start}ms`});
        app.hooks.callHook('dev:reload');
        return;
      }

      // Encountered an error while bundling
      case 'ERROR': {
        console.log(event.error);
      }
    }
  });
};

async function getWatcher(): Promise<RollupWatcher | RolldownWatcher> {
  // for now return always rolldown
  if (true) {
    return RolldownWatch({
      ...(await getRolldownBuild({
        input:'src/index.ts',
        output: 'dist',
      })),
      onwarn: () => {},
    });
  }
  
  return RollupWatch({
    ...getRollupBuildOptions({
      input: 'src/index.ts',
      output: 'dist',
    }),
    cache: true,
    onwarn: () => {},
  });

}