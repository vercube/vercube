import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { AuthenticationMiddleware } from '../Middleware/AuthenticationMiddleware';
import { AuthenticationTypes } from '../Types/AuthenticationTypes';

/**
 * Authentication decorator that adds middleware to protect routes or controllers
 * @param options Optional options for the authentication middleware
 * @returns A decorator function that adds authentication middleware to the target
 */
export function Authenticate(options?: AuthenticationTypes.MiddlewareOptions): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const meta = initializeMetadata((propertyName) ? target : target.prototype);

    if (propertyName) {
      initializeMetadataMethod(target, propertyName);
    }

    meta.__middlewares.push({
      target: propertyName ?? '__global__',
      type: 'before',
      priority: -999,
      middleware: AuthenticationMiddleware,
      args: {...options},
    });
  };
}
