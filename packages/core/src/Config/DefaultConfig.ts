import { ConfigTypes } from '../Types/ConfigTypes';
import generateRandomHash from '../Utils/InternalUtils';

/**
 * Default configuration for the Vercube application.
 * This configuration serves as the base settings and can be overridden by user configuration.
 */
export const defaultConfig: ConfigTypes.Config = {
  /**
   * Default logging level set to 'debug' for detailed logging output
   */
  logLevel: 'debug',

  /**
   * Production mode disabled by default
   */
  production: false,

  /**
   * Development mode disabled by default
   */
  dev: false,

  /**
   * Build configuration settings
   */
  build: {
    /**
     * Default root directory for the application
     */
    root: process.cwd(),

    /**
     * Default entry point for the application
     */
    entry: 'src/index.ts',

    /**
     * Default output settings
     */
    output: {
      /**
       * Main output directory for build artifacts
       */
      dir: 'dist',
      /**
       * Directory for public assets
       */
      publicDir: 'public',
    },

    /**
     * Default bundler set to 'rolldown'
     */
    bundler: 'rolldown',
  },

  /**
   * Server configuration settings
   */
  server: {
    /**
     * Default runtime environment set to 'node'
     */
    runtime: 'node',
    /**
     * Default host for local development
     */
    host: 'localhost',
    /**
     * Default port for the development server
     */
    port: 3000,
    /**
     * HTTPS disabled by default
     */
    https: false,
    /**
     * Default static file directories
     */
    staticDirs: [
      'public',
    ],
  },

  /**
   * Empty experimental features configuration
   */
  experimental: {},

  /**
   * Empty runtime configuration
   */
  runtime: {
    /**
     * Session configuration options.
     */
    session: {
      /**
       * The secret used to sign the session ID cookie.
       */
      secret: process.env?.SECRET ?? generateRandomHash(),

      /**
       * The name of the session ID cookie.
       */
      name: 'vercube_session',

      /**
       * The duration of time for the session to be active.
       */
      duration: 60 * 60 * 24 * 7, // 7 days as default
    },
  },
};