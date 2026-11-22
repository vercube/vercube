import {
  DEVTOOLS_PLAYGROUND_ATTRIBUTE,
  DEVTOOLS_PLAYGROUND_HEADER,
  DEVTOOLS_PLAYGROUND_SECRETS_HEADER,
} from '../Constants/DevtoolsDefaults';

/** Span event telemetry records the request headers under. */
const REQUEST_HEADERS_EVENT = 'http.request.headers';

/** Written in place of a withheld header value, as telemetry does. */
const REDACTED = '<redacted>';

/** OTLP span kind of a server span. */
const SPAN_KIND_SERVER = 2;

/** The parts of an OTLP attribute this module touches. */
interface Attribute {
  key: string;
  value: { stringValue?: string };
}

/** The parts of an OTLP span this module touches. */
interface Span {
  kind?: number;
  attributes?: Attribute[];
  events?: { name: string; attributes?: Attribute[] }[];
}

/**
 * Marks the server spans of playground requests in an OTLP trace payload and
 * withholds the credentials they were sent with.
 *
 * A span processor never sees the request, only the span, so the playground
 * header is read from where telemetry put it: the request headers event. That
 * event exists only while header capture is on, which is also the only time a
 * header value can reach the UI at all. With capture off there is nothing to
 * withhold, and the UI finds the request by the trace id it chose.
 *
 * Telemetry already withholds headers that look like credentials. The
 * playground lets the user pick the header an API key travels in, and a name
 * such as `x-client-id` does not look like one, so the playground names its
 * credential headers itself and they are withheld here.
 *
 * This runs when spans are serialised for a UI, never while a request is
 * handled, and works on the serialised copy: the spans other processors and
 * exporters hold are left as they were.
 *
 * @param payload - A parsed OTLP `ExportTraceServiceRequest`, modified in place
 * @returns The same payload
 */
export function markPlaygroundSpans<T>(payload: T): T {
  const resources = (payload as { resourceSpans?: { scopeSpans?: { spans?: Span[] }[] }[] } | null)?.resourceSpans ?? [];

  for (const resource of resources) {
    for (const scope of resource.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        if (span.kind === SPAN_KIND_SERVER) {
          markSpan(span);
        }
      }
    }
  }

  return payload;
}

/**
 * Marks one server span when its request came from the playground.
 *
 * @param span - The span, modified in place
 */
function markSpan(span: Span): void {
  const headers = span.events?.find((event) => event.name === REQUEST_HEADERS_EVENT)?.attributes;
  const marker = headers?.find((header) => header.key === DEVTOOLS_PLAYGROUND_HEADER)?.value.stringValue;

  if (!headers || !marker) {
    return;
  }

  span.attributes = [...(span.attributes ?? []), { key: DEVTOOLS_PLAYGROUND_ATTRIBUTE, value: { stringValue: marker } }];

  const secrets = new Set(
    (headers.find((header) => header.key === DEVTOOLS_PLAYGROUND_SECRETS_HEADER)?.value.stringValue ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );

  for (const header of headers) {
    if (secrets.has(header.key)) {
      header.value = { stringValue: REDACTED };
    }
  }
}
