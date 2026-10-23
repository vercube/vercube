import { initializeMetadata, initializeMetadataMethod, InternalServerError, RequestContext, setMetadataArg } from '@vercube/core';
import { BaseDecorator, Container, createDecorator, Inject, InjectOptional } from '@vercube/di';
import { AuthProvider } from '../Services/AuthProvider';
import { recallUser } from '../Utils/AuthenticatedUsers';
import type { RouterTypes } from '@vercube/core';

/**
 * Options for the User decorator
 * @interface UserDecoratorOptions
 */
interface UserDecoratorOptions {
  /**
   * Optional custom auth provider to use for retrieving the current user
   * If not provided, the default AuthProvider will be used
   */
  provider?: typeof AuthProvider<any>;
}

/**
 * Decorator class for injecting the current user into controller methods
 * Extends BaseDecorator to provide user injection functionality
 *
 * @class UserDecorator
 * @extends {BaseDecorator<UserDecoratorOptions>}
 */
class UserDecorator extends BaseDecorator<UserDecoratorOptions> {
  @Inject(Container)
  private gContainer!: Container;

  @InjectOptional(RequestContext)
  private gRequestContext!: RequestContext | null;

  /**
   * Called when the decorator is created.
   * Initializes metadata for the property and adds parameter information
   * to handle user injection in controller methods.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    // add parameter to metadata
    setMetadataArg(method, {
      idx: this.propertyIndex,
      type: 'custom',
      resolver: async (event: RouterTypes.RouterEvent) => {
        const providerKey = this.options?.provider ?? AuthProvider;

        // @Auth() with the same provider already authenticated this request
        const authenticated = recallUser(this.gRequestContext, providerKey);

        if (authenticated) {
          return authenticated.user;
        }

        const provider = this.gContainer.getOptional(providerKey);

        // fail closed, like AuthMiddleware: a handler must never mistake a
        // missing provider for an anonymous caller
        if (!provider) {
          throw new InternalServerError(`@User(): auth provider "${providerKey.name}" is not registered in the container`);
        }

        return provider.getCurrentUser(event.request);
      },
    });
  }
}

/**
 * Creates a decorator that injects the current user into controller methods
 *
 * @param {UserDecoratorOptions} [params] - Optional configuration for the decorator
 * @returns {Function} A decorator function that can be applied to controller method parameters
 *
 * @example
 * // Basic usage
 * async someMethod(@User() user: User) {
 *   // user is automatically injected
 * }
 *
 * @example
 * // With custom provider
 * async someMethod(@User() user: User) {
 *   // user is retrieved using CustomAuthProvider
 * }
 */
export function User(params?: UserDecoratorOptions): Function {
  return createDecorator(UserDecorator, params);
}
