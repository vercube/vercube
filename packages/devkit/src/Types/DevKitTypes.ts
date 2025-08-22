import { ConfigTypes } from '@vercube/core';
import type { Hookable } from 'hookable';
import { type Worker as _Worker } from 'node:worker_threads';

export namespace DevKitTypes {
  export type BuildFunc = (
    ctx?: ConfigTypes.BuildOptions,
  ) => void | Promise<void>;
  export type WatchFunc = (app?: App) => void | Promise<void>;

  type HookResult = void | Promise<void>;

  export interface Hooks {
    'dev:reload': () => HookResult;
    'bundler-watch:init': () => HookResult;
    'bundler-watch:start': () => HookResult;
    'bundler-watch:end': () => HookResult;
    'bundler-watch:error': (_error: Error) => HookResult;
  }

  /**
   * Represents an application with hooks.
   */
  export interface App {
    /**
     * The hooks associated with the application.
     */
    hooks: Hookable<Hooks>;

    /**
     * The configuration object for the application.
     */
    config: ConfigTypes.Config;
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
      socketPath?: string;
    };
  }
}
