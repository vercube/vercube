import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { AuthorizationTypes } from '../Types/AuthorizationTypes';
import { AuthorizationMiddleware } from '../Middleware/AuthorizationMiddleware';

/**
 * Authorization decorator that adds middleware to protect routes or controllers
 * @param params Parameters for the authorization middleware
 * @param options Optional options for the authorization middleware
 * @returns A decorator function that adds authorization middleware to the target
 */
export function Authorize<T>(params: T, options?: AuthorizationTypes.MiddlewareOptions<T>): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const meta = initializeMetadata((propertyName) ? target : target.prototype);

    if (propertyName) {
      initializeMetadataMethod(target, propertyName);
    }

    meta.__middlewares.push({
      target: propertyName ?? '__global__',
      priority: -998,
      middleware: AuthorizationMiddleware,
      args: {
        params,
        options,
      },
    });
  };
}
