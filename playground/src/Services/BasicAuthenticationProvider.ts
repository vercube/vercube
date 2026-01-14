import { timingSafeEqual } from 'node:crypto';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { AuthProvider } from '@vercube/auth';
import type { MaybePromise } from '@vercube/core';

/**
 * @deprecated Basic authentication is deprecated due to security concerns.
 * Please use more secure authentication mechanisms such as JWT or OAuth.
 * This implementation uses timing-safe comparison to prevent timing attacks,
 * but basic auth itself transmits credentials that can be easily intercepted.
 */
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

    // Use timing-safe comparison to prevent timing attacks
    const expectedUser = 'test';
    const expectedPass = 'test';

    // Ensure both strings are the same length for timingSafeEqual
    const userMatches = user.length === expectedUser.length && timingSafeEqual(Buffer.from(user), Buffer.from(expectedUser));
    const passMatches = pass.length === expectedPass.length && timingSafeEqual(Buffer.from(pass), Buffer.from(expectedPass));

    if (!userMatches || !passMatches) {
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
