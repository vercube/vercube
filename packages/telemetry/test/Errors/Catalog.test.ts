import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it, vi } from 'vitest';
import { createOtlpMetricExporter, createOtlpTraceExporter } from '../../src/Otlp';

// an optional peer dependency that is not installed fails to import
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => {
  throw new Error('Cannot find package');
});

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => {
  throw new Error('Cannot find package');
});

describe('TelemetryErrors', () => {
  it('describes a missing trace exporter', async () => {
    const error = await createOtlpTraceExporter({ endpoint: 'http://localhost:4318' }).catch((error_: unknown) => error_);

    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe(
      'An OTLP endpoint is configured but @opentelemetry/exporter-trace-otlp-http is not installed. Install it, or pass your own `exporter` to startNodeTelemetry().',
    );
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_TELEMETRY_OTLP_TRACE_EXPORTER_MISSING',
      fix: expect.stringContaining('pnpm add @opentelemetry/exporter-trace-otlp-http'),
    });
  });

  it('describes a missing metric exporter', async () => {
    const error = await createOtlpMetricExporter({ endpoint: 'http://localhost:4318' }).catch((error_: unknown) => error_);

    expect((error as Error).constructor).toBe(Error);
    expect((error as Error).message).toBe(
      'An OTLP endpoint is configured for metrics but @opentelemetry/exporter-metrics-otlp-http is not installed. Install it, or pass your own reader to addMetricReader().',
    );
    expect(getErrorGuidance(error)).toMatchObject({
      code: 'VERCUBE_TELEMETRY_OTLP_METRIC_EXPORTER_MISSING',
      fix: expect.stringContaining('pnpm add @opentelemetry/exporter-metrics-otlp-http'),
    });
  });
});
