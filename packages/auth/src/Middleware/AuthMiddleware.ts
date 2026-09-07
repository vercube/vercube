import { UnauthorizedError } from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { createInstrument, ValueType } from '@vercube/telemetry/instrument';
import { AuthProvider } from '../Services/AuthProvider';
import type { AuthTypes } from '../Types/AuthTypes';
import type { BaseMiddleware, MiddlewareOptions } from '@vercube/core';

/**
 * Records auth signals.
 *
 * The toolkit comes from `@vercube/telemetry/instrument`, which is the only
 * place in the framework that speaks to OpenTelemetry directly.
 */
const instrument = createInstrument('@vercube/auth');

/** Attribute carrying how an authentication attempt ended. */
const AUTH_OUTCOME = 'vercube.auth.outcome';

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
  instrument.activeSpan()?.addEvent('auth.decision', { [AUTH_OUTCOME]: outcome });

  instrument
    .counter('vercube.auth.decisions', {
      description: 'Authentication decisions by outcome.',
      unit: '{decision}',
      valueType: ValueType.INT,
    })
    .add(1, { [AUTH_OUTCOME]: outcome });
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
