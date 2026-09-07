import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createInstrument } from '../src/Instrument/Factory';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';

describe('createInstrument', () => {
  let telemetry: TestTelemetry;
  let instrument: ReturnType<typeof createInstrument>;

  beforeAll(() => {
    telemetry = createTestTelemetry();
    instrument = createInstrument('@vercube/test');
  });

  afterEach(() => telemetry.reset());
  afterAll(() => telemetry.shutdown());

  describe('span', () => {
    it('returns a synchronous result without making it a promise', () => {
      const result = instrument.span('sync.work', { kind: SpanKind.CLIENT }, () => 21 * 2);

      expect(result).toBe(42);
      expect(telemetry.span('sync.work')?.kind).toBe(SpanKind.CLIENT);
    });

    it('ends the span when the work throws synchronously', () => {
      expect(() =>
        instrument.span('sync.boom', {}, () => {
          throw new Error('nope');
        }),
      ).toThrow('nope');

      const span = telemetry.span('sync.boom');

      expect(span?.endTime).toBeDefined();
      expect(span?.status.code).toBe(SpanStatusCode.ERROR);
    });

    it('passes an asynchronous result through and records the attributes', async () => {
      const result = await instrument.span(
        'async.work',
        { kind: SpanKind.CLIENT, attributes: { 'test.key': 'value' } },
        async () => 'done',
      );

      expect(result).toBe('done');
      expect(telemetry.span('async.work')?.attributes['test.key']).toBe('value');
    });

    it('marks a rejection as failed', async () => {
      await expect(instrument.span('async.boom', {}, () => Promise.reject(new Error('async nope')))).rejects.toThrow(
        'async nope',
      );

      const span = telemetry.span('async.boom');

      expect(span?.status.code).toBe(SpanStatusCode.ERROR);
      expect(span?.status.message).toBe('async nope');
      expect(span?.attributes['error.type']).toBe('Error');
      expect(span?.events.some((event) => event.name === 'exception')).toBe(true);
    });

    // The server-span policy in `failSpan` deliberately leaves a 4xx unmarked,
    // because on a server span it describes the caller. A client span has no
    // such rule: an S3 error carrying `status: 404` is a real failure of that
    // operation, and treating it otherwise would hide it.
    it('marks a client-span failure even when the error carries a 4xx status', async () => {
      const error = Object.assign(new Error('missing'), { status: 404, name: 'NotFoundError' });

      await expect(instrument.span('client.missing', { kind: SpanKind.CLIENT }, () => Promise.reject(error))).rejects.toThrow(
        'missing',
      );

      const span = telemetry.span('client.missing');

      expect(span?.status.code).toBe(SpanStatusCode.ERROR);
      expect(span?.attributes['error.type']).toBe('NotFoundError');
    });

    it('nests a span in the one that is already active', async () => {
      await instrument.span('outer', {}, () => instrument.span('inner', {}, async () => undefined));

      const outer = telemetry.span('outer');
      const inner = telemetry.span('inner');

      expect(inner?.parentSpanContext?.spanId).toBe(outer?.spanContext().spanId);
      expect(inner?.spanContext().traceId).toBe(outer?.spanContext().traceId);
    });
  });

  describe('spanFrom', () => {
    it('parents the span on an extracted context rather than the active one', async () => {
      const headers: Record<string, string> = {};

      const published = await instrument.span('publish', {}, async () => {
        instrument.inject(headers);

        return instrument.activeSpan()!.spanContext();
      });

      expect(headers.traceparent).toContain(published.traceId);

      // Outside any active span, exactly as a worker in another process is.
      await instrument.spanFrom('process', {}, instrument.extract(headers), async () => undefined);

      const processed = telemetry.span('process');

      expect(processed?.parentSpanContext?.spanId).toBe(published.spanId);
      expect(processed?.spanContext().traceId).toBe(published.traceId);
    });

    it('starts a root span when there is no trace context to continue', async () => {
      await instrument.spanFrom('orphan', {}, instrument.extract(undefined), async () => undefined);

      expect(telemetry.span('orphan')?.parentSpanContext).toBeUndefined();
    });
  });

  describe('instruments', () => {
    it('hands back the same instrument for the same name', () => {
      expect(instrument.counter('test.counter')).toBe(instrument.counter('test.counter'));
      expect(instrument.upDownCounter('test.updown')).toBe(instrument.upDownCounter('test.updown'));
      expect(instrument.histogram('test.histogram')).toBe(instrument.histogram('test.histogram'));
    });

    it('reports what a counter recorded', async () => {
      instrument.counter('test.recorded', { unit: '{thing}' }).add(3, { 'test.label': 'a' });

      const batches = await telemetry.collect();
      const metric = batches
        .at(-1)
        ?.scopeMetrics.flatMap((scope) => scope.metrics)
        .find((entry) => entry.descriptor.name === 'test.recorded');

      expect(metric?.dataPoints[0]?.value).toBe(3);
      expect(metric?.dataPoints[0]?.attributes['test.label']).toBe('a');
    });
  });

  describe('activeSpan', () => {
    it('is undefined outside a span', () => {
      expect(instrument.activeSpan()).toBeUndefined();
    });

    it('is the innermost span inside one', () => {
      instrument.span('named', {}, (span) => {
        expect(instrument.activeSpan()).toBe(span);
      });
    });
  });
});
