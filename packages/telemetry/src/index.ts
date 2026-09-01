// Public API
export * from './Common/Attributes';
export * from './Common/Propagation';
export * from './Common/SpanUtils';
export * from './Common/Telemetry';
export * from './Context/VercubeContextManager';
export * from './Hooks/CoreTelemetryHooks';
export * from './Hooks/TraceCorrelation';
export * from './Plugins/TelemetryPlugin';
export * from './Service/OtelTelemetry';

// Re-exported so applications can annotate spans without adding a direct
// dependency on the OpenTelemetry API package.
export {
  context,
  metrics,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
  ValueType,
} from '@opentelemetry/api';
export type {
  Attributes,
  Context,
  Counter,
  Histogram,
  Link,
  Meter,
  Span,
  SpanContext,
  SpanOptions,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
  Tracer,
  UpDownCounter,
} from '@opentelemetry/api';
