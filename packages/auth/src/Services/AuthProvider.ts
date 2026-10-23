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
   * Called by `@User()` only when `@Auth()` with the same provider has not
   * already authenticated the request.
   *
   * @param {Request} request - The request object
   * @returns A promise of the current user or null if no user is authenticated
   */
  public abstract getCurrentUser(request: Request): Promise<U | null> | U | null;
}
