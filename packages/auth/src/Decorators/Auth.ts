import type { MetadataTypes } from '@vercube/core';
import { AuthMiddleware } from '../Middleware/AuthMiddleware';

export function Auth(roles?: string[]): Function {
  return function internalDecorator(target: Function, propertyName?: string) {
    const ctx = ((propertyName) ? target : target.prototype) as MetadataTypes.Metadata;

    ctx.__metadata = {
      ...ctx?.__metadata,
      __middlewares: [
        ...(ctx?.__metadata?.__middlewares ?? []),
        {
          target: propertyName ?? '__global__',
          type: 'before',
          priority: -999,
          middleware: AuthMiddleware,
          args: { roles },
        },
      ],
    };
  };
}