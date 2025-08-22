import consola from 'consola';
import type { DevKitTypes } from '../Types/DevKitTypes';
import { getWatchFunc } from '../Utils/Utils';

/**
 * Creates a watcher for the given application.
 * @param {DevKitTypes.App} app - The application instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/build/dev.ts
 */
export async function watch(app: DevKitTypes.App): Promise<void> {
  // get bundler "watch" func based on config
  const bundler = app?.config?.build?.bundler ?? 'rolldown';
  const watcher = getWatchFunc(bundler);
  let start: number;

  // set hooks listeners
  app.hooks.hook('bundler-watch:start', () => {
    console.clear();
    consola.info({ tag: 'build', message: 'Start building...' });
    start = Date.now();
  });

  app.hooks.hook('bundler-watch:end', () => {
    consola.success({
      tag: 'build',
      message: `Built in ${Date.now() - start}ms`,
    });
    app.hooks.callHook('dev:reload');
  });

  app.hooks.hook('bundler-watch:error', (error: Error) => {
    console.log(error);
  });

  await watcher(app);
}
