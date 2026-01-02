/* eslint-disable @typescript-eslint/no-unused-vars */
import { AuthProvider } from '@vercube/auth';
import type { MaybePromise } from '@vercube/core';

export class BasicAuthenticationProvider extends AuthProvider {
  /**
   * Authenticates based on the HTTP event
   * @param request - The HTTP event containing the request
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public validate(request: Request): MaybePromise<string | null> {
    const [type, token] = (request.headers.get('Authorization') ?? '').split(' ');

    if (type !== 'Basic') {
      return 'Invalid authentication method';
    }

    const [user, pass] = Buffer.from(token, 'base64').toString().split(':');

    if (user !== 'test' || pass !== 'test') {
      return 'Invalid username of password';
    }

    return null;
  }

  /**
   * Get current user
   * @param request - The HTTP event containing the request
   * @returns A promise of the current user or null if no user is authenticated
   */
  public getCurrentUser(request: Request): MaybePromise<any | null> {
    return null;
  }
}
