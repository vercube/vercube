import { ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import { headersGetter, headersSetter, W3CTraceContextPropagator } from '../src/Common/Propagation';

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const SPAN_ID = 'b7ad6b7169203331';

describe('W3CTraceContextPropagator', () => {
  const propagator = new W3CTraceContextPropagator();

  it('extracts a sampled remote parent', () => {
    const headers = new Headers({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` });
    const spanContext = trace.getSpanContext(propagator.extract(ROOT_CONTEXT, headers, headersGetter));

    expect(spanContext).toMatchObject({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });
  });

  it('keeps tracestate', () => {
    const headers = new Headers({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`, tracestate: 'vendor=value' });
    const spanContext = trace.getSpanContext(propagator.extract(ROOT_CONTEXT, headers, headersGetter));

    expect(spanContext?.traceState?.get('vendor')).toBe('value');
  });

  it('only reads the sampled bit out of the flags', () => {
    const headers = new Headers({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-ff` });
    const spanContext = trace.getSpanContext(propagator.extract(ROOT_CONTEXT, headers, headersGetter));

    expect(spanContext?.traceFlags).toBe(TraceFlags.SAMPLED);
  });

  it.each([
    ['a malformed header', 'not-a-traceparent'],
    ['a short trace id', `00-${TRACE_ID.slice(0, 30)}-${SPAN_ID}-01`],
    ['an all-zero trace id', `00-${'0'.repeat(32)}-${SPAN_ID}-01`],
    ['an all-zero span id', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
    ['the reserved ff version', `ff-${TRACE_ID}-${SPAN_ID}-01`],
  ])('ignores %s', (_label, value) => {
    const context = propagator.extract(ROOT_CONTEXT, new Headers({ traceparent: value }), headersGetter);

    expect(trace.getSpanContext(context)).toBeUndefined();
  });

  it('returns the context untouched with no traceparent', () => {
    expect(propagator.extract(ROOT_CONTEXT, new Headers(), headersGetter)).toBe(ROOT_CONTEXT);
  });

  it('injects the active span context', () => {
    const context = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
    });
    const carrier: Record<string, string> = {};

    propagator.inject(context, carrier, headersSetter);

    expect(carrier.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
  });

  it('pads unsampled flags to two digits', () => {
    const context = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.NONE,
    });
    const carrier: Record<string, string> = {};

    propagator.inject(context, carrier, headersSetter);

    expect(carrier.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-00`);
  });

  it('injects nothing without a valid span context', () => {
    const carrier: Record<string, string> = {};

    propagator.inject(ROOT_CONTEXT, carrier, headersSetter);

    expect(carrier).toEqual({});
  });

  it('round-trips through Headers', () => {
    const context = trace.setSpanContext(ROOT_CONTEXT, {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: TraceFlags.SAMPLED,
    });
    const headers = new Headers();

    propagator.inject(context, headers, headersSetter);

    expect(trace.getSpanContext(propagator.extract(ROOT_CONTEXT, headers, headersGetter))).toMatchObject({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
    });
  });

  it('names the headers it manages', () => {
    expect(propagator.fields()).toEqual(['traceparent', 'tracestate']);
  });
});
