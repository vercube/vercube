import type { RouteInfo, ServiceInfo } from '@vercube/scan';
import type { RunnerManager } from 'env-runner';

/**
 * The Vite environment name under which the Vercube server runs.
 */
export const VERCUBE_ENV = 'vercube';

/**
 * User-facing configuration for the Vercube Vite plugin.
 */
export interface VercubePluginConfig {
  /**
   * Project root. Defaults to Vite's resolved `root`.
   */
  rootDir?: string;

  /**
   * Directories (relative to `rootDir`) whose file trees are scanned for
   * controllers, `@Injectable` services and middleware. Defaults to `['src']`.
   */
  scanDirs?: string[];

  /**
   * Path (relative to `rootDir`) to a module whose default export is
   * `(app: App) => void | Promise<void>`. Runs after auto-discovered classes are
   * bound but before the container queue is flushed — use it to mount storage,
   * bind tokens, configure the logger, or register plugins that auto-discovery
   * cannot infer.
   */
  setupFile?: string;

  /**
   * The runner used to execute server code in the dev environment.
   * Defaults to `node-worker`.
   */
  runner?: string;
}

/**
 * Internal plugin context shared across the plugin's sub-plugins and hooks.
 */
export interface VercubePluginContext {
  /** The resolved user configuration. */
  pluginConfig: VercubePluginConfig;
  /** Absolute project root. */
  root: string;
  /** Absolute directories scanned for decorated classes. */
  scanDirs: string[];
  /** Absolute path to the setup file, if configured. */
  setupFile?: string;
  /** Absolute path of the generated server entry module loaded by the worker. */
  serverEntry: string;
  /** Whether the plugin is running in dev (serve) mode. */
  dev: boolean;
  /** Whether the project has a frontend (`index.html`) the built server should serve. */
  hasClient: boolean;
  /** Discovered `@Controller` classes (every controller, including WebSocket-only ones). */
  controllers: ServiceInfo[];
  /** Discovered HTTP routes (method + path), used to decide which requests Vercube handles. */
  routes: RouteInfo[];
  /** Discovered injectable services (deduplicated against controllers). */
  services: ServiceInfo[];
  /** The env-runner manager driving the dev worker. */
  _envRunner?: RunnerManager;
  /** Guards concurrent env-runner initialization. */
  _initPromise?: Promise<RunnerManager>;
  /** Maps each Vite environment name to the entry the worker should load. */
  _viteEnvs?: Map<string, string>;
}

declare module 'vite' {
  interface UserConfig {
    /** Vercube plugin configuration, mergeable from `vite.config.ts`. */
    vercube?: VercubePluginConfig;
  }
}
