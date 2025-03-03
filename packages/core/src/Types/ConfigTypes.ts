/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { LoggerTypes } from '@vercube/logger';
 
/**
 * Namespace containing configuration type definitions for the Vercube framework.
 */
export namespace ConfigTypes {

  /**
   * Runtime configuration interface that can be modified during application execution.
   */
  export interface RuntimeConfig {
    // add runtime config here
  }

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
     * Array of directories to serve static files from.
     */
    staticDirs?: string[];
  }
 
  /**
   * Main configuration interface for the Vercube application.
   */
  export interface Config {
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
    runtime?: RuntimeConfig;

    /**
     * Experimental features configuration.
     */
    experimental?: ExperimentalOptions;

    /**
     * Build configuration options.
     * This property is only used when using vercube cli.
     */
    build?: BuildOptions;
  }
}