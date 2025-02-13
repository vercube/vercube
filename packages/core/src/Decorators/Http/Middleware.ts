/* eslint-disable @typescript-eslint/no-empty-object-type */
import { BaseMiddleware } from '../../Services/Middleware/BaseMiddleware';
import { MetadataTypes } from '../../Types/MetadataTypes';

interface MiddlewareDecoratorParams extends Omit<MetadataTypes.Middleware, 'middleware'> {
}


export function Middleware(middleware: typeof BaseMiddleware, opts?: MiddlewareDecoratorParams): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const ctx = ((propertyName) ? target : target.prototype) as MetadataTypes.Metadata;

    ctx.__metadata = {
      ...ctx?.__metadata,
      __middlewares: [
        ...(ctx?.__metadata?.__middlewares ?? []),
        {
          target: propertyName ?? '__global__',
          type: opts?.type ?? 'before',
          priority: opts?.priority ?? 999, // default priority is 999 to ensure it runs last
          middleware,
        },
      ],
    };
  };
}