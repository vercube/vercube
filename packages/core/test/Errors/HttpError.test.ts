import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  InternalServerError,
  MethodNotAllowedError,
  NotAcceptableError,
  NotFoundError,
  UnauthorizedError,
} from '../../src';

const ERRORS = [
  {
    name: 'BadRequestError',
    status: 400,
    message: 'Bad Request',
    class: BadRequestError,
  },
  {
    name: 'UnauthorizedError',
    status: 401,
    message: 'Unauthorized',
    class: UnauthorizedError,
  },
  {
    name: 'ForbiddenError',
    status: 403,
    message: 'Forbidden',
    class: ForbiddenError,
  },
  {
    name: 'NotFoundError',
    status: 404,
    message: 'Not Found',
    class: NotFoundError,
  },
  {
    name: 'MethodNotAllowedError',
    status: 405,
    message: 'Method Not Allowed',
    class: MethodNotAllowedError,
  },
  {
    name: 'NotAcceptableError',
    status: 406,
    message: 'Not Acceptable',
    class: NotAcceptableError,
  },
  {
    name: 'InternalServerError',
    status: 500,
    message: 'Internal Server Error',
    class: InternalServerError,
  },
];

describe('HttpError', () => {
  describe.each(ERRORS)('HttpError', (error) => {
    it(`should have status ${error.status}`, () => {
      const errorInstance = new error.class();
      expect(errorInstance.status).toBe(error.status);
      expect(errorInstance.name).toBe(error.name);
      expect(errorInstance instanceof error.class).toBe(true);
      expect(errorInstance instanceof Error).toBe(true);
      expect(errorInstance instanceof HttpError).toBe(true);
    });

    it(`should have message ${error.message}`, () => {
      const errorInstance = new error.class('Custom Message');
      expect(errorInstance.message).toBe('Custom Message');
    });
  });

  describe('BadRequestError', () => {
    it('should have errors', () => {
      const errorInstance = new BadRequestError('Custom Message', {
        field: 'value',
      });

      expect((errorInstance as any).errors).toEqual({ field: 'value' });
    });
  });

  describe('HttpError', () => {
    it('should have status', () => {
      const errorInstance = new HttpError(400);
      expect(errorInstance.status).toBe(400);
    });

    it('should have message', () => {
      const errorInstance = new HttpError(400, 'Custom Message');
      expect(errorInstance.message).toBe('Custom Message');
    });

    it('should have stack', () => {
      const errorInstance = new HttpError(400);
      expect(errorInstance.stack).toBeDefined();
    });
  });
});
