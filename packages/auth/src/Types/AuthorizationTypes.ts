import { AuthorizationProvider } from '../Services/AuthorizationProvider';

export namespace AuthorizationTypes {
  export interface MiddlewareOptions<T = unknown> {
    provider?: typeof AuthorizationProvider<T>;
  }
}
