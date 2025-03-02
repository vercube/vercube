import { watch as rollupWatch } from 'rollup';
import type { DevKitTypes } from '../../Support/DevKitTypes';
import { getRollupConfig } from './Config';

/**
 * Creates a watcher for rollup
 * @param {DevKitTypes.App} app - The application instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/build/dev.ts
 */
export async function watch(app: DevKitTypes.App): Promise<void> {
  const bundlerConfig = await getRollupConfig(app.config.build);
  const watcher = rollupWatch({
    ...bundlerConfig,
      onwarn: () => {},
  });

  watcher.on('event', (event: any) => {
    switch (event.code) {
      // The watcher is (re)starting
      case 'START': {
        app.hooks.callHook('bundler-watch:init');
        return;
      }

      // Building an individual bundle
      case 'BUNDLE_START': {
        app.hooks.callHook('bundler-watch:start');
        return;
      }

      // Finished building all bundles
      case 'END': {
        app.hooks.callHook('bundler-watch:end');
        return;
      }

      // Encountered an error while bundling
      case 'ERROR': {
        app.hooks.callHook('bundler-watch:error', event.error);
      }
    }
  });
};