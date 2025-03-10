import {
  type BaseMiddleware,
  type MiddlewareOptions,
  ForbiddenError,
} from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { AuthorizationTypes } from '../Types/AuthorizationTypes';
import { AuthorizationProvider } from '../Services/AuthorizationProvider';

/**
 * Middleware for authorization
 * @class AuthorizationMiddleware
 * @implements {BaseMiddleware}
 * @description Authorizes incoming request
 * @example
 * const middleware = new AuthorizationMiddleware<UserType>();
 * await middleware.use(event, args);
 */
export class AuthorizationMiddleware<T> implements BaseMiddleware {

  @Inject(Container)
  private gContainer: Container;

  @InjectOptional(AuthorizationProvider)
  private gAuthorizationProvider: AuthorizationProvider<T> | null;

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {Request} request - The HTTP request event.
   * @param {Response} response - The HTTP response event.
   * @param {MiddlewareOptions} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onRequest(
    request: Request,
    response: Response,
    args: MiddlewareOptions<{options: AuthorizationTypes.MiddlewareOptions, params: T}>,
  ): Promise<void> {
    let provider = this.gAuthorizationProvider;

    if (args.middlewareArgs?.options?.provider) {
      provider = this.gContainer.getOptional(args.middlewareArgs.options.provider);
    }

    if (!provider) {
      console.warn('AuthorizationMiddleware::AuthorizationProvider is not registered');
      return;
    }

    const authorizationError = await provider.authorize(request, args.middlewareArgs!.params);

    if (authorizationError) {
      throw new ForbiddenError(authorizationError);
    }
  }

}
