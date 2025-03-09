import { MetadataTypes } from './MetadataTypes';

export type MaybePromise<T> = T | Promise<T>;

export interface MiddlewareOptions<T = unknown> {
  middlewareArgs?: T;
  methodArgs?: MetadataTypes.Arg[];
}
