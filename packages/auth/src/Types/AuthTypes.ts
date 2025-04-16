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
    provider?: typeof AuthProvider;
  }

}