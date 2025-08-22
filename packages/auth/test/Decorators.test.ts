import { Container, initializeContainer } from '@vercube/di';
import { MetadataResolver, type RouterTypes } from '@vercube/core';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  TestClass,
  TestClass2,
  TestClass3,
  TestClass4,
  TestClass5,
  TestClass6,
  TestClass7,
  MockAuthProvider,
} from './Mock/TestClass.mock';
import { AuthMiddleware } from '../src/Middleware/AuthMiddleware';
import { AuthProvider } from '../src/Services/AuthProvider';

describe('[auth] Decorators', () => {
  let container: Container;

  beforeAll(() => {
    container = new Container();
    container.bind(TestClass);
    container.bind(TestClass2);
    container.bind(TestClass3);
    container.bind(TestClass4);
    container.bind(TestClass5);
    container.bind(TestClass6);
    container.bind(TestClass7);
    container.bind(MockAuthProvider);
    container.bind(MetadataResolver);

    initializeContainer(container);
  });

  it('should define metadata for the class method', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass);
    const middlewares = service.resolveMiddlewares(
      Object.getPrototypeOf(instance),
      'testMethod',
    );

    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);

    expect(middlewares[0].middleware).toBe(AuthMiddleware);
    expect(middlewares[0].target).toBe('testMethod');
    expect(middlewares[0].priority).toBe(-999);
    expect(middlewares[0].args as any).toEqual({});
  });

  it('should define metadata for the class', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass2);
    const middlewares = service.resolveMiddlewares(
      Object.getPrototypeOf(instance),
      '',
    );

    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthMiddleware);
    expect(middlewares[0].target).toBe('__global__');
    expect(middlewares[0].priority).toBe(-999);
    expect(middlewares[0].args).toEqual({
      roles: ['admin'],
    });
  });

  it('should define metadata for the class', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass3);
    const middlewares = service.resolveMiddlewares(
      Object.getPrototypeOf(instance),
      '',
    );

    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthMiddleware);
    expect(middlewares[0].target).toBe('__global__');
    expect(middlewares[0].priority).toBe(-999);
  });

  it('should define metadata for the class method', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass4);
    const middlewares = service.resolveMiddlewares(
      Object.getPrototypeOf(instance),
      'testMethod',
    );

    expect(middlewares).toBeDefined();
  });

  it('should define metadata for the class method with authentication', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass);
    const middlewares = service.resolveMiddlewares(
      Object.getPrototypeOf(instance),
      'testMethod',
    );

    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthMiddleware);
    expect(middlewares[0].target).toBe('testMethod');
    expect(middlewares[0].priority).toBe(-999);
  });

  it('should define metadata for the class with authentication', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass2);
    const middlewares = service.resolveMiddlewares(
      Object.getPrototypeOf(instance),
      '',
    );

    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthMiddleware);
    expect(middlewares[0].target).toBe('__global__');
    expect(middlewares[0].priority).toBe(-999);
  });

  it('should define metadata for the class method with user injection', async () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass5);
    const method = service.resolveMethod(
      Object.getPrototypeOf(instance),
      'testMethod',
    );
    const args = await service.resolveArgs(
      method.args,
      {} as RouterTypes.RouterEvent,
    );

    expect(args).toBeDefined();
    expect(args).toHaveLength(1);
    expect(args[0].type).toBe('custom');
    expect(args[0].idx).toBe(0);
  });

  it('should define metadata for the class method with custom auth provider', async () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass7);
    const method = service.resolveMethod(
      Object.getPrototypeOf(instance),
      'testMethod',
    );
    const args = await service.resolveArgs(
      method.args,
      {} as RouterTypes.RouterEvent,
    );

    expect(args).toBeDefined();
    expect(args).toHaveLength(1);
    expect(args[0].type).toBe('custom');
    expect(args[0].idx).toBe(0);
  });

  it('should handle case when provider is not found', async () => {
    // Create a new container without binding AuthProvider
    const testContainer = new Container();
    testContainer.bind(TestClass5);
    testContainer.bind(MetadataResolver);
    initializeContainer(testContainer);

    const service = testContainer.get(MetadataResolver);
    const instance = testContainer.get(TestClass5);
    const method = service.resolveMethod(
      Object.getPrototypeOf(instance),
      'testMethod',
    );

    // Get the resolver function
    const resolver = method.args[0]?.resolver;

    // Ensure resolver exists
    expect(resolver).toBeDefined();

    // Call the resolver with a mock event
    const result = await resolver!({ request: {} } as RouterTypes.RouterEvent);

    // Should return null when provider is not found
    expect(result).toBeNull();
  });

  it('should return user when provider is found', async () => {
    // Create a mock provider that returns a user
    const mockUser = { id: 1, name: 'Test User' };
    const mockProvider = {
      getCurrentUser: vi.fn().mockResolvedValue(mockUser),
      validate: vi.fn().mockResolvedValue(null),
    };

    // Create a new container with a mock provider
    const testContainer = new Container();
    container.bindInstance(Container, testContainer);
    testContainer.bindMock(AuthProvider, mockProvider);
    testContainer.bind(TestClass5);
    testContainer.bind(MetadataResolver);

    initializeContainer(testContainer);

    const service = testContainer.get(MetadataResolver);
    const instance = testContainer.get(TestClass5);
    const method = service.resolveMethod(
      Object.getPrototypeOf(instance),
      'testMethod',
    );

    // Get the resolver function
    const resolver = method.args[0]?.resolver;

    // Ensure resolver exists
    expect(resolver).toBeDefined();

    // Call the resolver with a mock event
    const result = await resolver!({ request: {} } as RouterTypes.RouterEvent);

    // Should return the user from the provider
    expect(result).toEqual(mockUser);
    expect(mockProvider.getCurrentUser).toHaveBeenCalledWith({});
  });

  it('should use custom provider when specified', async () => {
    // Create a new container with a custom provider
    const testContainer = new Container();
    container.bindInstance(Container, testContainer);
    testContainer.bind(TestClass7);
    testContainer.bind(MetadataResolver);

    // Create a mock provider that returns a user
    const mockUser = { id: 2, name: 'Custom User' };
    const mockProvider = {
      getCurrentUser: vi.fn().mockResolvedValue(mockUser),
      validate: vi.fn().mockResolvedValue(null),
    };

    // Bind the mock provider to MockAuthProvider
    testContainer.bindMock(MockAuthProvider, mockProvider);

    initializeContainer(testContainer);

    const service = testContainer.get(MetadataResolver);
    const instance = testContainer.get(TestClass7);
    const method = service.resolveMethod(
      Object.getPrototypeOf(instance),
      'testMethod',
    );

    // Get the resolver function
    const resolver = method.args[0]?.resolver;

    // Ensure resolver exists
    expect(resolver).toBeDefined();

    // Call the resolver with a mock event
    const result = await resolver!({ request: {} } as RouterTypes.RouterEvent);

    // Should return the user from the custom provider
    expect(result).toEqual(mockUser);
    expect(mockProvider.getCurrentUser).toHaveBeenCalledWith({});
  });
});
