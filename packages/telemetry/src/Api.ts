/**
 * The OpenTelemetry API, re-exported in full.
 *
 * This subpath is the framework's single point of contact with
 * `@opentelemetry/api`: every other `@vercube/*` package imports the API from
 * here rather than depending on it directly, so the version in use is decided
 * in exactly one `package.json`.
 *
 * ```ts
 * import { SpanKind, trace } from '@vercube/telemetry/api';
 * ```
 *
 * Re-exported wholesale rather than as a curated list. A hand-picked slice is a
 * permanent maintenance debt - the previous one was already missing
 * `Exception`, `createTraceState` and `isSpanContextValid` - and the API package
 * is small, tree-shakeable and a no-op until a provider is registered.
 */
export * from '@opentelemetry/api';
