import { AuthenticationProvider } from '@vercube/auth';

export namespace AuthenticationTypes {
  export interface MiddlewareOptions {
    provider?: typeof AuthenticationProvider;
  }
}
