import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';

/**
 * A span processor that other processors can be added to after the tracer
 * provider has already been built.
 *
 * `BasicTracerProvider` takes its processors at construction and never exposes
 * them again, which makes "the application configured OTLP export and devtools
 * also wants to see the spans" unsolvable: whoever builds the provider second
 * wins. Registering a single composite instead, and letting packages add to it
 * whenever they initialise, removes the ordering problem entirely.
 */
export class CompositeSpanProcessor implements SpanProcessor {
  /** The processors this one fans out to. */
  private readonly fProcessors: SpanProcessor[] = [];

  /**
   * Adds a processor.
   *
   * @param processor - The processor to add
   * @returns A function that removes it again
   */
  public add(processor: SpanProcessor): () => void {
    this.fProcessors.push(processor);

    return () => {
      const index = this.fProcessors.indexOf(processor);

      if (index !== -1) {
        this.fProcessors.splice(index, 1);
      }
    };
  }

  /** Number of registered processors. */
  public get size(): number {
    return this.fProcessors.length;
  }

  /** @inheritdoc */
  public onStart(span: Span, parentContext: Context): void {
    for (const processor of this.fProcessors) {
      processor.onStart(span, parentContext);
    }
  }

  /** @inheritdoc */
  public onEnd(span: ReadableSpan): void {
    for (const processor of this.fProcessors) {
      processor.onEnd(span);
    }
  }

  /** @inheritdoc */
  public async forceFlush(): Promise<void> {
    await Promise.all(this.fProcessors.map((processor) => processor.forceFlush()));
  }

  /** @inheritdoc */
  public async shutdown(): Promise<void> {
    await Promise.all(this.fProcessors.map((processor) => processor.shutdown()));
  }
}
