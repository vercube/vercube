import { Cron } from 'croner';
import { SchedulerError } from '../Errors/SchedulerError';
import { formatDuration } from './Duration';

/** Shortest interval `@Every()` accepts. */
export const MIN_INTERVAL = 1000;

/**
 * Computes the occurrences of a job. Every instant is in UTC epoch milliseconds,
 * so every replica computes the same occurrences whatever its own time zone.
 */
export interface Schedule {
  /** Kind of schedule. */
  readonly kind: 'cron' | 'every';

  /** The cron expression, or the interval as `every 5m`. */
  readonly description: string;

  /** Time zone of a cron schedule. */
  readonly timezone?: string;

  /**
   * First occurrence strictly after an instant.
   *
   * @param after - Epoch milliseconds
   * @returns The occurrence, or null when the schedule has no more
   */
  next(after: number): number | null;

  /**
   * Last occurrence at or before an instant.
   *
   * @param at - Epoch milliseconds
   * @returns The occurrence, or null when the schedule has none before it
   */
  previous(at: number): number | null;
}

/**
 * Checks that a time zone is a valid IANA name.
 *
 * @param timezone - Time zone to check
 * @param job - Job it belongs to, reported in the error
 * @returns Nothing
 * @throws {SchedulerError} When the runtime does not know the time zone
 */
export function assertTimezone(timezone: string, job?: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new SchedulerError(
      `Unknown time zone "${timezone}"${job ? ` for job "${job}"` : ''}, use an IANA name such as 'Europe/Warsaw' or 'UTC'`,
      'register',
      undefined,
      { job, timezone },
      false,
    );
  }
}

/**
 * Builds the schedule of a cron expression. 5 fields (minute precision),
 * 6 fields (with seconds) and nicknames such as `@daily` are accepted.
 *
 * croner is used as a calculator only: its own timers are never started, since
 * the manager owns timing so a test clock can drive it.
 *
 * Around daylight saving changes, a time that does not exist runs once at the
 * first valid instant after it, and a time that happens twice runs once, on its
 * first pass.
 *
 * @param expression - The cron expression
 * @param timezone - IANA time zone the expression is read in
 * @param job - Job the schedule belongs to, reported in errors
 * @returns The schedule
 * @throws {SchedulerError} When the expression or the time zone is invalid
 */
export function cronSchedule(expression: string, timezone: string, job: string): Schedule {
  assertTimezone(timezone, job);

  let cron: Cron;

  try {
    cron = new Cron(expression, { timezone, paused: true });
  } catch (error) {
    throw new SchedulerError(
      `Invalid cron expression "${expression}" for job "${job}": ${(error as Error).message}`,
      'register',
      error as Error,
      { job, expression },
      false,
    );
  }

  return {
    kind: 'cron',
    description: expression,
    timezone,
    next: (after) => cron.nextRun(new Date(after))?.getTime() ?? null,
    // croner looks back from the start of the current second, exclusively,
    // so the reference is moved to the next second to include `at` itself
    previous: (at) => cron.previousRuns(1, new Date(Math.floor(at / 1000) * 1000 + 1000))[0]?.getTime() ?? null,
  };
}

/**
 * Builds the schedule of a fixed interval.
 *
 * Occurrences are aligned to the Unix epoch, landing on `k * interval + offset`,
 * rather than counted from when the process started. That is what makes every
 * replica compute the same occurrences, whenever it booted.
 *
 * @param interval - Interval in milliseconds
 * @param offset - Shift of the grid in milliseconds
 * @param job - Job the schedule belongs to, reported in errors
 * @returns The schedule
 * @throws {SchedulerError} When the interval is shorter than a second
 */
export function everySchedule(interval: number, offset: number, job: string): Schedule {
  if (interval < MIN_INTERVAL) {
    throw new SchedulerError(
      `Interval of job "${job}" is ${interval}ms, the shortest one allowed is ${MIN_INTERVAL}ms`,
      'register',
      undefined,
      { job, interval },
      false,
    );
  }

  const previous = (at: number): number => Math.floor((at - offset) / interval) * interval + offset;

  return {
    kind: 'every',
    description: `every ${formatDuration(interval)}${offset ? ` +${formatDuration(offset)}` : ''}`,
    next: (after) => previous(after) + interval,
    previous,
  };
}
