/**
 * Middleware scanning has moved to the shared `@vercube/scan` package. This
 * module re-exports the middleware helpers to preserve the existing
 * `@vercube/nitro` import paths.
 */
export { extractMiddlewares, transformMiddleware, MIDDLEWARE_IMPORT_SOURCE } from '@vercube/scan';
export type { MiddlewareInfo } from '@vercube/scan';
