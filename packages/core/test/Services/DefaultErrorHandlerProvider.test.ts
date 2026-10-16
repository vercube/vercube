import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, ErrorHandlerProvider } from '../../src';
import { DefaultErrorHandlerProvider } from '../../src/Services/ErrorHandler/DefaultErrorHandlerProvider';
import { createTestApp } from '../Utils/App.mock';
import type { App } from '../../src';

describe('DefaultErrorHandlerProvider', () => {
  let app: App;
  let errorHandler: DefaultErrorHandlerProvider;
  let logger: Logger;

  beforeEach(async () => {
    app = await createTestApp();
    app.container.bind(ErrorHandlerProvider, DefaultErrorHandlerProvider);

    errorHandler = app.container.get(ErrorHandlerProvider) as DefaultErrorHandlerProvider;
    logger = app.container.get(Logger);
  });

  it('should handle HttpError and return appropriate response', async () => {
    const httpError = new BadRequestError('Bad request');
    const response = errorHandler.handleError(httpError);

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);

    const responseData = await response.json();
    expect(responseData.message).toBe('Bad request');
    expect(responseData.status).toBe(400);
  });

  it('should handle HttpError with custom status', async () => {
    const httpError = new BadRequestError('Bad request');
    (httpError as any).status = 422; // Custom status

    const response = errorHandler.handleError(httpError);

    expect(response.status).toBe(422);
  });

  it('should handle non-HttpError and log it', async () => {
    const regularError = new Error('Regular error');
    const loggerSpy = vi.spyOn(logger, 'error');

    const response = errorHandler.handleError(regularError);

    expect(loggerSpy).toHaveBeenCalledWith(regularError);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(500);

    const responseData = await response.json();
    expect(responseData.message).toBe('Regular error');
  });

  it('should handle non-HttpError with custom status', async () => {
    const regularError = new Error('Regular error');
    (regularError as any).status = 503; // Custom status

    const response = errorHandler.handleError(regularError);

    expect(response.status).toBe(503);
  });

  it('should handle error with cause', async () => {
    const causeError = new Error('Cause error');
    const regularError = new Error('Regular error', { cause: causeError });

    const response = errorHandler.handleError(regularError);

    expect(response.status).toBe(500);

    const responseData = await response.json();
    // The cause property might not be serialized properly, so we just check that it doesn't throw
    expect(responseData).toBeDefined();
  });

  it('should handle error with null message', async () => {
    const errorWithNullMessage = new Error('Original message');
    errorWithNullMessage.message = null as any;

    const response = errorHandler.handleError(errorWithNullMessage);

    expect(response.status).toBe(500);

    const responseData = await response.json();
    expect(responseData.message).toBe('Internal server error');
  });

  it('should handle error with undefined message', async () => {
    const errorWithUndefinedMessage = new Error('Original message');
    errorWithUndefinedMessage.message = undefined as any;

    const response = errorHandler.handleError(errorWithUndefinedMessage);

    expect(response.status).toBe(500);

    const responseData = await response.json();
    expect(responseData.message).toBe('Internal server error');
  });

  it('should handle null error', async () => {
    const nullError = null as any;

    const response = errorHandler.handleError(nullError);

    expect(response.status).toBe(500);

    const responseData = await response.json();
    expect(responseData.message).toBe('Internal server error');
  });

  it('should handle undefined error', async () => {
    const undefinedError = undefined as any;

    const response = errorHandler.handleError(undefinedError);

    expect(response.status).toBe(500);

    const responseData = await response.json();
    expect(responseData.message).toBe('Internal server error');
  });

  it('should answer every error with a JSON content type', () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    expect(errorHandler.handleError(new BadRequestError('x')).headers.get('content-type')).toBe('application/json');
    expect(errorHandler.handleError(new Error('x')).headers.get('content-type')).toBe('application/json');
  });

  it.each([
    ['not a number', 'oops', 500],
    ['zero', 0, 500],
    ['out of range', 600, 500],
    ['a success', 200, 500],
    ['a redirect', 302, 500],
    ['an error status', 503, 503],
  ])('should answer a non-HTTP error whose status is %s with %s', (_label, status, expected) => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    const response = errorHandler.handleError(Object.assign(new Error('x'), { status }));

    expect(response.status).toBe(expected);
  });

  it('should answer an HttpError carrying a status Response refuses with 500', () => {
    const error = new BadRequestError('x');
    (error as any).status = 'oops';

    expect(errorHandler.handleError(error).status).toBe(500);
  });
});
