/**
 * Route scanning has moved to the shared `@vercube/scan` package so the Nitro
 * and Vite integrations share a single implementation. This module re-exports
 * the route helpers to preserve the existing `@vercube/nitro` import paths.
 */
export { extractRoutes, transformRoute, IMPORT_SOURCE } from '@vercube/scan';
export type { RouteInfo } from '@vercube/scan';
