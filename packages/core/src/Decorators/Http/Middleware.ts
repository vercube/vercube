/* eslint-disable @typescript-eslint/no-empty-object-type */
import { MetadataTypes } from '../../Types/MetadataTypes';
import { initializeMetadata } from '../../Utils/Utils';
import { AfterMiddleware, BeforeMiddleware } from '@vercube/core';
import { IOC } from '@vercube/di';

interface MiddlewareDecoratorParams extends Omit<MetadataTypes.Middleware, 'middleware' | 'target'> {
}

/**
 * Decorator that applies middleware to a class or method
 * @param middleware - The middleware class to apply
 * @param opts - Optional configuration parameters
 * @param opts.type - The type of middleware ('before' or 'after')
 * @param opts.priority - Priority order for middleware execution (default: 999)
 * @returns A decorator function that can be applied to classes or methods
 *
 * @example
 * ```typescript
 * @Middleware(AuthMiddleware)
 * class UserController {
 *   // ...
 * }
 *
 * // Or on a specific method:
 * @Middleware(ValidationMiddleware, { type: 'before', priority: 1 })
 * public async createUser() {
 *   // ...
 * }
 * ```
 */
export function Middleware(middleware: IOC.Newable<BeforeMiddleware>, opts?: MiddlewareDecoratorParams & {
  type: undefined
}): Function
export function Middleware(middleware: IOC.Newable<BeforeMiddleware>, opts: MiddlewareDecoratorParams & {
  type: 'before'
}): Function
export function Middleware(middleware: IOC.Newable<AfterMiddleware>, opts: MiddlewareDecoratorParams & {
  type: 'after'
}): Function
export function Middleware(middleware: IOC.Newable<BeforeMiddleware | AfterMiddleware>, opts?: MiddlewareDecoratorParams): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const ctx = ((propertyName) ? target : target.prototype) as MetadataTypes.Metadata;
    const meta = initializeMetadata(ctx);

    meta.__middlewares.push({
      target: propertyName ?? '__global__',
      type: opts?.type ?? 'before',
      priority: opts?.priority ?? 999, // default priority is 999 to ensure it runs last
      middleware,
    });
  };
}
