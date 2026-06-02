import type { LoggerConfig, LogLevel } from 'evlog';

/**
 * Types for the evlog-backed Vercube logger.
 *
 * @see https://evlog.dev
 */
export namespace LoggerTypes {
  /**
   * Supported severity levels, aligned with evlog.
   * Order: debug < info < warn < error.
   */
  export type Level = LogLevel;

  /**
   * Any value accepted by the logger methods.
   */
  export type Arg = unknown;

  /**
   * Structured context merged into emitted (wide) events.
   */
  export type Context = Record<string, unknown>;

  /**
   * Logger configuration.
   *
   * Mirrors evlog's {@link LoggerConfig} and adds `logLevel` as a framework-level
   * alias for evlog's `minLevel`.
   */
  export interface Options extends LoggerConfig {
    /**
     * Minimum severity for the simple log API.
     * Alias for evlog's `minLevel`; takes precedence when both are provided.
     */
    logLevel?: Level;
  }
}
