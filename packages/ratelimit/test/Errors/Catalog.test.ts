import { getErrorGuidance } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { parseDuration, RateLimitError, RateLimitErrors } from '../../src';
import { validate } from '../../src/Services/RateLimitManager';
import { withRateLimit } from '../../src/Testing';

/**
 * Runs a function and returns what it threw.
 *
 * @param run - The function expected to throw
 * @returns The thrown value
 */
function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the call to throw');
}

describe('RateLimitErrors', () => {
  it('describes a duration that cannot be read', () => {
    const error = thrownBy(() => parseDuration('soon' as never, 'window')) as RateLimitError;

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.name).toBe('RateLimitError');
    expect(error.message).toBe(`Invalid duration "soon" for "window", use milliseconds or a string such as '30s', '1m' or '1h'`);
    expect(error.operation).toBe('configure');
    expect(error.metadata).toEqual({ option: 'window' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_RATELIMIT_DURATION_INVALID');
  });

  it.each([
    [{ limit: 0 }, 'rateLimit: limit must be a positive integer, got 0', 'VERCUBE_RATELIMIT_LIMIT_INVALID'],
    [
      { algorithm: 'token' },
      `rateLimit: algorithm must be 'fixed' or 'sliding', got "token"`,
      'VERCUBE_RATELIMIT_ALGORITHM_INVALID',
    ],
    [
      { onStorageError: 'retry' },
      `rateLimit: onStorageError must be 'allow' or 'deny', got "retry"`,
      'VERCUBE_RATELIMIT_ON_STORAGE_ERROR_INVALID',
    ],
    [{ key: 'ip' }, 'rateLimit: key must be a function', 'VERCUBE_RATELIMIT_KEY_NOT_FUNCTION'],
    [{ name: '' }, 'rateLimit: name must not be empty', 'VERCUBE_RATELIMIT_NAME_EMPTY'],
    [{ priority: Number.NaN }, 'rateLimit: priority must be a number', 'VERCUBE_RATELIMIT_PRIORITY_INVALID'],
    [
      { trustProxy: -1 },
      'rateLimit: trustProxy must be a boolean or a number of proxies, got -1',
      'VERCUBE_RATELIMIT_TRUST_PROXY_INVALID',
    ],
  ])('gives the invalid option %o a code of its own', (options, message, code) => {
    const error = thrownBy(() => validate({ name: 'login', ...options } as never, 'rateLimit')) as RateLimitError;

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toBe(message);
    expect(error.operation).toBe('configure');
    expect(error.metadata).toEqual({ name: 'name' in options ? options.name : 'login' });
    expect(getErrorGuidance(error)?.code).toBe(code);
  });

  it('keeps the plain error of the testing extension', () => {
    const error = thrownBy(() => withRateLimit().manager) as Error;

    expect(error.constructor).toBe(Error);
    expect(error.message).toBe('withRateLimit() is not set up yet: pass it to createTestApp({ extensions }) first.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_RATELIMIT_TESTING_NOT_SET_UP');
  });

  it('answers a limited request and a storage that is down with the same HTTP errors', () => {
    const limited = RateLimitErrors.LIMIT_EXCEEDED();
    const unavailable = RateLimitErrors.STORAGE_UNAVAILABLE();

    expect(limited.name).toBe('TooManyRequestsError');
    expect(limited.status).toBe(429);
    expect(limited.message).toBe('Too many requests');
    expect(unavailable.name).toBe('ServiceUnavailableError');
    expect(unavailable.status).toBe(503);
    expect(unavailable.message).toBe('Rate limit storage unavailable');
  });
});
