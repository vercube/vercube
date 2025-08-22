import { type BaseMiddleware, type MiddlewareOptions, UnauthorizedError } from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import type { AuthTypes } from '../Types/AuthTypes';
import { AuthProvider } from '../Services/AuthProvider';

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
  private gContainer: Container;

  @InjectOptional(Logger)
  private gLogger: Logger | null;

  @InjectOptional(AuthProvider)
  private gAuthProvider: AuthProvider | null;

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
      return;
    }

    const authenticationError = await provider.validate(request, args.middlewareArgs);

    if (authenticationError) {
      throw new UnauthorizedError(authenticationError);
    }
  }
}
