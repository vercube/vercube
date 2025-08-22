import { MetadataTypes } from './MetadataTypes';

export { FastResponse } from 'srvx';

export type MaybePromise<T> = T | Promise<T>;

export interface MiddlewareOptions<T = any> {
  middlewareArgs?: T;
  methodArgs?: MetadataTypes.Arg[];
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
