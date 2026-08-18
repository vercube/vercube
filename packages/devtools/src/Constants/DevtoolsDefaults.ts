import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/**
 * Default devtools options. `enabled` is derived from the application config.
 */
export const DEFAULT_DEVTOOLS_OPTIONS: Omit<DevtoolsTypes.ResolvedOptions, 'enabled'> = {
  path: '/_devtools',
  token: null,
  maxRequests: 250,
  trackRequests: true,
  captureHeaders: true,
  redactHeaders: [],
  captureBodies: true,
  maxBodyBytes: 64 * 1024,
  captureLogs: true,
  maxLogs: 500,
};

/** Cookie the UI uses to carry the access token after the first page load. */
export const DEVTOOLS_TOKEN_COOKIE = 'vercube_devtools_token';

/**
 * Content types previewed as text. Everything else is recorded as binary.
 */
export const TEXT_CONTENT_TYPES: readonly string[] = [
  'application/json',
  'application/ld+json',
  'application/x-www-form-urlencoded',
  'application/xml',
  'application/javascript',
  'application/graphql',
  'text/',
  '+json',
  '+xml',
];

/**
 * Header names that are never exposed through the devtools API.
 */
export const REDACTED_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-devtools-token',
  'x-csrf-token',
]);

/** Service keys that belong to the framework itself. */
export const FRAMEWORK_SERVICES: ReadonlySet<string> = new Set([
  'App',
  'Container',
  'ErrorHandlerProvider',
  'DefaultErrorHandlerProvider',
  'GlobalMiddlewareRegistry',
  'HooksService',
  'HttpServer',
  'Logger',
  'BaseLogger',
  'MetadataResolver',
  'PluginsRegistry',
  'RequestContext',
  'RequestHandler',
  'Router',
  'RuntimeConfig',
  'StaticRequestHandler',
  'ValidationProvider',
  'StandardSchemaValidationProvider',
]);
