import type { PushMetricExporter } from '@opentelemetry/sdk-metrics';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';

/**
 * OTLP serialization and exporters.
 *
 * The serializers turn collected signals into the OTLP/JSON wire format without
 * sending them anywhere, which is what a consumer that ships its own transport
 * needs - `@vercube/devtools` pushes them over its own bus.
 *
 * The exporters themselves live in optional peer dependencies, because they
 * pull a protobuf stack that an application doing purely local tracing has no
 * use for. They are loaded lazily, so their absence produces an actionable
 * message rather than a module-resolution error at import time.
 */
export { JsonMetricsSerializer, JsonTraceSerializer } from '@opentelemetry/otlp-transformer';

/**
 * Where and how to reach an OTLP/HTTP collector.
 */
export interface OtlpExporterOptions {
  /** OTLP/HTTP endpoint root, e.g. `http://localhost:4318`. */
  endpoint: string;

  /** Headers sent with every request, for authenticated collectors. */
  headers?: Record<string, string>;
}

/**
 * Builds an OTLP/HTTP span exporter.
 *
 * @param options - Endpoint and headers
 * @returns The exporter
 * @throws When `@opentelemetry/exporter-trace-otlp-http` is not installed
 */
export async function createOtlpTraceExporter(options: OtlpExporterOptions): Promise<SpanExporter> {
  let module: { OTLPTraceExporter: new (config: { url: string; headers?: Record<string, string> }) => SpanExporter };

  try {
    module = await import('@opentelemetry/exporter-trace-otlp-http');
  } catch {
    throw new Error(
      'An OTLP endpoint is configured but @opentelemetry/exporter-trace-otlp-http is not installed. ' +
        'Install it, or pass your own `exporter` to startNodeTelemetry().',
    );
  }

  return new module.OTLPTraceExporter({
    url: signalUrl(options.endpoint, 'traces'),
    headers: options.headers,
  });
}

/**
 * Builds an OTLP/HTTP metric exporter.
 *
 * @param options - Endpoint and headers
 * @returns The exporter
 * @throws When `@opentelemetry/exporter-metrics-otlp-http` is not installed
 */
export async function createOtlpMetricExporter(options: OtlpExporterOptions): Promise<PushMetricExporter> {
  let module: {
    OTLPMetricExporter: new (config: { url: string; headers?: Record<string, string> }) => PushMetricExporter;
  };

  try {
    module = await import('@opentelemetry/exporter-metrics-otlp-http');
  } catch {
    throw new Error(
      'An OTLP endpoint is configured for metrics but @opentelemetry/exporter-metrics-otlp-http is not installed. ' +
        'Install it, or pass your own reader to addMetricReader().',
    );
  }

  return new module.OTLPMetricExporter({
    url: signalUrl(options.endpoint, 'metrics'),
    headers: options.headers,
  });
}

/**
 * Joins an endpoint root with an OTLP signal path.
 *
 * @param endpoint - Endpoint root, with or without a trailing slash
 * @param signal - The signal path segment
 * @returns The full URL
 */
function signalUrl(endpoint: string, signal: 'metrics' | 'traces'): string {
  return `${endpoint.replace(/\/$/, '')}/v1/${signal}`;
}
