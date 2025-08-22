import { describe, it, expect, beforeEach } from 'vitest';
import { GlobalMiddlewareRegistry } from '../../src/Services/Middleware/GlobalMiddlewareRegistry';
import { Container } from '@vercube/di';
import { TestMiddleware } from '../Utils/Middleware.mock';

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
});
