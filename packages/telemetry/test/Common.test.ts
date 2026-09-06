import { ROOT_CONTEXT, SpanStatusCode, trace, TraceFlags } from '@opentelemetry/api';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { captureRequestBody, captureResponseBody } from '../src/Common/BodyCapture';
import { addHeadersEvent, REQUEST_HEADERS_EVENT } from '../src/Common/HeaderCapture';
import { extractFromHeaders, headersGetter, W3CTraceContextPropagator } from '../src/Common/Propagation';
import { completeSpan, errorMessage, errorType, failSpan, runInSpan } from '../src/Common/SpanUtils';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';

let telemetry: TestTelemetry;

beforeAll(() => {
  telemetry = createTestTelemetry();
});

afterEach(() => telemetry.reset());
afterAll(() => telemetry.shutdown());

describe('errorType', () => {
  it.each([
    [new Error('x'), 'Error'],
    [new TypeError('x'), 'TypeError'],
    ['a string', 'string'],
    [42, 'number'],
  ])('names %s', (error, expected) => {
    expect(errorType(error)).toBe(expected);
  });

  it('prefers a declared name over the constructor', () => {
    const error = new Error('x');
    error.name = 'NotFoundError';

    // Bundlers rename classes, so the constructor is the less reliable source.
    expect(errorType(error)).toBe('NotFoundError');
  });

  it('falls back when a subclass declares nothing', () => {
    class Custom extends Error {}
    const custom = new Custom('x');
    custom.name = 'Error';

    expect(errorType(custom)).toBe('Custom');
  });
});

describe('errorMessage', () => {
  it.each([
    [new Error('boom'), 'boom'],
    ['plain', 'plain'],
    [undefined, ''],
  ])('reads %s', (error, expected) => {
    expect(errorMessage(error)).toBe(expected);
  });
});

describe('span lifecycle', () => {
  it('ignores a non-response result', () => {
    const tracer = trace.getTracer('test');
    const span = tracer.startSpan('work');

    completeSpan(span, { plain: true });
    span.end();

    expect(telemetry.span('work')!.attributes['http.response.status_code']).toBeUndefined();
  });

  it('marks a 5xx as failed but leaves a 4xx alone', () => {
    const tracer = trace.getTracer('test');

    const failed = tracer.startSpan('failed');
    completeSpan(failed, new Response(null, { status: 500 }));
    failed.end();

    const rejected = tracer.startSpan('rejected');
    completeSpan(rejected, new Response(null, { status: 404 }));
    rejected.end();

    expect(telemetry.span('failed')!.status.code).toBe(SpanStatusCode.ERROR);
    expect(telemetry.span('rejected')!.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('records an error that carries no http status as a server failure', () => {
    const span = trace.getTracer('test').startSpan('thrown');
    failSpan(span, new Error('boom'));
    span.end();

    expect(telemetry.span('thrown')!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('keeps a synchronous result synchronous', () => {
    const result = runInSpan(trace.getTracer('test'), 'sync', {}, ROOT_CONTEXT, () => 'value');

    expect(result).toBe('value');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('ends the span when the traced work throws', () => {
    expect(() =>
      runInSpan(trace.getTracer('test'), 'throws', {}, ROOT_CONTEXT, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(telemetry.span('throws')!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('ends the span when the traced work rejects', async () => {
    await expect(
      runInSpan(trace.getTracer('test'), 'rejects', {}, ROOT_CONTEXT, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(telemetry.span('rejects')!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('reports the outcome to a settle callback', async () => {
    const seen: unknown[] = [];

    await runInSpan(
      trace.getTracer('test'),
      'settled',
      {},
      ROOT_CONTEXT,
      () => Promise.resolve('done'),
      (_span, value) => {
        seen.push(value);
      },
    );

    expect(seen).toEqual(['done']);
  });
});

describe('body capture', () => {
  it('skips a request that cannot carry a body', () => {
    expect(captureRequestBody(new Request('http://localhost/'), 1024)).toBeUndefined();
  });

  it('skips a response with no body', () => {
    expect(captureResponseBody(new Response(null, { status: 204 }), 1024)).toBeUndefined();
  });

  it('reports an empty body rather than empty text', async () => {
    // An empty string still produces a stream, so this reaches the reader.
    await expect(captureRequestBody(new Request('http://localhost/', { method: 'POST', body: '' }), 1024)).resolves.toMatchObject(
      { omitted: 'empty', size: 0 },
    );
  });

  it('refuses a body that declares itself too large without reading it', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-length': '999999', 'content-type': 'application/json' },
      body: '{"a":1}',
    });

    await expect(captureRequestBody(request, 16)).resolves.toMatchObject({ omitted: 'too-large', size: 999_999 });
  });

  it('treats a missing content type as text', async () => {
    const request = new Request('http://localhost/', { method: 'POST', body: 'hello' });
    const preview = await captureRequestBody(request, 1024);

    expect(preview).toMatchObject({ text: 'hello', truncated: false });
  });
});

describe('header capture', () => {
  it('withholds credentials and honours extra names', () => {
    const span = trace.getTracer('test').startSpan('headers');

    addHeadersEvent(
      span,
      REQUEST_HEADERS_EVENT,
      new Headers({ authorization: 'Bearer x', 'x-internal': 'secret', 'x-safe': 'ok' }),
      new Set(['x-internal']),
    );
    span.end();

    const event = telemetry.span('headers')!.events.find((entry) => entry.name === REQUEST_HEADERS_EVENT)!;

    expect(event.attributes).toMatchObject({
      authorization: '<redacted>',
      'x-internal': '<redacted>',
      'x-safe': 'ok',
    });
  });
});

describe('propagation carriers', () => {
  const propagator = new W3CTraceContextPropagator();

  it('lists the keys of either carrier shape', () => {
    expect(headersGetter.keys(new Headers({ traceparent: 'x' }))).toContain('traceparent');
    expect(headersGetter.keys({ a: '1' })).toEqual(['a']);
    expect(headersGetter.keys(undefined)).toEqual([]);
  });

  it('reads from a plain record and ignores non-string values', () => {
    expect(headersGetter.get({ traceparent: 'value' }, 'traceparent')).toBe('value');
    expect(headersGetter.get({ traceparent: 42 }, 'traceparent')).toBeUndefined();
    expect(headersGetter.get(undefined, 'traceparent')).toBeUndefined();
  });

  it('extracts from request headers', () => {
    const traceId = '0af7651916cd43dd8448eb211c80319c';
    const headers = new Headers({ traceparent: `00-${traceId}-b7ad6b7169203331-01` });

    expect(trace.getSpanContext(extractFromHeaders(propagator, headers))?.traceId).toBe(traceId);
  });

  it('injects into a plain record', () => {
    const context = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: TraceFlags.SAMPLED,
    });
    const carrier: Record<string, string> = {};

    propagator.inject(context, carrier, { set: (target, key, value) => ((target as Record<string, string>)[key] = value) });

    expect(carrier.traceparent).toContain('0af7651916cd43dd8448eb211c80319c');
  });
});
