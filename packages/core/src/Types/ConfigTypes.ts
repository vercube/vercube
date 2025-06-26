/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { LoggerTypes } from '@vercube/logger'; 
import type { DotenvOptions } from 'c12';
/**
 * Namespace containing configuration type definitions for the Vercube framework.
 */
export namespace ConfigTypes {

  /**
   * Runtime configuration interface that can be modified during application execution.
   */
  export interface RuntimeConfig {
    /**
     * Session configuration options.
     */
    session?: {
      /**
       * The secret used to sign the session ID cookie.
       */
      secret?: string;

      /**
       * The name of the session ID cookie.
       */
      name?: string;

      /**
       * The duration of time for the session to be active.
       */
      duration?: number;
    }
  }

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
    entry?: string;

    /**
     * Defines to pass to the build.
     */
    define?: Record<string, string>;

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
    },

    /**
     * The bundler to use for the application build.
     */
    bundler?: 'rolldown';
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
    https?: false | {
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
    }
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
     * Additional configuration for c12.
     */
    c12?: {
      /**
       * Configuration for dotenv.
       */
      dotenv?: boolean | DotenvOptions;
    }
  }
}