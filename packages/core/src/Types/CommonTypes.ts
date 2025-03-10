import { MetadataTypes } from './MetadataTypes';

export type MaybePromise<T> = T | Promise<T>;

export interface MiddlewareOptions<T = any> {
  middlewareArgs?: T;
  methodArgs?: MetadataTypes.Arg[];
}
