/* eslint-disable @typescript-eslint/no-unused-vars */
import { AuthProvider, AuthTypes } from '@vercube/auth';
import type { MaybePromise } from '@vercube/core';

/**
 * Example Dummy auth provider
 */
export class DummyAuthorizationProvider extends AuthProvider {
  /**
   * Authenticates based on the HTTP event
   * @param request - The HTTP event containing the request
   * @param params - The parameters to authorize
   * @returns An error string or Promise of error string, null or Promise of null if authentication is successful
   */
  public validate(request: Request, params?: AuthTypes.MiddlewareOptions): MaybePromise<string | null> {
    if (params?.roles?.includes('admin')) {
      return 'Only available to admins';
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
