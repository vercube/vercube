import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  ForbiddenError,
  getThrownErrors,
  HttpError,
  InternalServerError,
  MethodNotAllowedError,
  NotAcceptableError,
  NotFoundError,
  PayloadTooLargeError,
  Throws,
  UnauthorizedError,
  UnsupportedMediaTypeError,
} from '../../../src';

class ConflictError extends HttpError {
  public static readonly status: number = 409;
}

class TeapotError extends HttpError {
  constructor() {
    super(418);
  }
}

const summary = (prototype: object, method: string) =>
  getThrownErrors(prototype, method).map(({ name, status }) => `${status} ${name}`);

describe('Throws Decorator', () => {
  it('gives every built-in error a static status equal to its instance status', () => {
    for (const ErrorClass of [
      BadRequestError,
      UnauthorizedError,
      ForbiddenError,
      NotFoundError,
      MethodNotAllowedError,
      NotAcceptableError,
      PayloadTooLargeError,
      UnsupportedMediaTypeError,
      InternalServerError,
    ]) {
      expect(ErrorClass.status).toBe(new ErrorClass().status);
    }
  });

  it('stores stacked declarations on the method', () => {
    class Users {
      @Throws(NotFoundError)
      @Throws(ConflictError, NotFoundError)
      public get(): void {}

      public other(): void {}
    }

    expect(summary(Users.prototype, 'get')).toEqual(['409 ConflictError', '404 NotFoundError']);
    expect(getThrownErrors(Users.prototype, 'other')).toEqual([]);
  });

  it('applies class declarations to every route, before the method ones', () => {
    @Throws(UnauthorizedError)
    class Users {
      @Throws(NotFoundError)
      public get(): void {}

      public list(): void {}
    }

    expect(summary(Users.prototype, 'get')).toEqual(['401 UnauthorizedError', '404 NotFoundError']);
    expect(summary(Users.prototype, 'list')).toEqual(['401 UnauthorizedError']);
  });

  it('takes an explicit status for a class without one', () => {
    class Users {
      @Throws(418, TeapotError)
      public brew(): void {}
    }

    expect(summary(Users.prototype, 'brew')).toEqual(['418 TeapotError']);
  });

  it('fails at decoration time for a class without a status', () => {
    expect(() => Throws(TeapotError)).toThrow(/TeapotError.*static `status`/);
    expect(() => Throws(200 as number, TeapotError)).toThrow(/not an error status/);
    expect(() => (Throws as (...args: unknown[]) => Function)(409)).toThrow(/must be followed by/);
  });

  it('does not leak a subclass declaration into its parent', () => {
    class Base {
      @Throws(NotFoundError)
      public get(): void {}
    }

    @Throws(ForbiddenError)
    class Child extends Base {
      @Throws(ConflictError)
      public override get(): void {}
    }

    expect(summary(Child.prototype, 'get')).toEqual(['403 ForbiddenError', '404 NotFoundError', '409 ConflictError']);
    expect(summary(Base.prototype, 'get')).toEqual(['404 NotFoundError']);
  });
});
