import type {HttpEvent} from '@vercube/core';

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
   * @param params - Additional parameters
   * @param event - The HTTP event
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public abstract authorize(params: T, event: HttpEvent): Promise<string | null> | string | null;

}
