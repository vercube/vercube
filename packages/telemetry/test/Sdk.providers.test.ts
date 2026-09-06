import { metrics, trace } from '@opentelemetry/api';
import { PeriodicExportingMetricReader, InMemoryMetricExporter, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMetricReader,
  addSpanProcessor,
  CompositeSpanProcessor,
  ensureMeterProvider,
  ensureTracerProvider,
  resetTelemetryProviders,
  startNodeTelemetry,
} from '../src/Sdk';

describe('telemetry sdk providers', () => {
  afterEach(async () => {
    await resetTelemetryProviders();
  });

  it('creates one tracer provider and reuses it', () => {
    expect(ensureTracerProvider()).toBe(ensureTracerProvider());
  });

  it('sends spans to a processor added before the provider existed', () => {
    const exporter = new InMemorySpanExporter();
    addSpanProcessor(new SimpleSpanProcessor(exporter));
    ensureTracerProvider({ serviceName: 'early' });

    trace.getTracer('test').startSpan('work').end();

    expect(exporter.getFinishedSpans().map((span) => span.name)).toContain('work');
  });

  it('sends spans to a processor added after the provider existed', () => {
    ensureTracerProvider();

    const exporter = new InMemorySpanExporter();
    addSpanProcessor(new SimpleSpanProcessor(exporter));

    trace.getTracer('test').startSpan('late').end();

    // This is why the provider is built around one composite: `BasicTracerProvider`
    // takes its processors at construction and never exposes them again.
    expect(exporter.getFinishedSpans().map((span) => span.name)).toContain('late');
  });

  it('stops sending to a removed processor', () => {
    const exporter = new InMemorySpanExporter();
    const remove = addSpanProcessor(new SimpleSpanProcessor(exporter));
    ensureTracerProvider();

    remove();
    trace.getTracer('test').startSpan('ignored').end();

    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it('builds the meter provider once, so instruments stay bound', () => {
    const reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 2_147_483_647,
    });

    addMetricReader(reader);

    expect(ensureMeterProvider()).toBe(ensureMeterProvider());
  });

  it('ignores a metric reader registered twice', () => {
    const reader = new PeriodicExportingMetricReader({
      exporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
      exportIntervalMillis: 2_147_483_647,
    });

    // A plugin config phase can run more than once per process, and a reader
    // cannot be bound to a second provider.
    addMetricReader(reader);
    addMetricReader(reader);

    expect(() => ensureMeterProvider()).not.toThrow();
  });

  it('starts without an exporter when no endpoint is configured', async () => {
    const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    const started = await startNodeTelemetry({ serviceName: 'no-exporter' });

    expect(started.provider).toBeDefined();

    if (previous) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous;
    }
  });

  it.each([['always'], ['never'], ['parent']] as const)('accepts the %s sampler', async (sampler) => {
    const started = await startNodeTelemetry({ sampler });

    expect(started.provider).toBeDefined();
  });

  it('accepts a ratio sampler', async () => {
    const started = await startNodeTelemetry({ sampler: { ratio: 0.25 } });

    expect(started.provider).toBeDefined();
  });

  it('accepts a ready-made exporter and extra processors', async () => {
    const exporter = new InMemorySpanExporter();
    const extra = new SimpleSpanProcessor(new InMemorySpanExporter());

    const started = await startNodeTelemetry({ exporter, spanProcessors: [extra] });
    trace.getTracer('test').startSpan('exported').end();

    // A supplied exporter is wrapped in a batch processor, so nothing has left
    // the buffer yet.
    await started.provider.forceFlush();

    expect(exporter.getFinishedSpans().map((span) => span.name)).toContain('exported');
  });

  it('shuts a started provider down', async () => {
    const started = await startNodeTelemetry();
    const shutdown = vi.spyOn(started.provider, 'shutdown');

    await started.shutdown();

    expect(shutdown).toHaveBeenCalled();
  });

  it('starts from a clean slate after a reset', async () => {
    const first = ensureTracerProvider();
    await resetTelemetryProviders();

    expect(ensureTracerProvider()).not.toBe(first);
    expect(metrics.getMeter('test')).toBeDefined();
  });
});

describe('CompositeSpanProcessor', () => {
  it('reports how many processors it fans out to', () => {
    const composite = new CompositeSpanProcessor();
    const remove = composite.add(new SimpleSpanProcessor(new InMemorySpanExporter()));

    expect(composite.size).toBe(1);
    remove();
    expect(composite.size).toBe(0);
  });

  it('flushes and shuts every processor down', async () => {
    const composite = new CompositeSpanProcessor();
    const inner = new SimpleSpanProcessor(new InMemorySpanExporter());
    const flush = vi.spyOn(inner, 'forceFlush');
    const shutdown = vi.spyOn(inner, 'shutdown');

    composite.add(inner);
    await composite.forceFlush();
    await composite.shutdown();

    expect(flush).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
  });
});
