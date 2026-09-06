import { context, metrics, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, ValueType } from '@opentelemetry/api';
import type { Counter, Exception, Span } from '@opentelemetry/api';

/** Instrumentation scope reported for queue signals. */
const SCOPE = '@vercube/queue';

/** Attribute naming the transport a job travelled through. */
export const QUEUE_STRATEGY = 'vercube.queue.strategy';

/** Attribute naming the queue. */
export const QUEUE_NAME = 'vercube.queue.name';

/** Attribute naming the job. */
export const QUEUE_JOB = 'vercube.queue.job';

/** Attribute carrying the attempt number. */
export const QUEUE_ATTEMPT = 'vercube.queue.attempt';

/** Lazily created counters, so no instrument exists until the queue is used. */
let published: Counter | undefined;
let processed: Counter | undefined;

/**
 * Writes the active trace context into a job's headers.
 *
 * This is what makes a background job part of the trace of the request that
 * queued it: without it, the consumer starts a trace of its own and the two
 * halves of the same operation can never be put back together.
 *
 * Uses the globally registered propagator, so it does nothing until an
 * application installs one.
 *
 * @param headers - Headers the job will carry
 */
export function injectTraceContext(headers: Record<string, string>): void {
  propagation.inject(context.active(), headers);
}

/**
 * Reads the trace context a job was published with.
 *
 * @param headers - Headers the job arrived with
 * @returns A context carrying the publishing span as parent
 */
export function extractTraceContext(headers: Record<string, string> | undefined): ReturnType<typeof propagation.extract> {
  return propagation.extract(ROOT_CONTEXT, headers ?? {});
}

/**
 * Traces publishing one or more jobs.
 *
 * @param target - Strategy, queue and job the publish is for
 * @param count - How many jobs are being published
 * @param fn - The publish
 * @returns Whatever the publish returned
 */
export function tracePublish<T>(
  target: { strategy: string; queue: string; job: string },
  count: number,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = context.active();
  const span = trace.getTracer(SCOPE).startSpan(
    `queue.publish ${target.queue}`,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        [QUEUE_STRATEGY]: target.strategy,
        [QUEUE_NAME]: target.queue,
        [QUEUE_JOB]: target.job,
        'vercube.queue.batch': count,
      },
    },
    parent,
  );

  published ??= metrics.getMeter(SCOPE).createCounter('vercube.queue.published', {
    description: 'Jobs handed to a transport.',
    unit: '{job}',
    valueType: ValueType.INT,
  });

  published.add(count, { [QUEUE_NAME]: target.queue, [QUEUE_JOB]: target.job });

  return settle(span, parent, fn);
}

/**
 * Traces one attempt at a job.
 *
 * The span is parented on the publishing span when the job carries trace
 * context, so the whole operation reads as one trace even though the two halves
 * ran in different processes.
 *
 * @param target - Strategy, queue, job and attempt being processed
 * @param headers - Headers the job arrived with
 * @param fn - The attempt
 * @returns Whatever the attempt returned
 */
export function traceProcess<T>(
  target: { strategy: string; queue: string; job: string; attempt: number },
  headers: Record<string, string> | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = extractTraceContext(headers);
  const span = trace.getTracer(SCOPE).startSpan(
    `queue.process ${target.queue}.${target.job}`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        [QUEUE_STRATEGY]: target.strategy,
        [QUEUE_NAME]: target.queue,
        [QUEUE_JOB]: target.job,
        [QUEUE_ATTEMPT]: target.attempt,
      },
    },
    parent,
  );

  return settle(span, parent, fn);
}

/**
 * Counts the outcome of one attempt.
 *
 * @param target - Queue and job the attempt was for
 * @param outcome - How the attempt ended
 */
export function countOutcome(target: { queue: string; job: string }, outcome: string): void {
  processed ??= metrics.getMeter(SCOPE).createCounter('vercube.queue.processed', {
    description: 'Job attempts by outcome.',
    unit: '{attempt}',
    valueType: ValueType.INT,
  });

  processed.add(1, { [QUEUE_NAME]: target.queue, [QUEUE_JOB]: target.job, 'vercube.queue.outcome': outcome });
  trace.getActiveSpan()?.setAttribute('vercube.queue.outcome', outcome);
}

/**
 * Runs the traced work inside the span and ends it once it settles.
 *
 * @param span - The span covering the work
 * @param parent - Context the span was started from
 * @param fn - The work
 * @returns Whatever the work returned
 */
function settle<T>(span: Span, parent: ReturnType<typeof context.active>, fn: () => Promise<T>): Promise<T> {
  return context.with(trace.setSpan(parent, span), () => {
    let pending: Promise<T>;

    try {
      pending = fn();
    } catch (error) {
      fail(span, error);
      span.end();

      throw error;
    }

    return pending.then(
      (value) => {
        span.end();
        return value;
      },
      (error: unknown) => {
        fail(span, error);
        span.end();
        throw error;
      },
    );
  });
}

/**
 * Records a failure on a span.
 *
 * @param span - The span to update
 * @param error - The thrown value
 */
function fail(span: Span, error: unknown): void {
  span.recordException(error as Exception);
  span.setAttribute('error.type', error instanceof Error ? error.name : typeof error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
}
