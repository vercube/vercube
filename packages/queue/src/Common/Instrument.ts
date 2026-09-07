import { createInstrument, SpanKind, ValueType } from '@vercube/telemetry/instrument';
import type { Context } from '@vercube/telemetry/instrument';

/**
 * Traces and counts queue activity.
 *
 * The toolkit comes from `@vercube/telemetry/instrument`, which is the only
 * place in the framework that speaks to OpenTelemetry directly, and it creates
 * no instrument until one is actually used.
 */
const instrument = createInstrument('@vercube/queue');

/** Attribute naming the transport a job travelled through. */
export const QUEUE_STRATEGY = 'vercube.queue.strategy';

/** Attribute naming the queue. */
export const QUEUE_NAME = 'vercube.queue.name';

/** Attribute naming the job. */
export const QUEUE_JOB = 'vercube.queue.job';

/** Attribute carrying the attempt number. */
export const QUEUE_ATTEMPT = 'vercube.queue.attempt';

/** Attribute carrying how an attempt ended. */
const QUEUE_OUTCOME = 'vercube.queue.outcome';

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
  instrument.inject(headers);
}

/**
 * Reads the trace context a job was published with.
 *
 * @param headers - Headers the job arrived with
 * @returns A context carrying the publishing span as parent
 */
export function extractTraceContext(headers: Record<string, string> | undefined): Context {
  return instrument.extract(headers);
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
  const published = instrument.counter('vercube.queue.published', {
    description: 'Jobs handed to a transport.',
    unit: '{job}',
    valueType: ValueType.INT,
  });

  const publish = instrument.span(
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
    fn,
  );

  // Counted once the transport took them, so this keeps agreeing with the
  // manager's own `published` counter instead of drifting on every rejection.
  return publish.then((value) => {
    published.add(count, { [QUEUE_NAME]: target.queue, [QUEUE_JOB]: target.job });

    return value;
  });
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
  return instrument.spanFrom(
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
    extractTraceContext(headers),
    fn,
  );
}

/**
 * Counts the outcome of one attempt.
 *
 * @param target - Queue and job the attempt was for
 * @param outcome - How the attempt ended
 */
export function countOutcome(target: { queue: string; job: string }, outcome: string): void {
  instrument
    .counter('vercube.queue.processed', {
      description: 'Job attempts by outcome.',
      unit: '{attempt}',
      valueType: ValueType.INT,
    })
    .add(1, { [QUEUE_NAME]: target.queue, [QUEUE_JOB]: target.job, [QUEUE_OUTCOME]: outcome });

  instrument.activeSpan()?.setAttribute(QUEUE_OUTCOME, outcome);
}
