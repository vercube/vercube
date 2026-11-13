import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  getRouteErrors,
  HttpError,
  NotFoundError,
  ServiceUnavailableError,
  Throws,
  TooManyRequestsError,
} from '../../src';
import type { ImplicitErrorRule } from '../../src';

class Users {
  @Throws(NotFoundError)
  public get(): void {}
}

const summary = (errors: ReturnType<typeof getRouteErrors>) => errors.map(({ name, status, module }) => [status, name, module]);
const schema = { '~standard': { version: 1, vendor: 'test', validate: () => ({ value: 1 }) } } as const;

describe('getRouteErrors', () => {
  it('adds a 400 for a validated argument, a body or a form', () => {
    for (const args of [
      [{ type: 'query-param', validate: true, validationSchema: schema }],
      [{ type: 'body' }],
      [{ type: 'multipart-form-data' }],
    ]) {
      expect(summary(getRouteErrors(Users.prototype, 'get', { args, secured: false }))).toEqual([
        [400, 'BadRequestError', '@vercube/core'],
        [404, 'NotFoundError', undefined],
      ]);
    }

    // a schema that is switched off validates nothing
    expect(
      getRouteErrors(Users.prototype, 'get', {
        args: [{ type: 'query-param', validate: false, validationSchema: schema }],
        secured: false,
      }),
    ).toHaveLength(1);
  });

  it('adds a 401 and a 403 for a secured route', () => {
    expect(summary(getRouteErrors(undefined, 'get', { args: [], secured: true }))).toEqual([
      [401, 'UnauthorizedError', '@vercube/core'],
      [403, 'ForbiddenError', '@vercube/core'],
    ]);
  });

  it('takes rules as data', () => {
    const rateLimit: ImplicitErrorRule = {
      name: 'rate-limit',
      errors: () => [{ error: TooManyRequestsError, module: '@acme/rate-limit' }],
    };

    expect(summary(getRouteErrors(Users.prototype, 'get', { args: [], secured: false }, [rateLimit]))).toEqual([
      [404, 'NotFoundError', undefined],
      [429, 'TooManyRequestsError', '@acme/rate-limit'],
    ]);
  });

  it('lists a class declared and implicit once', () => {
    class Forms {
      @Throws(BadRequestError)
      public post(): void {}
    }

    expect(getRouteErrors(Forms.prototype, 'post', { args: [{ type: 'body' }], secured: false })).toHaveLength(1);
  });

  it('adds the errors a middleware running on the route declares', () => {
    class Limiter {
      public static readonly implicitErrors = [{ error: TooManyRequestsError, module: '@vercube/core' }];
    }

    class Plain {}

    expect(
      summary(getRouteErrors(undefined, 'get', { args: [], secured: false, middlewares: [Plain, Limiter, undefined] })),
    ).toEqual([[429, 'TooManyRequestsError', '@vercube/core']]);
  });
});

describe('TooManyRequestsError and ServiceUnavailableError', () => {
  it('answer with 429 and 503, statically and per instance', () => {
    const tooMany = new TooManyRequestsError('slow down');
    const unavailable = new ServiceUnavailableError();

    expect([TooManyRequestsError.status, tooMany.status, tooMany.name, tooMany.message]).toEqual([
      429,
      429,
      'TooManyRequestsError',
      'slow down',
    ]);
    expect([ServiceUnavailableError.status, unavailable.status, unavailable.name]).toEqual([503, 503, 'ServiceUnavailableError']);
    expect(tooMany).toBeInstanceOf(HttpError);
    expect(unavailable).toBeInstanceOf(ServiceUnavailableError);
  });
});
