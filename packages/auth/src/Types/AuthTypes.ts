import { AuthProvider } from '../Services/AuthProvider';

export namespace AuthTypes {
  /**
   * Middleware options for auth
   */
  export interface MiddlewareOptions {
    /**
     * Roles to authorize
     * @default []
     */
    roles?: string[];
    /**
     * Override provider to use for authorization
     * Default one is set inside of the IOC container
     */
    provider?: typeof AuthProvider<any>;
  }

  /**
   * Outcome of {@link AuthProvider.validate}.
   *
   * On success it carries the authenticated user, which `@User()` then receives
   * without asking the provider a second time. On failure it carries the
   * message the request is rejected with.
   *
   * An error message, or `null` on success, is still accepted from providers
   * written before this type existed. `@User()` then has no user to receive
   * and calls `getCurrentUser()` instead.
   */
  export type ValidationResult<U = unknown> = { user: U } | { error: string } | string | null;
}
