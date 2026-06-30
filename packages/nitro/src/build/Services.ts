/**
 * Service scanning has moved to the shared `@vercube/scan` package. This module
 * re-exports the service helpers to preserve the existing `@vercube/nitro`
 * import paths.
 */
export { extractServices, transformService, SERVICE_IMPORT_SOURCE } from '@vercube/scan';
export type { ServiceInfo } from '@vercube/scan';
