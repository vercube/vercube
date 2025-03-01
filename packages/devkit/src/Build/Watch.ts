 
import consola from 'consola';
import type { DevKitTypes } from '../Support/DevKitTypes';
import { getWatcher } from '../Utils/Utils';

/**
 * Creates a watcher for the given application.
 * @param {DevKitTypes.App} app - The application instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/build/dev.ts
 */
export async function watch(app: DevKitTypes.App): Promise<void> {
  const watcher = await getWatcher(app.config);
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