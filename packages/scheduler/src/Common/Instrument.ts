import { createInstrument, SpanKind, SpanStatusCode, ValueType } from '@vercube/telemetry/instrument';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { Span } from '@vercube/telemetry/instrument';

/**
 * Traces and counts scheduler activity.
 *
 * The toolkit comes from `@vercube/telemetry/instrument`, which is the only
 * place in the framework that speaks to OpenTelemetry directly, and it creates
 * no instrument until one is actually used.
 */
const instrument = createInstrument('@vercube/scheduler');

/** Attribute naming the job. */
export const SCHEDULER_JOB = 'vercube.scheduler.job';

/** Attribute carrying the scope of the job. */
export const SCHEDULER_SCOPE = 'vercube.scheduler.scope';

/** Attribute carrying what started the run. */
export const SCHEDULER_TRIGGER = 'vercube.scheduler.trigger';

/** Attribute carrying the occurrence, as an ISO instant. */
export const SCHEDULER_SCHEDULED_AT = 'vercube.scheduler.scheduled_at';

/** Attribute naming the replica that ran it. */
export const SCHEDULER_INSTANCE = 'vercube.scheduler.instance';

/** Attribute carrying the attempt the run ended on. */
export const SCHEDULER_ATTEMPT = 'vercube.scheduler.attempt';

/** Attribute carrying how the run ended. */
export const SCHEDULER_OUTCOME = 'vercube.scheduler.outcome';

/** What a run span is opened with. */
export interface RunTarget {
  job: string;
  scope: SchedulerTypes.Scope;
  trigger: SchedulerTypes.TriggerSource;
  scheduledAt: Date;
  instance: string;
}

/**
 * Traces one run of a job, or the enqueueing of one for a queue target, which
 * puts the queue's producer span, and through it the worker's run, in the same
 * trace. Skipped occurrences open no span: nothing ran.
 *
 * @param target - Job, scope, trigger, occurrence and replica of the run
 * @param fn - The run, handed its span to report the outcome on
 * @returns Whatever the run returned
 */
export function traceRun<T>(target: RunTarget, fn: (span: Span) => Promise<T>): Promise<T> {
  return instrument.span(
    `scheduler.run ${target.job}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        [SCHEDULER_JOB]: target.job,
        [SCHEDULER_SCOPE]: target.scope,
        [SCHEDULER_TRIGGER]: target.trigger,
        [SCHEDULER_SCHEDULED_AT]: target.scheduledAt.toISOString(),
        [SCHEDULER_INSTANCE]: target.instance,
      },
    },
    fn,
  );
}

/**
 * Reports how a traced run ended on its span. A run that failed or was aborted
 * marks the span failed, even though the manager records it instead of throwing.
 *
 * @param span - Span of the run
 * @param result - How the run ended
 */
export function reportRun(span: Span, result: SchedulerTypes.RunResult): void {
  span.setAttribute(SCHEDULER_OUTCOME, result.outcome);
  span.setAttribute(SCHEDULER_ATTEMPT, result.attempts);

  if (result.outcome === 'failed' || result.outcome === 'aborted') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: result.error?.message });

    if (result.error) {
      span.setAttribute('error.type', result.error.name);
    }
  }
}

/**
 * Counts how an occurrence ended on this replica, skips included: a dashboard
 * showing one `completed` and N-1 `skipped-claimed` per occurrence is what
 * proves exactly one replica ran it.
 *
 * @param job - Name of the job
 * @param outcome - How the occurrence ended here
 */
export function countRun(job: string, outcome: SchedulerTypes.RunEvent['outcome']): void {
  instrument
    .counter('vercube.scheduler.runs', {
      description: 'Occurrences by outcome, skips included.',
      unit: '{occurrence}',
      valueType: ValueType.INT,
    })
    .add(1, { [SCHEDULER_JOB]: job, [SCHEDULER_OUTCOME]: outcome });
}

/**
 * Records how long a run took.
 *
 * @param job - Name of the job
 * @param outcome - How it ended
 * @param ms - Duration in milliseconds
 */
export function recordDuration(job: string, outcome: SchedulerTypes.RunOutcome, ms: number): void {
  instrument
    .histogram('vercube.scheduler.duration', { description: 'How long runs took.', unit: 'ms' })
    .record(ms, { [SCHEDULER_JOB]: job, [SCHEDULER_OUTCOME]: outcome });
}

/**
 * Records how late a run started after its occurrence, jitter and slow claims included.
 *
 * @param job - Name of the job
 * @param ms - Delay in milliseconds
 */
export function recordLag(job: string, ms: number): void {
  instrument
    .histogram('vercube.scheduler.lag', { description: 'Delay between an occurrence and the start of its run.', unit: 'ms' })
    .record(Math.max(0, ms), { [SCHEDULER_JOB]: job });
}
