import { type BaseMiddleware, type MiddlewareOptions, UnauthorizedError } from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { AuthenticationProvider } from '../Services/AuthenticationProvider';
import { AuthenticationTypes } from '../Types/AuthenticationTypes';
import { Logger } from '@vercube/logger';

/**
 * Middleware for authentication
 * @class AuthenticationMiddleware
 * @implements {BaseMiddleware}
 * @description Authenticates incoming request
 * @example
 * const middleware = new AuthenticationMiddleware();
 * await middleware.use(event);
 */
export class AuthenticationMiddleware implements BaseMiddleware<AuthenticationTypes.MiddlewareOptions> {

  @Inject(Container)
  private gContainer: Container;

  @InjectOptional(AuthenticationProvider)
  private gAuthenticationProvider: AuthenticationProvider | null;

  @InjectOptional(Logger)
  private gLogger: Logger | null;

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
    args: MiddlewareOptions<AuthenticationTypes.MiddlewareOptions>,
  ): Promise<void> {
    let provider = this.gAuthenticationProvider;

    if (args?.middlewareArgs?.provider) {
      provider = this.gContainer.getOptional(args.middlewareArgs.provider);
    }

    if (!provider) {
      this.gLogger?.warn('AuthenticationMiddleware::AuthenticationProvider is not registered');
      return;
    }

    const authenticationError = await provider.authenticate(request);

    if (authenticationError) {
      throw new UnauthorizedError(authenticationError);
    }
  }

}
