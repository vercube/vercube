import { ConfigTypes } from '../Types/ConfigTypes';

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
     * Default entry point for the application
     */
    entry: 'src/index.ts',
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
  },

  /**
   * Server configuration settings
   */
  server: {
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
  runtime: {},
};