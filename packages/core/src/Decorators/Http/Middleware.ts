import { BaseMiddleware } from '../../Services/Middleware/BaseMiddleware';
import { addMetadataMiddleware, initializeMetadata } from '../../Utils/Utils';
import type { MetadataTypes } from '../../Types/MetadataTypes';

interface MiddlewareDecoratorParams<T> extends Omit<MetadataTypes.Middleware<T>, 'middleware' | 'target' | 'args'> {
  args?: T;
}

/**
 * Decorator that applies middleware to a class or method
 * @param middleware - The middleware class to apply
 * @param opts - Optional configuration parameters
 * @param opts.priority - Priority order for middleware execution (default: 999)
 * @param opts.args - Arguments passed to the middleware as `middlewareArgs`
 * @returns A decorator function that can be applied to classes or methods
 *
 * @example
 * ```typescript
 * @Middleware(AuthMiddleware)
 * class UserController {
 *   // ...
 * }
 *
 * // Or on a specific method, with arguments:
 * @Middleware(RoleMiddleware, { priority: 1, args: { roles: ['admin'] } })
 * public async createUser() {
 *   // ...
 * }
 * ```
 */
export function Middleware<T = any, U = any>(
  middleware: typeof BaseMiddleware<T, U>,
  opts?: MiddlewareDecoratorParams<T>,
): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const ctx = (propertyName ? target : target.prototype) as MetadataTypes.Metadata;
    const meta = initializeMetadata(ctx);

    addMetadataMiddleware(meta, {
      target: propertyName ?? '__global__',
      priority: opts?.priority ?? 999, // default priority is 999 to ensure it runs last
      middleware,
      args: opts?.args,
    });
  };
}
