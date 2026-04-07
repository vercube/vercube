// Drivers
export { EvlogProvider } from './Drivers/EvlogProvider';
export type { EvlogProviderOptions } from './Drivers/EvlogProvider';

// Middleware
export { EvlogMiddleware, EVLOG_REQUEST_LOGGER_KEY, EVLOG_FINISH_KEY } from './Middleware/EvlogMiddleware';

// Plugin
export { EvlogPlugin } from './Plugin/EvlogPlugin';

// Types
export type { EvlogTypes } from './Types/EvlogTypes';

// Re-export evlog core utilities for convenience
export { createLogger, createRequestLogger, initLogger, log } from 'evlog';
export type { RequestLogger, LoggerConfig, WideEvent, DrainContext, EnrichContext } from 'evlog';

// Re-export toolkit utilities
export { createMiddlewareLogger, createLoggerStorage, extractSafeHeaders, extractSafeNodeHeaders } from 'evlog/toolkit';
