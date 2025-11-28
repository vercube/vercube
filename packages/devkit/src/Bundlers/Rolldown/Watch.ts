import { watch as nodeWatch } from 'chokidar';
import { resolve } from 'pathe';
import { watch as rolldownWatch } from 'rolldown';
import { getRolldownConfig } from './Config';
import type { DevKitTypes } from '../../Types/DevKitTypes';
import type { DotenvOptions } from 'c12';

/**
 * Creates a watcher for rolldown
 * @param {DevKitTypes.App} app - The application instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/build/dev.ts
 */
export async function watch(app: DevKitTypes.App): Promise<void> {
  const bundlerConfig = await getRolldownConfig(app.config.build);
  const watcher = rolldownWatch({
    ...bundlerConfig,
    onwarn: () => {},
  });

  // Additional files to watch
  const filesToWatch = [
    // env file
    resolve(app.config.build?.root ?? process.cwd(), (app.config?.c12?.dotenv as DotenvOptions)?.fileName?.[0] ?? '.env'),
    // vercube config file
    resolve(app.config.build?.root ?? process.cwd(), 'vercube.config.ts'),
    // tsconfig file
    resolve(app.config.build?.root ?? process.cwd(), app.config.build?.tsconfig ?? 'tsconfig.json'),
  ];

  const extraWatcher = nodeWatch(filesToWatch, {
    ignoreInitial: true,
  });

  extraWatcher.on('all', () => {
    // trigger a restart when these files change
    app.hooks.callHook('bundler-watch:restart');
  });

  // Clean up the chokidar watcher when bundler watcher closes
  watcher.on('close', () => {
    extraWatcher.close();
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
        console.error(event.error);
        app.hooks.callHook('bundler-watch:error', event.error);
      }
    }
  });
}
