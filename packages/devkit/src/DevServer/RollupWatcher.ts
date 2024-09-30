/* eslint-disable default-case */
import consola from 'consola';
import { watch as RollupWatch } from 'rollup';
import { getRollupOptions } from '../Builder/Rollup/Config/RollupConfig';
import type { DevServerTypes } from './Types';

/**
 * Creates a Rollup watcher for the given application.
 * @param {DevServerTypes.App} app - The application instance.
 */
export function createRollupWatcher(app: DevServerTypes.App): void {
  const rollupConfig = getRollupOptions({
    input: 'src/index.ts',
    output: 'dist',
  });

  const watcher = RollupWatch({
    ...rollupConfig,
    cache: true,
    onwarn: () => {},
  });
  let start: number;

  watcher.on('event', (event) => {
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