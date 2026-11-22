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
  playground: { enabled: true, exclude: [] },
};

/** Cookie the UI uses to carry the access token after the first page load. */
export const DEVTOOLS_TOKEN_COOKIE = 'vercube_devtools_token';

/**
 * Header every state-changing devtools request must carry. A browser cannot
 * add it to a cross-site request without a CORS preflight.
 */
export const DEVTOOLS_REQUEST_HEADER = 'x-devtools-request';

/**
 * Header carried by every request the route playground sends. Its value is the
 * trace id the playground chose for the request, which is what lets the UI
 * find the request, its logs and its trace afterwards.
 */
export const DEVTOOLS_PLAYGROUND_HEADER = 'x-devtools-playground';

/**
 * Header naming the request headers of a playground request that hold
 * credentials, comma separated. Devtools withholds their values from
 * everything it serves, whatever their names look like.
 */
export const DEVTOOLS_PLAYGROUND_SECRETS_HEADER = 'x-devtools-playground-redact';

/** Span attribute devtools adds to the server span of a playground request. */
export const DEVTOOLS_PLAYGROUND_ATTRIBUTE = 'vercube.devtools.playground';

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
