import { BaseDecorator, createDecorator, Inject, Container } from '@vercube/di';
import {
  initializeMetadata,
  initializeMetadataMethod,
  type RouterTypes,
} from '@vercube/core';
import { AuthProvider } from '../Services/AuthProvider';

/**
 * Options for the User decorator
 * @interface UserDecoratorOptions
 */
interface UserDecoratorOptions {
  /**
   * Optional custom auth provider to use for retrieving the current user
   * If not provided, the default AuthProvider will be used
   */
  provider?: typeof AuthProvider;
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

  /**
   * Called when the decorator is created.
   * Initializes metadata for the property and adds parameter information
   * to handle user injection in controller methods.
   */
  public override created(): void {
    initializeMetadata(this.prototype);
    const method = initializeMetadataMethod(this.prototype, this.propertyName);

    // add parameter to metadata
    method.args.push({
      idx: this.propertyIndex,
      type: 'custom',
      resolver: async (event: RouterTypes.RouterEvent) => {
        const provider = this.options?.provider
          ? this.gContainer.getOptional(this.options.provider)
          : this.gContainer.getOptional(AuthProvider);

        if (!provider) {
          return null;
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
