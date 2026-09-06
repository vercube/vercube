import { metrics, trace, ValueType } from '@opentelemetry/api';
import { UnauthorizedError } from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { AuthProvider } from '../Services/AuthProvider';
import type { AuthTypes } from '../Types/AuthTypes';
import type { Counter } from '@opentelemetry/api';
import type { BaseMiddleware, MiddlewareOptions } from '@vercube/core';

/** Instrumentation scope reported for auth signals. */
const SCOPE = '@vercube/auth';

/** Lazily created outcome counter. */
let outcomes: Counter | undefined;

/**
 * Records the outcome of one authentication attempt.
 *
 * Recorded on the request span rather than as a span of its own: the check is
 * part of serving the request, not a separate operation, and an extra span per
 * request for something that usually takes microseconds buys nothing. No
 * principal, token or header ever leaves this function.
 *
 * @param {string} outcome - `allowed`, `denied` or `unconfigured`
 * @returns {void}
 */
function recordOutcome(outcome: string): void {
  trace.getActiveSpan()?.addEvent('auth.decision', { 'vercube.auth.outcome': outcome });

  outcomes ??= metrics.getMeter(SCOPE).createCounter('vercube.auth.decisions', {
    description: 'Authentication decisions by outcome.',
    unit: '{decision}',
    valueType: ValueType.INT,
  });

  outcomes.add(1, { 'vercube.auth.outcome': outcome });
}

/**
 * Middleware for auth
 * @implements {BaseMiddleware}
 * @description authorizes incoming request
 * @example
 * const middleware = new AuthMiddleware();
 * await middleware.use(event);
 */
export class AuthMiddleware implements BaseMiddleware<AuthTypes.MiddlewareOptions> {
  @Inject(Container)
  private gContainer!: Container;

  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  @InjectOptional(AuthProvider)
  private gAuthProvider!: AuthProvider | null;

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {Request} request - The HTTP request to be processed
   * @param {Response} response - The HTTP response to be processed
   * @param {MiddlewareOptions} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onRequest(
    request: Request,
    response: Response,
    args: MiddlewareOptions<AuthTypes.MiddlewareOptions>,
  ): Promise<void> {
    let provider = this.gAuthProvider;

    if (args?.middlewareArgs?.provider) {
      provider = this.gContainer.getOptional(args.middlewareArgs.provider);
    }

    if (!provider) {
      this.gLogger?.warn('AuthMiddleware::AuthProvider is not registered');
      recordOutcome('unconfigured');
      return;
    }

    const authenticationError = await provider.validate(request, args.middlewareArgs);

    if (authenticationError) {
      recordOutcome('denied');
      throw new UnauthorizedError(authenticationError);
    }

    recordOutcome('allowed');
  }
}
