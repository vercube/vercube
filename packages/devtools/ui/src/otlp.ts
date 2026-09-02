import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';

/**
 * Decodes the OTLP/JSON the server streams into the shapes the views render.
 *
 * The wire format is deliberately the standard one - the same bytes a
 * collector would receive - which makes it verbose to read: every attribute is
 * a `{ key, value: { stringValue } }` pair and every timestamp is a nanosecond
 * string. Everything pays that cost exactly once, here, so no view has to know
 * what OTLP looks like.
 */

/** An OTLP `AnyValue`. */
interface OtlpValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtlpValue[] };
}

/** An OTLP key/value pair. */
interface OtlpAttribute {
  key: string;
  value: OtlpValue;
}

/** An OTLP span event. */
interface OtlpEvent {
  name: string;
  timeUnixNano: string;
  attributes?: OtlpAttribute[];
}

/** An OTLP span. */
export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OtlpAttribute[];
  events?: OtlpEvent[];
  status?: { code?: number; message?: string };
}

/** An OTLP log record. */
interface OtlpLogRecord {
  timeUnixNano?: string;
  severityText?: string;
  body?: { stringValue?: string };
  attributes?: OtlpAttribute[];
  traceId?: string;
  spanId?: string;
}

/** OTLP span kind for a server span. */
const SPAN_KIND_SERVER = 2;

/** OTLP status code for a failed span. */
const STATUS_ERROR = 2;

/** Nanoseconds per millisecond. */
const NS_PER_MS = 1e6;

/**
 * Flattens OTLP attributes into a plain object.
 *
 * @param attributes - The attribute list
 * @returns The attributes as a record
 */
export function toRecord(attributes: OtlpAttribute[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const attribute of attributes ?? []) {
    result[attribute.key] = readValue(attribute.value);
  }

  return result;
}

/**
 * Unwraps a single OTLP value.
 *
 * @param value - The wrapped value
 * @returns The plain value
 */
function readValue(value: OtlpValue): unknown {
  if (value.stringValue !== undefined) {
    return value.stringValue;
  }

  if (value.intValue !== undefined) {
    return Number(value.intValue);
  }

  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }

  if (value.boolValue !== undefined) {
    return value.boolValue;
  }

  if (value.arrayValue) {
    return value.arrayValue.values.map((entry) => readValue(entry));
  }

  return undefined;
}

/**
 * Pulls every span out of an OTLP trace payload.
 *
 * @param payload - An `ExportTraceServiceRequest`
 * @returns The spans it contains
 */
export function decodeSpans(payload: unknown): OtlpSpan[] {
  const resourceSpans = (payload as { resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[] })?.resourceSpans ?? [];

  return resourceSpans.flatMap((resource) => (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []));
}

/**
 * Groups spans into the request records the UI lists.
 *
 * A request is a trace whose root is a server span; everything else in the
 * trace becomes a timeline entry. This is what makes the waterfall show any
 * instrumented work - a storage call, a cache miss - rather than only the
 * middleware and handler a bespoke recorder knew how to wrap.
 *
 * @param spans - Decoded spans, in any order
 * @returns One record per traced request, newest first
 */
export function toRequestRecords(spans: OtlpSpan[]): DevtoolsTypes.RequestRecord[] {
  const byTrace = new Map<string, OtlpSpan[]>();

  for (const span of spans) {
    byTrace.set(span.traceId, [...(byTrace.get(span.traceId) ?? []), span]);
  }

  const records: DevtoolsTypes.RequestRecord[] = [];

  for (const [traceId, group] of byTrace) {
    const root = group.find((span) => span.kind === SPAN_KIND_SERVER);

    if (!root) {
      continue;
    }

    records.push(toRequestRecord(traceId, root, group));
  }

  return records.sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Builds one request record from a trace.
 *
 * @param traceId - The trace id, used as the record id
 * @param root - The server span
 * @param group - Every span of the trace
 * @returns The record
 */
function toRequestRecord(traceId: string, root: OtlpSpan, group: OtlpSpan[]): DevtoolsTypes.RequestRecord {
  const attributes = toRecord(root.attributes);
  const origin = Number(root.startTimeUnixNano) / NS_PER_MS;
  const query = String(attributes['url.query'] ?? '');

  return {
    id: traceId,
    method: String(attributes['http.request.method'] ?? ''),
    path: String(attributes['url.path'] ?? ''),
    query: query ? Object.fromEntries(new URLSearchParams(query)) : {},
    status: Number(attributes['http.response.status_code'] ?? (root.status?.code === STATUS_ERROR ? 500 : 0)),
    durationMs: round((Number(root.endTimeUnixNano) - Number(root.startTimeUnixNano)) / NS_PER_MS),
    startedAt: Math.round(origin),
    controller: String(attributes['vercube.controller'] ?? ''),
    handler: String(attributes['vercube.handler'] ?? ''),
    matched: attributes['http.route'] !== undefined,
    error: toError(root),
    spans: group
      .filter((span) => span !== root)
      .map((span) => ({
        name: span.name,
        kind: 'handler' as const,
        offsetMs: round(Number(span.startTimeUnixNano) / NS_PER_MS - origin),
        durationMs: round((Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / NS_PER_MS),
      }))
      .sort((a, b) => a.offsetMs - b.offsetMs),
    requestHeaders: toHeaders(root, 'http.request.headers'),
    responseHeaders: toHeaders(root, 'http.response.headers'),
    requestBody: toPayload(root, 'http.request.body'),
    responseBody: toPayload(root, 'http.response.body'),
  };
}

/**
 * Reads captured headers off a span event.
 *
 * @param span - The span
 * @param name - Event name
 * @returns The headers, or an empty object when none were captured
 */
function toHeaders(span: OtlpSpan, name: string): Record<string, string> {
  const event = span.events?.find((candidate) => candidate.name === name);

  if (!event) {
    return {};
  }

  return Object.fromEntries(Object.entries(toRecord(event.attributes)).map(([key, value]) => [key, String(value)]));
}

/**
 * Reads the exception recorded on a span, if any.
 *
 * @param span - The span
 * @returns The error description, or undefined
 */
function toError(span: OtlpSpan): DevtoolsTypes.RequestRecord['error'] {
  const event = span.events?.find((candidate) => candidate.name === 'exception');

  if (!event) {
    return undefined;
  }

  const attributes = toRecord(event.attributes);

  return {
    name: String(attributes['exception.type'] ?? 'Error'),
    message: String(attributes['exception.message'] ?? ''),
    stack: attributes['exception.stacktrace'] as string | undefined,
  };
}

/**
 * Reads a captured body off a span event.
 *
 * @param span - The span
 * @param name - Event name
 * @returns The payload, or undefined when nothing was captured
 */
function toPayload(span: OtlpSpan, name: string): DevtoolsTypes.Payload | undefined {
  const event = span.events?.find((candidate) => candidate.name === name);

  if (!event) {
    return undefined;
  }

  const attributes = toRecord(event.attributes);

  return {
    contentType: (attributes['body.content_type'] as string | undefined) ?? null,
    size: Number(attributes['body.size'] ?? 0),
    text: attributes['body.text'] as string | undefined,
    truncated: attributes['body.truncated'] === true,
    omitted: attributes['body.omitted'] as DevtoolsTypes.PayloadOmission | undefined,
  };
}

/**
 * Decodes an OTLP logs payload into log entries.
 *
 * @param payload - An `ExportLogsServiceRequest`
 * @returns The entries it contains
 */
export function decodeLogs(payload: unknown): DevtoolsTypes.LogEntry[] {
  const resourceLogs = (payload as { resourceLogs?: { scopeLogs?: { logRecords?: OtlpLogRecord[] }[] }[] })?.resourceLogs ?? [];

  return resourceLogs
    .flatMap((resource) => (resource.scopeLogs ?? []).flatMap((scope) => scope.logRecords ?? []))
    .map((record, index) => {
      const at = record.timeUnixNano ? Math.round(Number(record.timeUnixNano) / NS_PER_MS) : Date.now();
      const { message, context } = readBody(record.body?.stringValue ?? '');

      return {
        id: `${record.spanId ?? record.traceId ?? 'log'}:${at}:${index}`,
        level: (record.severityText?.toLowerCase() ?? 'info') as DevtoolsTypes.LogLevel,
        message,
        context: { ...toRecord(record.attributes), ...context },
        at,
        requestId: record.traceId,
      };
    });
}

/**
 * Splits a log body into a headline and the rest of its fields.
 *
 * A wide event serialises as the whole JSON object, which is the right thing
 * to ship to a backend and the wrong thing to put in a table cell. The message
 * is lifted out and everything else becomes context.
 *
 * @param body - The serialised body
 * @returns The headline and the remaining fields
 */
function readBody(body: string): { message: string; context: Record<string, unknown> } {
  if (!body.startsWith('{')) {
    return { message: body, context: {} };
  }

  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { message: body, context: {} };
  }

  // These are envelope fields the table shows in its own columns; keeping them
  // in the context would just repeat them in every expanded row.
  const {
    message,
    tag,
    timestamp: _timestamp,
    level: _level,
    service: _service,
    environment: _environment,
    traceId: _traceId,
    spanId: _spanId,
    ...context
  } = parsed;
  const headline = typeof message === 'string' ? message : describeEvent(context);

  return { message: typeof tag === 'string' && headline ? `${tag} ${headline}` : (headline ?? ''), context };
}

/**
 * Builds a headline for a wide event that carries no message.
 *
 * @param context - The event's remaining fields
 * @returns A short description
 */
function describeEvent(context: Record<string, unknown>): string {
  if (typeof context.method === 'string' && typeof context.path === 'string') {
    return `${context.method} ${context.path}`;
  }

  const error = context.error as { message?: string } | undefined;

  return error?.message ?? Object.keys(context).slice(0, 3).join(' ');
}

/**
 * Decodes an OTLP metrics payload into the sample shape the charts read.
 *
 * @param payload - An `ExportMetricsServiceRequest`
 * @returns One sample per collection, oldest first
 */
export function decodeMetrics(payload: unknown): DevtoolsTypes.MetricsSample[] {
  const resourceMetrics =
    (payload as { resourceMetrics?: { scopeMetrics?: { metrics?: OtlpMetric[] }[] }[] })?.resourceMetrics ?? [];

  const samples = new Map<number, Record<string, number>>();

  for (const resource of resourceMetrics) {
    for (const scope of resource.scopeMetrics ?? []) {
      for (const metric of scope.metrics ?? []) {
        for (const point of metric.gauge?.dataPoints ?? []) {
          const at = Math.round(Number(point.timeUnixNano) / NS_PER_MS);
          const bucket = samples.get(at) ?? {};

          bucket[metric.name] = point.asDouble ?? Number(point.asInt ?? 0);
          samples.set(at, bucket);
        }
      }
    }
  }

  return [...samples.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, values]) => ({
      at,
      cpu: toCpu(values['process.cpu.utilization']),
      memory: {
        heapUsed: values['v8js.memory.heap.used'] ?? 0,
        heapTotal: values['v8js.memory.heap.used'] ?? 0,
        heapLimit: values['v8js.memory.heap.limit'] ?? null,
        rss: values['process.memory.usage'] ?? 0,
        external: 0,
        arrayBuffers: 0,
      },
      loop: toLoop(values),
      resources: values['nodejs.process.handles'] === undefined ? null : { total: values['nodejs.process.handles'], kinds: {} },
    }));
}

/** An OTLP metric. */
interface OtlpMetric {
  name: string;
  gauge?: { dataPoints: { timeUnixNano: string; asDouble?: number; asInt?: string | number }[] };
}

/**
 * Turns a CPU utilisation ratio into the percentage split the charts expect.
 *
 * The process gauge reports one number rather than the user/system split the
 * old sampler produced, so both halves report the same total.
 *
 * @param utilization - Fraction of one core
 * @returns The CPU sample, or null when it was not reported
 */
function toCpu(utilization: number | undefined): DevtoolsTypes.MetricsSample['cpu'] {
  if (utilization === undefined) {
    return null;
  }

  const total = round(utilization * 100);

  return { total, user: total, system: 0 };
}

/**
 * Assembles the event loop portion of a sample.
 *
 * @param values - Collected gauge values
 * @returns The loop sample, or null when it was not reported
 */
function toLoop(values: Record<string, number>): DevtoolsTypes.MetricsSample['loop'] {
  const mean = values['nodejs.eventloop.delay.mean'];

  if (mean === undefined) {
    return null;
  }

  return {
    meanMs: round(mean * 1000),
    p99Ms: round((values['nodejs.eventloop.delay.p99'] ?? mean) * 1000),
    utilization: values['nodejs.eventloop.utilization'] ?? 0,
  };
}

/**
 * Rounds a value for display.
 *
 * @param value - The raw value
 * @returns The value rounded to three decimals
 */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
