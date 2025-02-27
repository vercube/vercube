import { resolve } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import consola from 'consola';
import type { DevKitTypes } from '../Support/DevKitTypes';

/**
 * Creates a development server for the given application.
 * @param {DevKitTypes.App} app - The application instance.
 * @returns {DevKitTypes.DevServer} The development server instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/dev-server/server.ts
 */
export function createDevServer(app: DevKitTypes.App): DevKitTypes.DevServer {
  const forkEntry = resolve(process.cwd(), 'dist/index.mjs');
  let reloadPromise: Promise<void> | undefined;
  let currentFork: ChildProcess | undefined;

  /**
   * Reloads the fork by killing the old one and creating a new one.
   * @returns {Promise<void>} A promise that resolves when the fork is reloaded.
   */
  async function _reload() {
    // Kill old worker
    const oldFork = currentFork;
    currentFork = undefined;

    oldFork?.kill();
    // Create a new worker
    currentFork = fork(forkEntry);

    if (!currentFork) {
      return;
    }
  }

  /**
   * Reloads the fork.
   * @returns {Promise<void>} A promise that resolves when the worker is reloaded.
   */
  const reload = () => {
    reloadPromise = _reload()
      .then(() => {
        consola.success({ tag: 'worker', message: 'Worker reloaded successfully' });
      })
      .catch((error) => {
        consola.error({ tag: 'worker', message: 'Failed to reload worker', error });
      })
      .finally(() => {
        reloadPromise = undefined;
      });
    return reloadPromise;
  };

  // Hook the reload function to the 'dev:reload' event
  app.hooks.hook('dev:reload', reload);

  return {
    app,
    reload,
  };
}