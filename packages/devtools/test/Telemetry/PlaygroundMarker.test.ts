import { describe, expect, it } from 'vitest';
import { markPlaygroundSpans } from '../../src/Telemetry/PlaygroundMarker';

/** An OTLP attribute holding a string. */
interface Attribute {
  key: string;
  value: { stringValue?: string };
}

/**
 * Builds OTLP attributes from a record.
 *
 * @param values - Attribute values by key
 * @returns The attribute list
 */
function attributes(values: Record<string, string>): Attribute[] {
  return Object.entries(values).map(([key, stringValue]) => ({ key, value: { stringValue } }));
}

/**
 * Wraps spans in an OTLP export request.
 *
 * @param spans - The spans
 * @returns The payload
 */
function payload(spans: unknown[]): { resourceSpans: { scopeSpans: { spans: unknown[] }[] }[] } {
  return { resourceSpans: [{ scopeSpans: [{ spans }] }] };
}

/**
 * Builds a span with a request headers event.
 *
 * @param headers - Captured request headers
 * @param kind - OTLP span kind, a server span by default
 * @returns The span
 */
function span(
  headers: Record<string, string> | null,
  kind = 2,
): { kind: number; attributes?: Attribute[]; events: { name: string; attributes: Attribute[] }[] } {
  return {
    kind,
    attributes: attributes({ 'http.request.method': 'GET' }),
    events: headers ? [{ name: 'http.request.headers', attributes: attributes(headers) }] : [],
  };
}

describe('markPlaygroundSpans', () => {
  it('copies the marker header onto the server span', () => {
    const marked = span({ 'x-devtools-playground': 'abc', accept: '*/*' });

    markPlaygroundSpans(payload([marked]));

    expect(marked.attributes).toContainEqual({ key: 'vercube.devtools.playground', value: { stringValue: 'abc' } });
  });

  it('leaves spans of other requests as they were', () => {
    const plain = span({ accept: '*/*' });
    const headless = span(null);

    markPlaygroundSpans(payload([plain, headless]));

    expect(plain.attributes).toHaveLength(1);
    expect(headless.attributes).toHaveLength(1);
  });

  it('marks server spans only', () => {
    const internal = span({ 'x-devtools-playground': 'abc' }, 1);

    markPlaygroundSpans(payload([internal]));

    expect(internal.attributes).toHaveLength(1);
  });

  it('withholds the headers the playground names as credentials', () => {
    const marked = span({
      'x-devtools-playground': 'abc',
      'x-devtools-playground-redact': 'X-Client-Id, x-tenant',
      'x-client-id': 'key-1',
      'x-tenant': 'acme',
      accept: '*/*',
    });

    markPlaygroundSpans(payload([marked]));

    const headers = Object.fromEntries(marked.events[0].attributes.map((entry) => [entry.key, entry.value.stringValue]));

    expect(headers).toMatchObject({ 'x-client-id': '<redacted>', 'x-tenant': '<redacted>', accept: '*/*' });
  });

  it('withholds nothing for a request that is not from the playground', () => {
    const plain = span({ 'x-devtools-playground-redact': 'x-client-id', 'x-client-id': 'key-1' });

    markPlaygroundSpans(payload([plain]));

    expect(plain.events[0].attributes).toContainEqual({ key: 'x-client-id', value: { stringValue: 'key-1' } });
  });

  it('adds the attribute list when a span has none', () => {
    const bare = span({ 'x-devtools-playground': 'abc' });

    delete bare.attributes;
    markPlaygroundSpans(payload([bare]));

    expect(bare.attributes).toEqual([{ key: 'vercube.devtools.playground', value: { stringValue: 'abc' } }]);
  });

  it('survives payloads without spans', () => {
    expect(markPlaygroundSpans(null)).toBeNull();
    expect(markPlaygroundSpans({})).toEqual({});
    expect(markPlaygroundSpans({ resourceSpans: [{}, { scopeSpans: [{}] }] })).toEqual({
      resourceSpans: [{}, { scopeSpans: [{}] }],
    });
  });
});
