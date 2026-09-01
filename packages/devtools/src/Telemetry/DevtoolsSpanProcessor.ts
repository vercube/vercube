import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import type { DevtoolsFrameBus } from '../Services/DevtoolsFrameBus';
import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';

/** How long finished spans are held before being flushed, in milliseconds. */
const FLUSH_INTERVAL_MS = 100;

/** Largest batch published in one frame. */
const MAX_BATCH = 200;

/**
 * Keeps finished spans in memory and streams them to connected UIs.
 *
 * This is what replaced devtools' hand-written request recorder. The recorder
 * had to monkey-patch `HttpServer.handleRequest`, every route handler and every
 * middleware to see anything, and could only ever see those three things. A
 * span processor sees whatever the application and its packages instrument -
 * storage calls, cache lookups, background work - without devtools knowing they
 * exist.
 */
export class DevtoolsSpanProcessor implements SpanProcessor {
  /** Finished spans, oldest first. */
  private fSpans: ReadableSpan[] = [];

  /** Spans finished since the last flush. */
  private fPending: ReadableSpan[] = [];

  /** Flush timer, running only while spans are waiting. */
  private fTimer: ReturnType<typeof setTimeout> | null = null;

  /** Where flushed batches are published. */
  private readonly fBus: DevtoolsFrameBus;

  /** Ring buffer capacity. */
  private readonly fMaxSpans: number;

  /** Returns true for spans devtools should ignore, such as its own traffic. */
  private readonly fIgnore: (span: ReadableSpan) => boolean;

  /**
   * @param bus - Frame bus to publish batches on
   * @param options - Buffer size and the ignore predicate
   */
  constructor(bus: DevtoolsFrameBus, options: { maxSpans: number; ignore?: (span: ReadableSpan) => boolean }) {
    this.fBus = bus;
    this.fMaxSpans = options.maxSpans;
    this.fIgnore = options.ignore ?? (() => false);
  }

  /**
   * Buffered spans, newest first.
   *
   * @param limit - Maximum number returned
   * @returns The buffered spans
   */
  public spans(limit = this.fMaxSpans): ReadableSpan[] {
    return this.fSpans.slice(-limit).reverse();
  }

  /**
   * Serialises the buffered spans as an OTLP/JSON export request.
   *
   * @param limit - Maximum number included
   * @returns The OTLP payload
   */
  public snapshot(limit = this.fMaxSpans): unknown {
    return toOtlpJson(this.fSpans.slice(-limit));
  }

  /** Empties the buffer. */
  public clear(): void {
    this.fSpans = [];
  }

  /** @inheritdoc */
  public onStart(_span: Span, _parentContext: Context): void {
    // Nothing to do: devtools only shows finished work.
  }

  /** @inheritdoc */
  public onEnd(span: ReadableSpan): void {
    if (this.fIgnore(span)) {
      return;
    }

    this.fSpans.push(span);

    while (this.fSpans.length > this.fMaxSpans) {
      this.fSpans.shift();
    }

    if (this.fBus.size === 0) {
      return;
    }

    this.fPending.push(span);

    // Batched rather than published per span: a single request produces a
    // handful of spans that all finish within a millisecond of each other, and
    // one frame per span would make the UI reassemble the same trace repeatedly.
    if (!this.fTimer) {
      this.fTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
      this.fTimer.unref?.();
    }
  }

  /** @inheritdoc */
  public async forceFlush(): Promise<void> {
    this.flush();
  }

  /** @inheritdoc */
  public async shutdown(): Promise<void> {
    this.flush();
    this.fSpans = [];
  }

  /**
   * Publishes everything finished since the last flush.
   */
  private flush(): void {
    if (this.fTimer) {
      clearTimeout(this.fTimer);
      this.fTimer = null;
    }

    while (this.fPending.length > 0) {
      const batch = this.fPending.splice(0, MAX_BATCH);
      this.fBus.publish('trace', toOtlpJson(batch));
    }
  }
}

/**
 * Converts finished spans into an OTLP/JSON export request.
 *
 * The official serializer is used rather than a hand-rolled mapping, so the
 * frames a UI receives are byte-for-byte what a collector would.
 *
 * @param spans - The spans to serialise
 * @returns The parsed OTLP payload, or an empty request
 */
function toOtlpJson(spans: ReadableSpan[]): unknown {
  if (spans.length === 0) {
    return { resourceSpans: [] };
  }

  const bytes = JsonTraceSerializer.serializeRequest(spans);

  return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : { resourceSpans: [] };
}
