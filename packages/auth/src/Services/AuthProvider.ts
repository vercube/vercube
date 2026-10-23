/**
 * Abstract class representing an authorization provider
 * Provides a common interface for different authorization implementations
 *
 * @abstract
 * @class AuthorizationProvider
 */
import type { AuthTypes } from '../Types/AuthTypes';

export abstract class AuthProvider<U = unknown> {
  /**
   * Validate authentication
   *
   * The user returned on success is handed to `@User()` for the rest of the
   * request, so a route with both `@Auth()` and `@User()` loads it only once.
   *
   * @param {Request} request - The request object
   * @param {AuthTypes.MiddlewareOptions} params - Additional parameters
   * @returns `{ user }` if authentication is successful, `{ error }` otherwise.
   * An error string, or null on success, is still accepted but hands nothing to `@User()`
   */
  public abstract validate(
    request: Request,
    params?: AuthTypes.MiddlewareOptions,
  ): Promise<AuthTypes.ValidationResult<U>> | AuthTypes.ValidationResult<U>;

  /**
   * Get current user
   *
   * `@User()` skips it only when `@Auth()` with the same provider returned
   * `{ user }` earlier in the request. It is called otherwise: on a route
   * without `@Auth()`, after a legacy `null` from `validate()`, or with
   * `requestContext: false`, so every provider has to implement it.
   *
   * @param {Request} request - The request object
   * @returns A promise of the current user or null if no user is authenticated
   */
  public abstract getCurrentUser(request: Request): Promise<U | null> | U | null;
}
