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
   * Supplies context computed at emit time.
   *
   * Unlike {@link Logger.set}, which stores a fixed object, a provider is
   * called for every event. That is what lets ambient state - the active trace
   * and span, for instance - reach log lines without every call site passing it
   * along. Returning `undefined` contributes nothing.
   */
  export type ContextProvider = () => Context | undefined;

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
