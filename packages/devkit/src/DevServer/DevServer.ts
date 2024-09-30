import { resolve } from 'node:path';
import type { DevServerTypes } from './Types';
import { fork, type ChildProcess } from 'node:child_process';
import consola from 'consola';

/**
 * Creates a development server for the given application.
 * @param {DevServerTypes.App} app - The application instance.
 * @returns {DevServerTypes.DevServer} The development server instance.
 */
export function createDevServer(app: DevServerTypes.App): DevServerTypes.DevServer {
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