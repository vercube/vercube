import { ServiceUnavailableError, TooManyRequestsError } from '@vercube/core';
import { defineErrorCatalog } from '@vercube/di';
import { RateLimitError } from './RateLimitError';

/** What a call site hands to an error of an invalid option. */
interface Invalid {
  /** Where the options were written: `rateLimit`, or the decorator and its owner. */
  where: string;
  /** Name of the limit, kept on the error as `metadata.name`. */
  name: string | undefined;
}

/**
 * Builds the error of an invalid option.
 *
 * @param {string} message - Message of the error
 * @param {Invalid} params - Where the option was written
 * @returns {RateLimitError} The error
 */
function invalid(message: string, params: Invalid): RateLimitError {
  return new RateLimitError(message, 'configure', { name: params.name });
}

/**
 * The errors of the rate limit module.
 */
export const RateLimitErrors = defineErrorCatalog('VERCUBE_RATELIMIT', {
  LIMIT_EXCEEDED: {
    message: 'Too many requests',
    why: 'The client sent more requests than the `limit` allows within the `window`. The `retry-after` header of the response says when the next one is let through.',
    fix: 'Send fewer requests, or wait for the time in the `retry-after` header. To allow more, raise `limit` or shorten `window` on `@RateLimit()` or in the `rateLimit` config.',
    // raised for requests as a matter of course: the trace would only show the middleware
    stack: false,
    create: (message) => new TooManyRequestsError(message),
  },
  STORAGE_UNAVAILABLE: {
    message: 'Rate limit storage unavailable',
    why: 'The storage that holds the counters threw while a request was counted, and `onStorageError` is `deny`, so the request is answered with 503 and not let through uncounted.',
    fix: "Make the storage mount named by the `storage` option reachable, the log of `RateLimitManager` names it. Set `onStorageError: 'allow'` to let requests through while the storage is down.",
    // raised for requests as a matter of course: the trace would only show the middleware
    stack: false,
    create: (message) => new ServiceUnavailableError(message),
  },
  STORAGE_NOT_MOUNTED: {
    message: ({ mount }: { mount: string }) => `Storage "${mount}" is not mounted`,
    why: 'The `storage` option of a limit names a mount that the `StorageManager` does not have. Only the `default` mount is created on demand, a named one that is missing is treated as a mistake.',
    fix: 'Mount it at startup: `StorageManager.mount({ name, storage: RedisStorage, initOptions })`. Or correct the `storage` option on `@RateLimit()` or in the `rateLimit` config.',
    create: (message, params: { mount: string }) => new RateLimitError(message, 'storage', { mount: params.mount }),
  },
  LIMIT_OR_WINDOW_MISSING: {
    message: ({ name }: { name: string }) =>
      `Rate limit "${name}" needs a limit and a window, set them on @RateLimit() or in the rateLimit config`,
    why: 'A `@RateLimit()` without a `limit` or a `window` takes them from the defaults, and neither the `rateLimit` config nor the options of `RateLimitPlugin` set them.',
    fix: "Give both to the decorator, `@RateLimit({ limit: 100, window: '1m' })`, or set `limit` and `window` in the `rateLimit` config or in the options of `RateLimitPlugin`.",
    create: (message, params: { name: string }) => new RateLimitError(message, 'configure', { name: params.name }),
  },
  DURATION_INVALID: {
    message: ({ value, option }: { value: string; option: string }) =>
      `Invalid duration ${value} for "${option}", use milliseconds or a string such as '30s', '1m' or '1h'`,
    why: 'An option that takes a duration got a value that is neither a positive number of milliseconds nor a number followed by a unit.',
    fix: 'Pass milliseconds as a number, or a string such as `30s`, `1m` or `1h`, to the option the message names.',
    create: (message, params: { option: string }) => new RateLimitError(message, 'configure', { option: params.option }),
  },
  LIMIT_INVALID: {
    message: ({ where, value }: Invalid & { value: string }) => `${where}: limit must be a positive integer, got ${value}`,
    why: 'The `limit` option is the number of requests allowed per window. It is zero, negative, fractional or not a number.',
    fix: 'Set `limit` to an integer of 1 or more, for example `limit: 100`, in the place the message names.',
    create: invalid,
  },
  ALGORITHM_INVALID: {
    message: ({ where, value }: Invalid & { value: string }) => `${where}: algorithm must be 'fixed' or 'sliding', got ${value}`,
    why: 'The `algorithm` option chooses how a window is counted, and it has a value the module does not know.',
    fix: "Set `algorithm: 'fixed'` or `algorithm: 'sliding'` in the place the message names, or leave it out.",
    create: invalid,
  },
  ON_STORAGE_ERROR_INVALID: {
    message: ({ where, value }: Invalid & { value: string }) =>
      `${where}: onStorageError must be 'allow' or 'deny', got ${value}`,
    why: 'The `onStorageError` option says what happens to a request the storage could not count, and it has a value the module does not know.',
    fix: "Set `onStorageError: 'allow'` or `onStorageError: 'deny'` in the place the message names, or leave it out.",
    create: invalid,
  },
  KEY_NOT_FUNCTION: {
    message: ({ where }: Invalid) => `${where}: key must be a function`,
    why: 'The `key` option picks the client a request is counted for. It was given a value that is not a function.',
    fix: 'Pass a function that returns the client key, for example `key: (ctx) => ctx.ip`, or leave `key` out to count per client address.',
    create: invalid,
  },
  NAME_EMPTY: {
    message: ({ where }: Invalid) => `${where}: name must not be empty`,
    why: 'The `name` option identifies the counter of a limit in the storage and in metrics. It is an empty string.',
    fix: "Give `name` a value such as `name: 'login'`, or leave it out to have the counter named after the controller and the method.",
    create: invalid,
  },
  PRIORITY_INVALID: {
    message: ({ where }: Invalid) => `${where}: priority must be a number`,
    why: 'The `priority` option orders the rate limit among the other middlewares. It is `NaN`, infinite or not a number.',
    fix: 'Set `priority` to a finite number in the place the message names, or leave it out.',
    create: invalid,
  },
  TRUST_PROXY_INVALID: {
    message: ({ where, value }: Invalid & { value: string }) =>
      `${where}: trustProxy must be a boolean or a number of proxies, got ${value}`,
    why: 'The `trustProxy` option says how many proxies in front of the application may set the client address. It is neither a boolean nor a whole number of 0 or more.',
    fix: 'Set `trustProxy` in the `rateLimit` config (or the options of `RateLimitPlugin`) to `true`, `false`, or the number of proxies in front of the application, for example `trustProxy: 1`.',
    create: invalid,
  },
  TESTING_NOT_SET_UP: {
    message: 'withRateLimit() is not set up yet: pass it to createTestApp({ extensions }) first.',
    why: 'The extension returned by `withRateLimit()` was used before an application set it up. It finds the `RateLimitManager` only once `createTestApp()` has run with it.',
    fix: 'Pass the extension first: `const limits = withRateLimit(); await createTestApp({ extensions: [limits] })`, and use `limits` after that.',
  },
  TESTING_PLUGIN_ALREADY_REGISTERED: {
    message:
      'withRateLimit(): RateLimitPlugin is already registered, set the app-wide limit on it rather than on withRateLimit().',
    why: '`withRateLimit()` was given a `limit` and a `window` for an application that registers `RateLimitPlugin` itself. Registering the plugin a second time would replace the options the test set on it.',
    fix: 'Call `withRateLimit()` without `limit` and `window`, and set them where the test registers the plugin: `app.addPlugin(RateLimitPlugin, { limit, window })`.',
  },
});
