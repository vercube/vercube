import { initializeMetadata, initializeMetadataMethod } from '@vercube/core';
import { AuthMiddleware } from '../Middleware/AuthMiddleware';
import type { AuthTypes } from '../Types/AuthTypes';

/**
 * Authentication decorator that adds middleware to protect routes or controllers
 * @param options Optional options for the authentication middleware
 * @returns A decorator function that adds authentication middleware to the target
 */
export function Auth(options?: AuthTypes.MiddlewareOptions): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const meta = initializeMetadata(propertyName ? target : target.prototype);

    if (propertyName) {
      initializeMetadataMethod(target, propertyName);
    }

    meta.__middlewares.push({
      target: propertyName ?? '__global__',
      priority: -999,
      middleware: AuthMiddleware,
      args: {
        ...options,
      },
    });
  };
}
