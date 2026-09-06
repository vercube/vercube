import { createTraceState, isSpanContextValid, ROOT_CONTEXT, TraceFlags, trace } from '@opentelemetry/api';
import type { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';

/** Header carrying the sampled parent span, per W3C Trace Context. */
export const TRACEPARENT_HEADER = 'traceparent';

/** Header carrying vendor-specific trace state, per W3C Trace Context. */
export const TRACESTATE_HEADER = 'tracestate';

/**
 * `version-traceid-spanid-flags`, with anything after the flags tolerated so
 * that a future version of the spec still parses as version `00` would.
 */
const TRACEPARENT_REGEX = /^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})(-.*)?$/;

/** All-zero ids are explicitly invalid. */
const INVALID_TRACE_ID = '0'.repeat(32);
const INVALID_SPAN_ID = '0'.repeat(16);

/**
 * W3C Trace Context propagator.
 *
 * The reference implementation lives in `@opentelemetry/core`, which is an SDK
 * package. Propagation has to work with nothing but `@opentelemetry/api`
 * installed - a service that only forwards trace context should not need an
 * exporter - so the format is implemented here instead. It is two headers and a
 * fixed-width string.
 */
export class W3CTraceContextPropagator implements TextMapPropagator {
  /**
   * Writes the active span context into the carrier.
   *
   * @param context - The context to read the active span from
   * @param carrier - The carrier to write into
   * @param setter - Writer for the carrier
   */
  public inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    const spanContext = trace.getSpanContext(context);

    if (!spanContext || !isSpanContextValid(spanContext)) {
      return;
    }

    const flags = (spanContext.traceFlags ?? TraceFlags.NONE).toString(16).padStart(2, '0');
    setter.set(carrier, TRACEPARENT_HEADER, `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`);

    const state = spanContext.traceState?.serialize();

    if (state) {
      setter.set(carrier, TRACESTATE_HEADER, state);
    }
  }

  /**
   * Reads a remote span context out of the carrier.
   *
   * @param context - The context to extend
   * @param carrier - The carrier to read from
   * @param getter - Reader for the carrier
   * @returns The context, with the remote span context attached when the headers were valid
   */
  public extract(context: Context, carrier: unknown, getter: TextMapGetter): Context {
    const header = firstValue(getter.get(carrier, TRACEPARENT_HEADER));

    if (header === undefined) {
      return context;
    }

    const match = TRACEPARENT_REGEX.exec(header.trim());

    if (!match) {
      return context;
    }

    const [, version, traceId, spanId, flags] = match;

    // `ff` is reserved as "invalid" by the specification.
    if (version === 'ff' || traceId === INVALID_TRACE_ID || spanId === INVALID_SPAN_ID) {
      return context;
    }

    const state = firstValue(getter.get(carrier, TRACESTATE_HEADER));

    return trace.setSpanContext(context, {
      traceId,
      spanId,
      // Only the sampled bit is defined; higher bits must not be interpreted.
      traceFlags: Number.parseInt(flags, 16) & TraceFlags.SAMPLED,
      isRemote: true,
      traceState: state ? createTraceState(state) : undefined,
    });
  }

  /**
   * The header names this propagator manages.
   *
   * @returns The list of header names
   */
  public fields(): string[] {
    return [TRACEPARENT_HEADER, TRACESTATE_HEADER];
  }
}

/**
 * Reads headers off a `Headers` object or a plain record.
 */
export const headersGetter: TextMapGetter = {
  keys(carrier: unknown): string[] {
    if (carrier instanceof Headers) {
      return [...carrier.keys()];
    }

    return carrier ? Object.keys(carrier as Record<string, unknown>) : [];
  },
  get(carrier: unknown, key: string): string | undefined {
    if (carrier instanceof Headers) {
      return carrier.get(key) ?? undefined;
    }

    const value = (carrier as Record<string, unknown> | undefined)?.[key];
    return typeof value === 'string' ? value : undefined;
  },
};

/**
 * Writes headers to a `Headers` object or a plain record.
 */
export const headersSetter: TextMapSetter = {
  set(carrier: unknown, key: string, value: string): void {
    if (carrier instanceof Headers) {
      carrier.set(key, value);
      return;
    }

    if (carrier && typeof carrier === 'object') {
      (carrier as Record<string, string>)[key] = value;
    }
  },
};

/**
 * Normalizes the `string | string[] | undefined` a getter may return.
 *
 * @param value - The raw getter result
 * @returns The first value, or undefined
 */
function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ?? undefined;
}

/**
 * Extracts a remote parent context from request headers using a propagator.
 *
 * @param propagator - The propagator to use
 * @param headers - The incoming headers
 * @returns A context carrying the remote parent, or the root context
 */
export function extractFromHeaders(propagator: TextMapPropagator, headers: Headers): Context {
  return propagator.extract(ROOT_CONTEXT, headers, headersGetter);
}
