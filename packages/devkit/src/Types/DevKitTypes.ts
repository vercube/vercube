import { type Worker as _Worker } from 'node:worker_threads';
import type { ConfigTypes, IntrospectionTypes } from '@vercube/core';
import type { Hookable } from 'hookable';

export namespace DevKitTypes {
  export type BuildFunc = (ctx?: ConfigTypes.BuildOptions) => void | Promise<void>;
  export type WatchFunc = (app?: App) => void | Promise<void>;

  type HookResult = void | Promise<void>;

  export interface Hooks {
    'dev:reload': () => HookResult;
    'bundler-watch:init': () => HookResult;
    'bundler-watch:start': () => HookResult;
    'bundler-watch:end': () => HookResult;
    'bundler-watch:restart': () => HookResult;
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
  /** One section as `inspect()` returns it. */
  export interface InspectedSection {
    id: string;
    title: string;
    revision: string | number;
    data: unknown;
  }

  /** Options for one `typegen()` run. */
  export interface TypegenRunOptions {
    /** Routes to use instead of running the built application. */
    routes?: IntrospectionTypes.RouteDescription[];
    /** The discovery section that goes with `routes`. */
    discovery?: IntrospectionTypes.DiscoveryDescription | null;
    /** Write the file even when the project does not depend on `@vercube/client`. */
    force?: boolean;
  }

  /** What `typegen()` did. */
  export interface TypegenResult {
    /** Absolute path of the route map. */
    file: string;
    /** False when the content was already up to date. */
    written: boolean;
    /** Number of route registrations read. */
    routes: number;
    /** Routes left out, with the reason. */
    skipped: { id: string; reason: string }[];
  }

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
