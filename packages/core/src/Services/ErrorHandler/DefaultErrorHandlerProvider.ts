import { Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { InternalServerError } from '../../Errors/Http/InternalServerError';
import { HttpError } from '../../Errors/HttpError';
import { FastResponse } from '../../Types/CommonTypes';
import { ConfigProvider } from '../Introspection/Providers/ConfigProvider';
import { ErrorHandlerProvider } from './ErrorHandlerProvider';

/**
 * Default error handler provider
 *
 * @class DefaultErrorHandlerProvider
 */
export class DefaultErrorHandlerProvider extends ErrorHandlerProvider {
  @Inject(Logger)
  private gLogger!: Logger;

  @InjectOptional(ConfigProvider)
  private gConfigProvider!: ConfigProvider | null;

  /**
   * Handles an error that occurred during request processing
   *
   * @param error - The Error object containing error details
   * @returns Promise<Response> | Response - The response to be sent to the client
   */
  public handleError(error: Error): Response {
    // the real message can hold paths, queries or credentials: it only leaves
    // the process in dev mode
    const detail = this.gConfigProvider?.dev === true ? (error?.message ?? 'Internal server error') : undefined;
    const _internalError = new InternalServerError(detail ?? 'Internal Server Error');
    const status = resolveStatus(error);

    // check if the error is known error type and return it.
    if (error instanceof HttpError) {
      return new FastResponse(JSON.stringify({ ...error }, undefined, 2), {
        status,
        headers: JSON_HEADERS,
      });
    }

    this.gLogger.error(error);

    return new FastResponse(JSON.stringify({ ..._internalError }, undefined, 2), {
      status,
      headers: JSON_HEADERS,
    });
  }
}

/** Error bodies are JSON, and say so. */
const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({ 'content-type': 'application/json' });

/**
 * The status an error is answered with. An `HttpError` carries its own; any
 * other error only when it is an error status (400-599), as a `status` on a
 * third-party error may be anything, including a success or not a number.
 *
 * @param {Error} error - The error
 * @returns {number} The response status
 */
function resolveStatus(error: Error): number {
  const status = (error as { status?: unknown } | undefined)?.status;
  const valid = Number.isInteger(status) && (status as number) >= 400 && (status as number) <= 599;

  if (error instanceof HttpError) {
    // a subclass may still set nonsense, which FastResponse would throw on
    return Number.isInteger(status) && (status as number) >= 200 && (status as number) <= 599 ? (status as number) : 500;
  }

  return valid ? (status as number) : 500;
}
