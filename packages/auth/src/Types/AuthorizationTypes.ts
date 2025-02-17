import { AuthorizationProvider } from '../Services/AuthorizationProvider';

export namespace AuthorizationTypes {
  export interface MiddlewareOptions {
    provider?: typeof AuthorizationProvider;
  }
}
