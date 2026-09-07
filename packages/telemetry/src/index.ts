/**
 * The application-facing entry point: the DI token and the plugin.
 *
 * Everything else the package publishes lives on a subpath of its own, so an
 * import says what it reaches for and the framework's internals are not part of
 * the public surface:
 *
 * - `@vercube/telemetry/api` - the OpenTelemetry API
 * - `@vercube/telemetry/attributes` - span and metric attribute keys
 * - `@vercube/telemetry/instrument` - the toolkit for instrumenting a library
 * - `@vercube/telemetry/sdk` - tracer and meter provider wiring
 * - `@vercube/telemetry/otlp` - OTLP serializers and exporters
 * - `@vercube/telemetry/testing` - in-memory providers for tests
 */
export { Telemetry } from './Common/Telemetry';
export { TelemetryPlugin } from './Plugins/TelemetryPlugin';
