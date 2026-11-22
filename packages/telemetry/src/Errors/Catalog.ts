import { defineErrorCatalog } from '@vercube/di';

/**
 * The errors of `@vercube/telemetry`.
 */
export const TelemetryErrors = defineErrorCatalog('VERCUBE_TELEMETRY', {
  OTLP_TRACE_EXPORTER_MISSING: {
    message:
      'An OTLP endpoint is configured but @opentelemetry/exporter-trace-otlp-http is not installed. ' +
      'Install it, or pass your own `exporter` to startNodeTelemetry().',
    why: 'Traces are set to be sent to an OTLP endpoint, and the exporter that sends them is an optional peer dependency that could not be imported.',
    fix: 'Install the exporter with `pnpm add @opentelemetry/exporter-trace-otlp-http`, or pass a span exporter of your own in the `exporter` option of `startNodeTelemetry()`.',
  },
  OTLP_METRIC_EXPORTER_MISSING: {
    message:
      'An OTLP endpoint is configured for metrics but @opentelemetry/exporter-metrics-otlp-http is not installed. ' +
      'Install it, or pass your own reader to addMetricReader().',
    why: 'Metrics are set to be sent to an OTLP endpoint, and the exporter that sends them is an optional peer dependency that could not be imported.',
    fix: 'Install the exporter with `pnpm add @opentelemetry/exporter-metrics-otlp-http`, or register a metric reader of your own with `addMetricReader()`.',
  },
});
