import { RateLimitError } from '../Errors/RateLimitError';
import type { RateLimitTypes } from '../Types/RateLimitTypes';

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
 * Reads a window. A number is taken as milliseconds, a string as one or more
 * `<number><unit>` parts with units `ms`, `s`, `m`, `h` and `d`.
 *
 * Kept in this package rather than imported from `@vercube/scheduler`, which
 * would pull a cron library into every application that limits requests.
 *
 * @param value - The window, as the user wrote it
 * @param option - Name of the option, reported when the value is invalid
 * @returns The window in milliseconds, at least 1
 * @throws {RateLimitError} When the value is not a positive duration
 *
 * @example
 * ```ts
 * parseDuration('1m', 'window'); // 60000
 * parseDuration(500, 'window'); // 500
 * ```
 */
export function parseDuration(value: RateLimitTypes.Duration, option: string): number {
  let total: number;

  if (typeof value === 'number') {
    total = value;
  } else {
    const text = typeof value === 'string' ? value.trim() : '';

    if (!DURATION.test(text)) {
      throw invalid(value, option);
    }

    total = 0;

    for (const [, amount, unit] of text.matchAll(PART)) {
      total += Number(amount) * UNITS[unit];
    }
  }

  if (!Number.isFinite(total) || Math.round(total) < 1) {
    throw invalid(value, option);
  }

  return Math.round(total);
}

/**
 * Builds the error of an invalid duration.
 *
 * @param value - The rejected value
 * @param option - Name of the option
 * @returns The error to throw
 */
function invalid(value: unknown, option: string): RateLimitError {
  return new RateLimitError(
    `Invalid duration ${JSON.stringify(value)} for "${option}", use milliseconds or a string such as '30s', '1m' or '1h'`,
    'configure',
    { option },
  );
}
