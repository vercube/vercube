import { Container } from '@vercube/di';
import { MetadataResolver } from '../../core/src/Services/Metadata/MetadataResolver';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestClass, TestClass2, TestClass3, TestClass4 } from './Mock/TestClass.mock';
import { AuthorizationMiddleware, AuthenticationMiddleware } from '../src';

describe('[auth] Decorators', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
    container.bind(TestClass);
    container.bind(TestClass2);
    container.bind(TestClass3);
    container.bind(TestClass4);
    container.bind(MetadataResolver);
  });

  it('should define metadata for the class method', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass);
    const middlewares = service.resolveMiddlewares(Object.getPrototypeOf(instance), 'testMethod');


    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthorizationMiddleware);
    expect(middlewares[0].target).toBe('testMethod');
    expect(middlewares[0].priority).toBe(-998);
    expect((middlewares[0].args as any).params).toEqual({
      rules: ['admin'],
    });
  });

  it('should define metadata for the class', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass2);
    const middlewares = service.resolveMiddlewares(Object.getPrototypeOf(instance), '');


    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthorizationMiddleware);
    expect(middlewares[0].target).toBe('__global__');
    expect(middlewares[0].priority).toBe(-998);
    expect((middlewares[0].args as any).params).toEqual({
      rules: ['admin'],
    });
  });

  it('should define metadata for the class', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass3);
    const middlewares = service.resolveMiddlewares(Object.getPrototypeOf(instance), '');

    expect(middlewares).toBeDefined();
    expect(middlewares).toHaveLength(1);
    expect(middlewares[0].middleware).toBe(AuthenticationMiddleware);
    expect(middlewares[0].target).toBe('__global__');
    expect(middlewares[0].priority).toBe(-999);
  });

  it('should define metadata for the class method', () => {
    const service = container.get(MetadataResolver);
    const instance = container.get(TestClass4);
    const middlewares = service.resolveMiddlewares(Object.getPrototypeOf(instance), 'testMethod');

    expect(middlewares).toBeDefined();
  });

});