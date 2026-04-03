/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { LoggerTypes } from '@vercube/logger';
import type { DotenvOptions } from 'c12';
import type { RolldownOptions, RolldownPluginOption } from 'rolldown';

/**
 * Namespace containing configuration type definitions for the Vercube framework.
 */
export namespace ConfigTypes {
  /**
   * Runtime configuration interface that can be modified during application execution.
   */
  export interface RuntimeConfig {}

  /**
   * Helper type to create a fully typed runtime configuration.
   * This allows users to define their own runtime configuration structure
   * while maintaining type safety.
   */
  export type CreateRuntimeConfig<T = Record<string, unknown>> = RuntimeConfig & T;

  /**
   * Configuration options for experimental features.
   * These options may change or be removed in future versions.
   */
  export interface ExperimentalOptions {
    // add experimental options here
  }

  /**
   * Build configuration options for the application.
   */
  export interface BuildOptions {
    /**
     * The root directory for the application.
     */
    root?: string;

    /**
     * The entry point file for the application build.
     */
    entry?: string | string[];

    /**
     * Defines to pass to the build.
     * @deprecated Use `rolldownConfig.transform.define` instead.
     * This field is still applied via the base config but will be removed in a future release.
     */
    define?: Record<string, string>;

    /**
     * Path to the tsconfig file to use for the build.
     */
    tsconfig?: string;

    /**
     * Flag to indicate if declaration files should be generated.
     */
    dts?: boolean;

    /**
     * Additional plugins to use in the bundler.
     * @deprecated Use `rolldownConfig.plugins` instead.
     * This field is still applied via the base config but will be removed in a future release.
     */
    plugins?: RolldownPluginOption[];

    /**
     * Output configuration for build artifacts.
     */
    output?: {
      /**
       * The main output directory for build artifacts.
       */
      dir?: string;

      /**
       * The directory for public/client-side build artifacts.
       */
      publicDir?: string;
    };

    /**
     * The bundler to use for the application build.
     */
    bundler?: 'rolldown';

    /**
     * Additional options passed directly to the rolldown bundler.
     * These options are deep-merged with the base config using `defu`, meaning values provided here take precedence over the defaults.
     * The `input`, `output`, and `onwarn` fields are managed internally and cannot be overridden here.
     */
    rolldownConfig?: Omit<RolldownOptions, 'input' | 'output' | 'onwarn'>;
  }

  /**
   * Server configuration options for the application.
   */
  export interface ServerOptions {
    /**
     * The runtime environment for the application.
     */
    runtime?: 'node' | 'bun' | 'deno';

    /**
     * The hostname to bind the server to.
     */
    host?: string;

    /**
     * The port number to listen on.
     */
    port?: number;

    /**
     * HTTPS configuration options.
     */
    https?:
      | false
      | {
          /**
           * Path to the SSL key file.
           */
          key: string;

          /**
           * Path to the SSL certificate file.
           */
          cert: string;
        };

    /**
     * Static server options
     */
    static?: {
      dirs: string[];
      maxAge?: number;
      immutable?: boolean;
      etag?: boolean;
    };
  }

  /**
   * Main configuration interface for the Vercube application.
   */
  export interface Config<RuntimeUserConfig = Record<string, unknown>> {
    /**
     * Flag indicating if the application is running in production mode.
     */
    production?: boolean;

    /**
     * Flag indicating if the application is running in development mode.
     */
    dev?: boolean;

    /**
     * The logging level for the application.
     */
    logLevel?: LoggerTypes.Level;

    /**
     * Server configuration options.
     */
    server?: ServerOptions;

    /**
     * Runtime configuration for the application.
     */
    runtime?: CreateRuntimeConfig<RuntimeUserConfig>;

    /**
     * Experimental features configuration.
     */
    experimental?: ExperimentalOptions;

    /**
     * Build configuration options.
     * This property is only used when using vercube cli.
     */
    build?: BuildOptions;

    /**
     * CLI configuration options.
     * This property is only used when using vercube cli.
     */
    cli?: {
      /**
       * List of command classes to register in the CLI.
       * Each class must be decorated with @Command.
       */
      commands?: (new () => unknown)[];
    };

    /**
     * Additional configuration for c12.
     */
    c12?: {
      /**
       * Configuration for dotenv.
       */
      dotenv?: boolean | DotenvOptions;
    };
  }
}
