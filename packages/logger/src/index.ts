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
  definePlugin,
  drainPlugin,
  enricherPlugin,
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
  EnrichContext,
  ErrorOptions,
  EvlogPlugin,
} from 'evlog';
