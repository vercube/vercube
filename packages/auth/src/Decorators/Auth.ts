import { initializeMetadata } from '@vercube/core';
import { AuthMiddleware } from '../Middleware/AuthMiddleware';

/**
 * Authentication decorator that adds middleware to protect routes or controllers
 * @param roles Optional array of roles that are allowed to access the decorated route/controller
 * @returns A decorator function that adds authentication middleware to the target
 */
export function Auth(roles?: string[]): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const meta = initializeMetadata((propertyName) ? target : target.prototype);

    meta.__middlewares.push({
      target: propertyName ?? '__global__',
      type: 'before',
      priority: -999,
      middleware: AuthMiddleware,
      args: { roles },
    });
  };
}
