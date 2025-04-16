/**
 * Abstract class representing an authorization provider
 * Provides a common interface for different authorization implementations
 *
 * @abstract
 * @class AuthorizationProvider
 */

import { AuthTypes } from '../Types/AuthTypes';

export abstract class AuthProvider<U = unknown> {

  /**
   * Validate authentication
   * @param {Request} request - The request object
   * @param {AuthTypes.MiddlewareOptions} params - Additional parameters
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public abstract validate(request: Request, params?: AuthTypes.MiddlewareOptions): Promise<string | null> | string | null;

  /**
   * Get current user
   * @param {Request} request - The request object
   * @returns A promise of the current user or null if no user is authenticated
   */
  public abstract getCurrentUser(request: Request): Promise<U | null> | U | null;

}
 