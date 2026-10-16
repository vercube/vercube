import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it } from 'vitest';
import { GlobalMiddlewareRegistry } from '../../src/Services/Middleware/GlobalMiddlewareRegistry';
import { ArgsMiddleware, TestMiddleware } from '../Utils/Middleware.mock';

describe('GlobalMiddlewareRegistry', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(GlobalMiddlewareRegistry);
  });

  it('should register global middleware', () => {
    const registry = container.get(GlobalMiddlewareRegistry);
    registry.registerGlobalMiddleware(TestMiddleware);

    expect(registry.middlewares.length).toBe(1);
    expect(registry.middlewares[0].middleware).toBe(TestMiddleware);
    expect(registry.middlewares[0].target).toBe('__global__');
  });

  it('should take the documented options without a target, with typed args', () => {
    const registry = container.get(GlobalMiddlewareRegistry);

    registry.registerGlobalMiddleware(TestMiddleware, { priority: 1 });
    registry.registerGlobalMiddleware(ArgsMiddleware, { args: { roles: ['admin'] } });

    // @ts-expect-error - roles has to be a string array
    registry.registerGlobalMiddleware(ArgsMiddleware, { args: { roles: 'admin' } });

    expect(registry.middlewares[0]).toMatchObject({ target: '__global__', priority: 1 });
  });
});
