import type { MetadataTypes } from '../../Types/MetadataTypes';
/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseMiddleware } from '../../Services/Middleware/BaseMiddleware';
import { initializeMetadata } from '../../Utils/Utils';

interface MiddlewareDecoratorParams extends Omit<MetadataTypes.Middleware, 'middleware' | 'target'> {}

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
export function Middleware(middleware: typeof BaseMiddleware, opts?: MiddlewareDecoratorParams): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const ctx = (propertyName ? target : target.prototype) as MetadataTypes.Metadata;
    const meta = initializeMetadata(ctx);

    meta.__middlewares.push({
      target: propertyName ?? '__global__',
      priority: opts?.priority ?? 999, // default priority is 999 to ensure it runs last
      middleware,
    });
  };
}
