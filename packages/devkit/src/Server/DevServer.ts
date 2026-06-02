import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import consola from 'consola';
import type { DevKitTypes } from '../Types/DevKitTypes';
import type { ChildProcess } from 'node:child_process';

/**
 * Creates a development server for the given application.
 * @param {DevKitTypes.App} app - The application instance.
 * @returns {DevKitTypes.DevServer} The development server instance.
 * This file is highly inspired by Nitro
 * @see https://github.com/nitrojs/nitro/blob/v2/src/core/dev-server/server.ts
 */
export function createDevServer(app: DevKitTypes.App): DevKitTypes.DevServer {
  const forkEntry = resolve(process.cwd(), app.config.build?.output?.dir ?? 'dist', 'index.mjs');
  let reloadPromise: Promise<void> | undefined;
  let currentFork: ChildProcess | undefined;

  /**
   * Terminates a worker and resolves only once it has fully exited, so the
   * resources it owns (the HTTP port and any message-queue consumers) are
   * released before a replacement is spawned.
   *
   * A graceful SIGTERM may not stop a worker that holds long-lived handles -
   * e.g. an open message-queue connection keeps the event loop alive - so fall
   * back to SIGKILL after a short grace period.
   * @param {ChildProcess} worker - The worker process to terminate.
   * @returns {Promise<void>} A promise that resolves when the worker has exited.
   */
  function killWorker(worker: ChildProcess): Promise<void> {
    // Already exited.
    if (worker.exitCode !== null || worker.signalCode !== null) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => worker.kill('SIGKILL'), 1000);
      worker.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      worker.kill('SIGTERM');
    });
  }

  /**
   * Reloads the fork by killing the old one and creating a new one.
   * @returns {Promise<void>} A promise that resolves when the fork is reloaded.
   */
  async function _reload() {
    // Kill old worker and wait for it to fully exit before spawning a new one.
    // Spawning the replacement too early lets it inherit a port the dying
    // worker still holds (EADDRINUSE), or run alongside a zombie that keeps
    // consuming queue messages with stale code.
    const oldFork = currentFork;
    currentFork = undefined;

    if (oldFork) {
      await killWorker(oldFork);
    }

    // Create a new worker
    currentFork = fork(forkEntry);
  }

  /**
   * Reloads the fork.
   *
   * Reloads are serialized: overlapping file-change events chain onto the
   * previous reload instead of running concurrently, which would otherwise
   * spawn a second worker while another is still shutting down.
   * @returns {Promise<void>} A promise that resolves when the worker is reloaded.
   */
  const reload = () => {
    reloadPromise = (reloadPromise ?? Promise.resolve())
      .then(() => _reload())
      .then(() => {
        consola.success({
          tag: 'worker',
          message: 'Worker reloaded successfully',
        });
      })
      .catch((error) => {
        consola.error({
          tag: 'worker',
          message: 'Failed to reload worker',
          error,
        });
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
