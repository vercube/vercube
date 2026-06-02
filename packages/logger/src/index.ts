// Common
export * from './Common/Logger';

// Services
export * from './Service/BaseLogger';

// Types
export * from './Types/LoggerTypes';

// Re-exported evlog primitives for advanced / wide-event usage.
// @see https://evlog.dev
export {
  log,
  initLogger,
  createLogger,
  createRequestLogger,
  createError,
  parseError,
  EvlogError,
  defineError,
  defineErrorCatalog,
} from 'evlog';

export type {
  Log,
  RequestLogger,
  RequestLoggerOptions,
  LoggerConfig,
  LogLevel,
  WideEvent,
  EnvironmentContext,
  SamplingConfig,
  RedactConfig,
  DrainContext,
  DrainFn,
  ErrorOptions,
} from 'evlog';
