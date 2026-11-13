/** Middleware slot every rate limit entry uses, so the one closest to a route replaces the others. */
export const RATE_LIMIT_SLOT = 'vercube:ratelimit';

/** Priority of the rate limit middleware: right after `@Auth()` (-999). */
export const DEFAULT_PRIORITY = -900;

/** Prefix of every counter key in the storage. */
export const KEY_PREFIX = 'ratelimit';

/** Least time between two warnings about a failing storage mount, in milliseconds. */
export const STORAGE_WARNING_INTERVAL = 60_000;
