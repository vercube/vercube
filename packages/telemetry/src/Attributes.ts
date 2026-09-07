/**
 * Span and metric attribute keys.
 *
 * The HTTP names follow the stable OpenTelemetry semantic conventions; the
 * `vercube.*` names are this framework's own. Kept on a subpath of their own so
 * a consumer that only reads spans - `@vercube/devtools` does - does not have
 * to pull in the plugin to name an attribute.
 *
 * ```ts
 * import { HTTP_ROUTE, URL_PATH } from '@vercube/telemetry/attributes';
 * ```
 */
export * from './Common/Attributes';
