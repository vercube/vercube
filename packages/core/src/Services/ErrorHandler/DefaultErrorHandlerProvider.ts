import { getErrorGuidance, Inject, InjectOptional } from '@vercube/di';
import { BaseLogger, Logger } from '@vercube/logger';
import { InternalServerError } from '../../Errors/Http/InternalServerError';
import { HttpError } from '../../Errors/HttpError';
import { EVLOG_REQUEST_LOGGER_KEY } from '../../Middleware/EvlogMiddleware';
import { FastResponse } from '../../Types/CommonTypes';
import { isSharedError } from '../../Utils/Errors';
import { ConfigProvider } from '../Introspection/Providers/ConfigProvider';
import { RequestContext } from '../Router/RequestContext';
import { ErrorHandlerProvider } from './ErrorHandlerProvider';
import type { EvlogRequestLogger } from '../../Middleware/EvlogMiddleware';
import type { ErrorGuidance } from '@vercube/di';

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

  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  /** The bodies of the errors that answer many requests, see `shareError()`. */
  private fSharedBodies: WeakMap<Error, string> = new WeakMap();

  /** The mode {@link fSharedBodies} was written in. */
  private fSharedDev: boolean | undefined;

  /**
   * Handles an error that occurred during request processing
   *
   * @param error - The Error object containing error details
   * @returns Promise<Response> | Response - The response to be sent to the client
   */
  public handleError(error: Error): Response {
    const dev = this.gConfigProvider?.dev === true;
    // readable in development, compact everywhere else
    const indent = dev ? 2 : undefined;
    const status = resolveStatus(error);
    const guidance = getErrorGuidance(error);

    // check if the error is known error type and return it.
    if (error instanceof HttpError) {
      if (guidance !== undefined) {
        // An HttpError is an answer, not a failure, so it is not logged as
        // one. What it says about its cause still belongs in the log.
        this.record(error, guidance, status);
      }

      // One instance answers every miss, so its body is written once. It is
      // written again when the mode changes, as the body depends on it.
      const shared = isSharedError(error);

      if (shared && this.fSharedDev !== dev) {
        this.fSharedDev = dev;
        this.fSharedBodies = new WeakMap();
      }

      let text = shared ? this.fSharedBodies.get(error) : undefined;

      if (text === undefined) {
        const body = copyFields(error);

        if (guidance !== undefined) {
          // the code is what a client branches on, so it is always sent
          body.code = guidance.code;
          addGuidance(body, guidance, dev);
        }

        text = JSON.stringify(body, undefined, indent);

        if (shared) {
          this.fSharedBodies.set(error, text);
        }
      }

      return new FastResponse(text, {
        status,
        headers: JSON_HEADERS,
      });
    }

    this.gLogger.error(error);

    // the real message can hold paths, queries or credentials: it only leaves
    // the process in dev mode
    const detail = dev ? (error?.message ?? 'Internal server error') : undefined;
    const internalError = new InternalServerError(detail ?? 'Internal Server Error');
    const body: Record<string, unknown> = { ...internalError };

    // the status the response is sent with, which an error may carry itself
    body.status = status;

    if (guidance !== undefined) {
      // The code of an unexpected failure names a part of the application, so
      // it stays in the log unless the error asks to be shown.
      if (dev || guidance.expose) {
        body.code = guidance.code;
      }

      addGuidance(body, guidance, dev);
    }

    return new FastResponse(JSON.stringify(body, undefined, indent), {
      status,
      headers: JSON_HEADERS,
    });
  }

  /**
   * Logs what an `HttpError` says about its cause. With request logging on it
   * goes into the wide event of the request being answered, so the request
   * and its explanation are one line. Without it the error is logged by
   * itself: a server error as an error, anything else at debug level, as an
   * application that turned request logging off did not ask for a line per
   * rejected request.
   *
   * @param {Error} error - The error being answered
   * @param {ErrorGuidance} guidance - Its guidance
   * @param {number} status - The status it is answered with
   * @returns {void}
   * @private
   */
  private record(error: Error, guidance: ErrorGuidance, status: number): void {
    const context = this.gRequestContext;
    const requestLogger = context?.active ? context.get<EvlogRequestLogger>(EVLOG_REQUEST_LOGGER_KEY) : undefined;

    // a request logger that cannot take the fields must not turn the answer into a failure
    if (typeof requestLogger?.set === 'function') {
      requestLogger.set({
        error: {
          code: guidance.code,
          why: guidance.why,
          fix: guidance.fix,
          link: guidance.link,
          internal: guidance.internal,
        },
      } as never);

      return;
    }

    if (status >= 500) {
      this.gLogger.error(error);
    } else if (this.logsDebug()) {
      this.gLogger.debug(error);
    }
  }

  /**
   * Whether a debug line can be written at all. Building one serializes the
   * error, which is most of what answering a 404 costs, so it is skipped when
   * the built-in logger is certain to drop it: the configuration names a
   * level above debug. Anything else is logged as before.
   *
   * @returns {boolean} False when the line would be dropped
   * @private
   */
  private logsDebug(): boolean {
    const level = this.gConfigProvider?.logLevel;

    return level === undefined || !ABOVE_DEBUG.has(level) || this.gLogger.constructor !== BaseLogger;
  }
}

/**
 * Adds `why`, `fix` and `link` to an error body in development, or when the
 * error says they may be shown. They describe the application from the inside,
 * which is what a developer needs and what a stranger should not get.
 *
 * @param {Record<string, unknown>} body - The error body being built
 * @param {ErrorGuidance} guidance - The guidance of the error
 * @param {boolean} dev - Whether the application runs in development
 * @returns {void}
 */
function addGuidance(body: Record<string, unknown>, guidance: ErrorGuidance, dev: boolean): void {
  if (!dev && guidance.expose !== true) {
    return;
  }

  for (const field of ['why', 'fix', 'link'] as const) {
    if (guidance[field] !== undefined) {
      body[field] = guidance[field];
    }
  }
}

/**
 * The enumerable fields of an error, which are its body. Written as a loop
 * and not as `{ ...error }`: the guidance of a described error is a set of
 * hidden fields, and V8 spreads an object that has those several times slower.
 *
 * @param {Error} error - The error being answered
 * @returns {Record<string, unknown>} Its fields, in the order they were set
 */
function copyFields(error: Error): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const keys = Object.keys(error);

  for (let index = 0; index < keys.length; index++) {
    body[keys[index]] = (error as unknown as Record<string, unknown>)[keys[index]];
  }

  return body;
}

/** The log levels at which a debug line is dropped. */
const ABOVE_DEBUG: ReadonlySet<string> = new Set(['info', 'warn', 'error', 'fatal']);

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
