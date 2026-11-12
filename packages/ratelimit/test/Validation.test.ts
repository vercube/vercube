import { Container } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { parseDuration, RateLimit, RateLimitError, RateLimitManager } from '../src';
import { counterKey } from '../src/Services/RateLimitManager';
import type { MetadataTypes } from '@vercube/core';

/** The rate limit entries a class collected. */
const entries = (target: Function): MetadataTypes.Middleware[] =>
  ((target.prototype as MetadataTypes.Metadata).__metadata?.__middlewares ?? []).filter(
    (entry) => entry.slot === 'vercube:ratelimit',
  );

describe('parseDuration', () => {
  it('should read milliseconds and duration strings', () => {
    expect(parseDuration(500, 'window')).toBe(500);
    expect(parseDuration('30s', 'window')).toBe(30_000);
    expect(parseDuration(' 1h30m ', 'window')).toBe(5_400_000);
    expect(parseDuration('1.5s', 'window')).toBe(1500);
    expect(parseDuration('1d', 'window')).toBe(86_400_000);
  });

  it('should refuse anything that is not a positive duration', () => {
    for (const value of [0, -1, Number.NaN, Infinity, '', '5', 'm', '1 minute', '0s', null]) {
      expect(() => parseDuration(value as never, 'window')).toThrow(RateLimitError);
    }
  });
});

describe('@RateLimit() validation', () => {
  it.each([
    [{ limit: 0, window: '1m' }, /limit must be a positive integer/],
    [{ limit: 1.5, window: '1m' }, /limit must be a positive integer/],
    [{ limit: 1, window: 'soon' }, /Invalid duration/],
    [{ limit: 1, window: '1m', algorithm: 'token' }, /algorithm must be/],
    [{ limit: 1, window: '1m', onStorageError: 'retry' }, /onStorageError must be/],
    [{ limit: 1, window: '1m', key: 'ip' }, /key must be a function/],
    [{ limit: 1, window: '1m', name: '' }, /name must not be empty/],
    [{ limit: 1, window: '1m', priority: Number.NaN }, /priority must be a number/],
  ])('should fail at startup for %o', (options, message) => {
    expect(() => {
      class Broken {
        @RateLimit(options as never)
        public route(): void {}
      }

      return Broken;
    }).toThrow(message);
  });

  it('should name the counter after the route or the controller, unless named', () => {
    @RateLimit({ limit: 1, window: '1m' })
    class Users {
      @RateLimit({ limit: 2, window: '1s' })
      public list(): void {}

      @RateLimit({ limit: 3, window: '1s', name: 'shared' })
      public get(): void {}
    }

    expect(entries(Users).map((entry) => [entry.target, (entry.args as { name: string }).name])).toEqual(
      expect.arrayContaining([
        ['__global__', 'Users'],
        ['list', 'Users.list'],
        ['get', 'shared'],
      ]),
    );
    expect(entries(Users).find((entry) => entry.target === 'list')).toMatchObject({
      priority: -900,
      args: { limit: 2, windowMs: 1000 },
    });
  });

  it('should keep a custom priority, and record an opt-out as a skip without args', () => {
    class Login {
      @RateLimit({ limit: 1, window: '1m', priority: -1000 })
      public post(): void {}

      @RateLimit(false)
      public get(): void {}
    }

    expect(entries(Login).find((entry) => entry.target === 'post')?.priority).toBe(-1000);
    expect(entries(Login).find((entry) => entry.target === 'get')).toMatchObject({ skip: true });
    expect(entries(Login).find((entry) => entry.target === 'get')?.args).toBeUndefined();
  });

  it('should leave the parent alone when a subclass sets its own controller-wide limit', () => {
    @RateLimit({ limit: 1, window: '1m' })
    class Parent {}

    @RateLimit({ limit: 5, window: '1m' })
    class Child extends Parent {}

    expect(entries(Parent).map((entry) => (entry.args as { limit: number }).limit)).toEqual([1]);
    expect(entries(Child).map((entry) => (entry.args as { limit: number }).limit)).toEqual([5]);
  });
});

describe('RateLimitManager', () => {
  const manager = (): RateLimitManager => {
    const container = new Container();

    container.bindInstance(Container, container);
    container.bind(RateLimitManager);

    return container.get(RateLimitManager);
  };

  it('should refuse invalid defaults', () => {
    expect(() => manager().configure({ limit: -1 })).toThrow(/rateLimit: limit must be a positive integer/);
    expect(() => manager().configure({ window: 'never' })).toThrow(RateLimitError);
  });

  it('should merge defaults and apply them to a declaration', () => {
    const instance = manager();

    instance.configure({ limit: 10, storage: 'redis' });
    instance.configure({ window: '1m', trustProxy: 1 });

    expect(instance.defaults).toEqual({ limit: 10, storage: 'redis', window: '1m', trustProxy: 1 });
    expect(instance.resolve({ name: 'a' })).toEqual({
      limit: 10,
      windowMs: 60_000,
      algorithm: 'fixed',
      key: undefined,
      storage: 'redis',
      onStorageError: 'allow',
      headers: true,
      name: 'a',
      trustProxy: 1,
    });
    expect(instance.resolve({ name: 'b', limit: 2, windowMs: 1000, storage: 'memory' })).toMatchObject({
      limit: 2,
      windowMs: 1000,
      storage: 'memory',
    });
  });

  it('should refuse a declaration that ends up without a limit or a window', () => {
    expect(() => manager().resolve({ name: 'Users.list', limit: 5 })).toThrow(/"Users.list" needs a limit and a window/);
  });

  it('should encode counter keys so a client cannot forge another counter', () => {
    expect(counterKey('Users.list', 'a:b', 7)).toBe('ratelimit:Users.list:a%3Ab:7');
  });
});
