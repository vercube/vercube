/**
 * Attribute keys used by Vercube's instrumentation.
 *
 * The HTTP names are the stable OpenTelemetry semantic conventions. They are
 * written out here as plain constants rather than imported from
 * `@opentelemetry/semantic-conventions` so that installing `@vercube/telemetry`
 * does not drag in a second package for a handful of strings; the values are
 * asserted against the published conventions in the package tests.
 */

/** HTTP request method, e.g. `GET`. */
export const HTTP_REQUEST_METHOD = 'http.request.method';

/** Matched route template, e.g. `/users/:id`. */
export const HTTP_ROUTE = 'http.route';

/** HTTP response status code. */
export const HTTP_RESPONSE_STATUS_CODE = 'http.response.status_code';

/** Request path, without the query string. */
export const URL_PATH = 'url.path';

/** Query string, without the leading `?`. */
export const URL_QUERY = 'url.query';

/** URL scheme, `http` or `https`. */
export const URL_SCHEME = 'url.scheme';

/** Host the request was addressed to. */
export const SERVER_ADDRESS = 'server.address';

/** Port the request was addressed to. */
export const SERVER_PORT = 'server.port';

/** Raw `User-Agent` header. */
export const USER_AGENT_ORIGINAL = 'user_agent.original';

/** Class name or type of the error that made the operation fail. */
export const ERROR_TYPE = 'error.type';

/** Controller class that owns the matched handler. */
export const VERCUBE_CONTROLLER = 'vercube.controller';

/** Handler method that served the request. */
export const VERCUBE_HANDLER = 'vercube.handler';

/** Middleware class name. */
export const VERCUBE_MIDDLEWARE = 'vercube.middleware';

/** Middleware phase, `before` or `after`. */
export const VERCUBE_MIDDLEWARE_PHASE = 'vercube.middleware.phase';

/** Dependency-injection service key. */
export const VERCUBE_DI_KEY = 'vercube.di.key';

/** Dependency-injection binding kind: `singleton`, `transient` or `instance`. */
export const VERCUBE_DI_KIND = 'vercube.di.kind';

/** Whether the route was served by the allocation-free fast path. */
export const VERCUBE_ROUTE_SIMPLE = 'vercube.route.simple';

/** Instrumentation scope name reported for framework spans. */
export const INSTRUMENTATION_SCOPE = '@vercube/telemetry';
