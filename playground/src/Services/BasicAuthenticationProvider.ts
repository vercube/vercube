import { timingSafeEqual } from 'node:crypto';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { AuthProvider } from '@vercube/auth';
import type { AuthTypes } from '@vercube/auth';
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
   * @returns The authenticated user, or an error when authentication fails
   */
  public validate(request: Request): MaybePromise<AuthTypes.ValidationResult> {
    const [type, token] = (request.headers.get('Authorization') ?? '').split(' ');

    if (type !== 'Basic') {
      return { error: 'Invalid authentication method' };
    }

    // Validate token exists
    if (!token) {
      return { error: 'Invalid authentication token' };
    }

    const decoded = Buffer.from(token, 'base64').toString();
    const [user, pass] = decoded.split(':');

    // Validate decoded credentials
    if (!user || !pass) {
      return { error: 'Invalid authentication credentials' };
    }

    // Use timing-safe comparison to prevent timing attacks
    const expectedUser = 'test';
    const expectedPass = 'test';

    // Ensure both strings are the same length for timingSafeEqual
    const userMatches = user.length === expectedUser.length && timingSafeEqual(Buffer.from(user), Buffer.from(expectedUser));
    const passMatches = pass.length === expectedPass.length && timingSafeEqual(Buffer.from(pass), Buffer.from(expectedPass));

    if (!userMatches || !passMatches) {
      return { error: 'Invalid username or password' };
    }

    return { user: null };
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
