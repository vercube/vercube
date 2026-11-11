import { describe, expect, it } from 'vitest';
import { BadRequestError, getRouteErrors, HttpError, NotFoundError, Throws } from '../../src';
import type { ImplicitErrorRule } from '../../src';

class TooManyRequestsError extends HttpError {
  public static readonly status: number = 429;
}

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
});
