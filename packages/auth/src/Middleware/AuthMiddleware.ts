import { InternalServerError, RequestContext, UnauthorizedError } from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { createInstrument, ValueType } from '@vercube/telemetry/instrument';
import { AuthProvider } from '../Services/AuthProvider';
import { rememberUser } from '../Utils/AuthenticatedUsers';
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
 * @param {string} outcome - `allowed`, `denied`, `unconfigured` or `invalid`
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

  /**
   * Request context the authenticated user is handed to `@User()` through.
   */
  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {Request} request - The HTTP request to be processed
   * @param {Response} response - The HTTP response to be processed
   * @param {MiddlewareOptions} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   * @throws {InternalServerError} - If the auth provider is not registered in the container
   * @throws {UnauthorizedError} - If authentication fails
   */
  public async onRequest(
    request: Request,
    response: Response,
    args: MiddlewareOptions<AuthTypes.MiddlewareOptions>,
  ): Promise<void> {
    const providerKey = args?.middlewareArgs?.provider ?? AuthProvider;
    const provider = this.gContainer.getOptional(providerKey);

    if (!provider) {
      recordOutcome('unconfigured');
      throw new InternalServerError(`AuthMiddleware: auth provider "${providerKey.name}" is not registered in the container`);
    }

    const result: unknown = await provider.validate(request, args.middlewareArgs);

    // the shape providers returned before ValidationResult: `null` on success,
    // so there is no user to hand to @User()
    if (result === null) {
      recordOutcome('allowed');
      return;
    }

    // ...or an error message
    if (typeof result === 'string') {
      recordOutcome('denied');
      throw new UnauthorizedError(result);
    }

    if (typeof result === 'object' && Object.hasOwn(result, 'error')) {
      recordOutcome('denied');
      const { error } = result as { error: unknown };
      throw new UnauthorizedError(typeof error === 'string' ? error : undefined);
    }

    if (typeof result === 'object' && Object.hasOwn(result, 'user')) {
      recordOutcome('allowed');
      rememberUser(this.gRequestContext, providerKey, (result as { user: unknown }).user);
      return;
    }

    // anything else (`false`, `undefined`, a forgotten `return`, an object
    // without `user` or `error`) is a provider bug; fail closed, never open
    recordOutcome('invalid');
    throw new InternalServerError(
      `AuthMiddleware: auth provider "${providerName(provider, providerKey)}" returned an invalid validate() result (${describeValue(result)}); expected null, a string, { user } or { error }`,
    );
  }
}

/**
 * Names the provider in error messages.
 *
 * @param {object} provider - The resolved provider instance
 * @param {Function} providerKey - The key it was resolved with
 * @returns {string} The provider's class name
 */
function providerName(provider: object, providerKey: { readonly name: string }): string {
  return provider.constructor?.name || providerKey.name || 'unknown';
}

/**
 * Describes a value's type for an error message, without its contents (it may
 * hold a token or a principal).
 *
 * @param {unknown} value - The value to describe
 * @returns {string} e.g. `boolean`, `undefined`, `object with keys: ok`
 */
function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    return keys.length > 0 ? `object with keys: ${keys.join(', ')}` : 'empty object';
  }

  return typeof value;
}

// Marks the middleware as an authentication requirement, so tools that
// describe routes (introspection, the OpenAPI generator) find it with `isAuthMiddleware()` without importing this package.
Object.defineProperty(AuthMiddleware, Symbol.for('vercube.auth.middleware'), { value: true });
