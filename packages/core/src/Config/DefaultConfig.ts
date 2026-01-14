import generateRandomHash from '../Utils/InternalUtils';
import type { ConfigTypes } from '../Types/ConfigTypes';

/**
 * Gets the session secret from environment or generates one for development.
 * In production, requires the SECRET environment variable to be set.
 * @throws {Error} If in production and SECRET environment variable is not set
 * @returns {string} The session secret
 */
function getSessionSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const envSecret = process.env.SECRET;

  if (isProduction && !envSecret) {
    throw new Error(
      'SESSION SECRET ERROR: In production mode, you must set a strong SECRET environment variable. ' +
        'Using a dynamically generated secret is insecure and will cause session data to be lost on server restart. ' +
        'Please set the SECRET environment variable to a strong, randomly generated string (at least 32 characters). ' +
        'Example: SECRET=your-strong-random-secret-here-at-least-32-chars',
    );
  }

  return envSecret ?? generateRandomHash();
}

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
  production: process.env.NODE_ENV === 'production',

  /**
   * Development mode disabled by default
   */
  dev: process.env.NODE_ENV !== 'production',

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
     * Default static server config
     */
    static: {
      dirs: ['public'],
    },
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
       * In production, this MUST be set via the SECRET environment variable.
       */
      secret: getSessionSecret(),

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
