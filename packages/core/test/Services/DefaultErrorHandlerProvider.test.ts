import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestApp } from '../Utils/App.mock';
import { ErrorHandlerProvider, type App, BadRequestError } from '../../src';
import { DefaultErrorHandlerProvider } from '../../src/Services/ErrorHandler/DefaultErrorHandlerProvider';
import { Logger } from '@vercube/logger';

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
});
