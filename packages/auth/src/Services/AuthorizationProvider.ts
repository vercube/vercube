/**
 * Abstract class representing an authorization provider
 * Provides a common interface for different authorization implementations
 *
 * @abstract
 * @class AuthorizationProvider
 */

export abstract class AuthorizationProvider<T> {

  /**
   * Authorizes based on given params
   * @param {Request} request - The request object
   * @param {T} params - Additional parameters
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public abstract authorize(request: Request, params: T): Promise<string | null> | string | null;

}
