import type { Hookable } from 'hookable';
import { type Worker as _Worker } from 'node:worker_threads';

export namespace DevKitTypes {

  type HookResult = void | Promise<void>;

  export interface Hooks {
    'dev:reload': () => HookResult;
    'build:before-start': () => HookResult;
  }

  /**
   * Represents an application with hooks.
   */
  export interface App {
    /**
     * The hooks associated with the application.
     */
    hooks: Hookable<Hooks>;
  }

  /**
   * Represents a development server.
   */
  export interface DevServer {
    /**
     * The application associated with the development server.
     */
    app: App;

    /**
     * Reloads the development server.
     * @returns {Promise<void>} A promise that resolves when the server is reloaded.
     */
    reload: () => Promise<void>;
  }

  /**
   * Represents a worker instance.
   */
  export interface Worker {
    /**
     * The worker thread instance.
     */
    worker: _Worker | null;

    /**
     * The address information of the worker.
     */
    address: {
      host: string;
      port: number;
      socketPath?: string
    };
  }

}