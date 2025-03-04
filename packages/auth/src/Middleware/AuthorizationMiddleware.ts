import {
  type BeforeMiddleware,
  type MiddlewareOptions,
  type HttpEvent,
  ForbiddenError,
} from '@vercube/core';
import { Container, Inject, InjectOptional } from '@vercube/di';
import { AuthorizationTypes } from '../Types/AuthorizationTypes';
import { AuthorizationProvider } from '../Services/AuthorizationProvider';

/**
 * Middleware for authorization
 * @class AuthorizationMiddleware
 * @implements {BeforeMiddleware}
 * @description Authorizes incoming request
 * @example
 * const middleware = new AuthorizationMiddleware<UserType>();
 * await middleware.use(event, args);
 */
export class AuthorizationMiddleware<T> implements BeforeMiddleware {

  @Inject(Container)
  private gContainer: Container;

  @InjectOptional(AuthorizationProvider)
  private gAuthorizationProvider: AuthorizationProvider<T> | null;

  /**
   * Middleware function that processes the HTTP event.
   *
   * @param {HttpEvent} event - The HTTP event to be processed.
   * @param {MiddlewareOptions} args - Additional arguments for the middleware
   * @returns {Promise<void>} - A promise that resolves when the processing is complete.
   */
  public async onRequest(
    event: HttpEvent,
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

    const authorizationError = await provider.authorize(args.middlewareArgs!.params, event);

    if (authorizationError) {
      throw new ForbiddenError(authorizationError);
    }
  }

}
