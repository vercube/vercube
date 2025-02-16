import type {HttpEvent} from '@vercube/core';

/**
 * Abstract class representing an authentication provider
 * Provides a common interface for different authentication implementations
 *
 * @abstract
 * @class AuthenticationProvider
 */

export abstract class AuthenticationProvider {

  /**
   * Authenticates based on the HTTP event
   * @param event - The HTTP event
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public abstract authenticate(event: HttpEvent): Promise<string | null> | string | null;

}
