import { SchedulerError } from '../Errors/SchedulerError';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** Milliseconds per unit a duration string may use. */
const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** A whole duration string: one or more `<number><unit>` parts, such as `1h30m`. */
const DURATION = /^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/;

/** One `<number><unit>` part of a duration string. */
const PART = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;

/**
 * Reads a duration option. A number is taken as milliseconds, a string as one or
 * more `<number><unit>` parts with units `ms`, `s`, `m`, `h` and `d`.
 *
 * @param value - The duration, as the user wrote it
 * @param option - Name of the option, reported when the value is invalid
 * @returns The duration in milliseconds
 * @throws {SchedulerError} When the value is negative, not finite or not a duration
 *
 * @example
 * ```ts
 * parseDuration('5m', 'interval'); // 300000
 * parseDuration('1h30m', 'timeout'); // 5400000
 * parseDuration(250, 'jitter'); // 250
 * ```
 */
export function parseDuration(value: SchedulerTypes.Duration, option: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw invalid(value, option);
    }

    return value;
  }

  const text = typeof value === 'string' ? value.trim() : '';

  if (!DURATION.test(text)) {
    throw invalid(value, option);
  }

  let total = 0;

  for (const [, amount, unit] of text.matchAll(PART)) {
    total += Number(amount) * UNITS[unit];
  }

  return Math.round(total);
}

/**
 * Writes milliseconds back as the shortest duration string, for logs and listings.
 *
 * @param ms - Duration in milliseconds
 * @returns The duration, such as `5m` or `1h30m`
 */
export function formatDuration(ms: number): string {
  const rounded = Math.round(ms);

  if (rounded === 0) {
    return '0ms';
  }

  const parts: string[] = [];
  let rest = rounded;

  for (const unit of ['d', 'h', 'm', 's', 'ms']) {
    const size = UNITS[unit];

    if (rest >= size) {
      const amount = Math.floor(rest / size);

      parts.push(`${amount}${unit}`);
      rest -= amount * size;
    }
  }

  return parts.join('');
}

/**
 * Builds the error of an invalid duration.
 *
 * @param value - The rejected value
 * @param option - Name of the option
 * @returns The error to throw
 */
function invalid(value: unknown, option: string): SchedulerError {
  return new SchedulerError(
    `Invalid duration ${JSON.stringify(value)} for "${option}", use milliseconds or a string such as '30s', '5m', '1h' or '1d'`,
    'configure',
    undefined,
    { option },
    false,
  );
}
