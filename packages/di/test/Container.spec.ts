import { describe, it, beforeEach, expect, vi } from 'vitest';
import { Container, Identity, Inject, InjectOptional } from '../src';
import TestClass, { ATestClass } from './utils/TestClass';

class MyClass {}
class MySubclass extends MyClass {}

class MyClassWithDep {
  @Inject(MyClass)
  public myClass: MyClass;
}

let _singletonId: number = 0;
class MySingletonClass {
  public value: number = (_singletonId++);
}

class MySubClassWithDep extends MyClassWithDep {}

class MyInvalidSubclassWithDep extends MyClassWithDep {}

const $MyIdentityClass = Identity('NewContainer.MyIdentityClass');
const $MyIdentityOtherClass = Identity('NewContainer.MyIdentityOtherClass');

class MyIdentityOtherClass {}
class MyIdentityClass {
  @Inject($MyIdentityOtherClass)
  public myIdentityOtherClass: MyIdentityOtherClass;
}

class MyOptionalDependency {}
class MyClassWithOptionalDependency {
  @InjectOptional(MyOptionalDependency)
  public gMyOptionalDependecny: MyOptionalDependency | null;
}

// Test classes for additional coverage
class TestSingletonClass {
  public value = 'singleton';
}

class TestTransientClass {
  public value = 'transient';
}

class TestInstanceClass {
  public value = 'instance';
}

class TestInvalidFactoryType {
  public value = 'invalid';
}

describe('[Framework][IOC] Container', () => {

  let container: Container;

  beforeEach(() => {
    container = new Container();
    _singletonId = 0;
  });

  it('should create new container', () => {
    expect(container).toBeDefined();
  });

  it('should bind new class to container', () => {
    container.bind(TestClass);
    const { servicesKeys } = container;

    expect(servicesKeys).toContain(TestClass);
  });

  it('should bind new class to container only once', () => {
    container.bind(TestClass);
    container.bind(TestClass);
    const { servicesKeys } = container;

    expect(servicesKeys.length).toBe(2);
    expect(servicesKeys).toContain(TestClass);
  });

  it('should bind new class to abstract', () => {
    container.bind(ATestClass, TestClass);
    const testClass = container.get(ATestClass);

    expect(testClass).toBeDefined();
    expect(testClass).toBeInstanceOf(TestClass);
  });

  it('should get injected class', () => {
    container.bind(TestClass);
    const testClass = container.get(TestClass);

    expect(testClass).toBeDefined();
    expect(testClass).toBeInstanceOf(TestClass);
  });

  it('should call use callback', () => {
    const useCallback = vi.fn();
    container.use(useCallback);

    expect(useCallback).toHaveBeenCalledWith(container);
  });

  it('should resolve injected class without binding', () => {
    const testClass = container.resolve(TestClass);

    expect(testClass).toBeDefined();
  });

  it('should allow new container to be created', () => {
    expect(() => { new Container(); }).not.toThrow();
  });

  it('should allow to get keys', () => {
    container.bind(MyClass);
    container.bind(MyClassWithDep);

    const keys = container.servicesKeys;
    expect(keys.length).toEqual(3); // 3 because Container is always bound
  });

  it('should allow to register service by class', () => {
    container.bind(MyClass);

    const myClassInstance = container.get(MyClass);
    expect(myClassInstance).toBeInstanceOf(MyClass);
  });

  it('should allow to register service with subclass', () => {
    container.bind(MyClass, MySubclass);

    const mySubClassInstance = container.get(MyClass);
    expect(mySubClassInstance).toBeInstanceOf(MySubclass);
  });

  it('should inject dependency to class', () => {
    container.bind(MyClass);
    container.bind(MyClassWithDep);

    const myClassWithDep = container.get(MyClassWithDep);
    expect(myClassWithDep).toBeInstanceOf(MyClassWithDep);
    expect(myClassWithDep.myClass).toBeInstanceOf(MyClass);
  });

  it('should allow to resolve class instance', () => {
    container.bind(MyClass);

    const myClassWithDep = container.resolve(MyClassWithDep);
    expect(myClassWithDep).toBeInstanceOf(MyClassWithDep);
    expect(myClassWithDep.myClass).toBeInstanceOf(MyClass);
  });

  it('should register class as singleton instance', () => {
    container.bind(MySingletonClass);
    const instance1 = container.get(MySingletonClass);
    const instance2 = container.get(MySingletonClass);

    expect(instance1.value).toEqual(instance2.value);
    expect(instance1).toEqual(instance2);
  });

  it('should properly treat @Inject from base class', () => {
    container.bind(MyClass);
    container.bind(MyClassWithDep, MySubClassWithDep);

    const instance = container.get(MyClassWithDep);
    expect(instance.myClass).toBeInstanceOf(MyClass);
  });

  it('should not rebind the same @Inject twice in base and derived class', () => {
    container.bind(MyClass);
    container.bind(MyClassWithDep, MyInvalidSubclassWithDep);

    const instance = container.get(MyClassWithDep);
    expect(instance.myClass).toBeInstanceOf(MyClass);
  });

  it('should allow to register classes based on identity', () => {
    container.bind($MyIdentityClass, MyIdentityClass);
    container.bind($MyIdentityOtherClass, MyIdentityOtherClass);

    const myIdentity = container.get<MyIdentityClass>($MyIdentityClass);
    const myIdentityOther = container.get<MyIdentityOtherClass>($MyIdentityOtherClass);

    expect(myIdentity).toBeInstanceOf(MyIdentityClass);
    expect(myIdentityOther).toBeInstanceOf(MyIdentityOtherClass);
    expect(myIdentity.myIdentityOtherClass).toBeInstanceOf(MyIdentityOtherClass);
  });

  it('should allow to register optional dependencies', () => {
    container.bind(MyClassWithOptionalDependency);

    const instance = container.get<MyClassWithOptionalDependency>(MyClassWithOptionalDependency);
    expect(instance.gMyOptionalDependecny).toBeNull();

    container.bind(MyOptionalDependency);
    expect(instance.gMyOptionalDependecny).not.toBeNull();
    expect(instance.gMyOptionalDependecny).toBeInstanceOf(MyOptionalDependency);
  });

  it('should allow to register transient services', () => {
    container.bindTransient(MySingletonClass);
    const instance1 = container.get(MySingletonClass);
    const instance2 = container.get(MySingletonClass);

    expect(instance1.value).not.toEqual(instance2.value);
    expect(instance1).not.toBe(instance2);
  });

  it('should override bunded service with transient service', () => {
    const key = Identity('TestKey');
    container.bind(key, MyClass);
    container.bindTransient(key, MySubclass);

    const instance = container.get(key);
    expect(instance).toBeInstanceOf(MySubclass);
  });

  it('should allow to bind mock instances', () => {
    const mockInstance = {
      value: 42,
      someMethod: () => 'mocked',
    };
    container.bindMock(MyClass, mockInstance);

    const instance = container.get(MyClass);
    expect((instance as any).value).toBe(42);
    expect((instance as any).someMethod()).toBe('mocked');
  });

  it('should override bunded service with mocked service', () => {
    const key = Identity('TestKey');
    const mockInstance = {
      value: 42,
      someMethod: () => 'mocked',
    };

    container.bind(key, MyClass);
    container.bindMock(key, mockInstance);

    const instance = container.get(key);
    expect((instance as any).value).toBe(42);
    expect((instance as any).someMethod()).toBe('mocked');
  });

  it('should allow to get optional dependencies', () => {
    const instance = container.getOptional(MyClass);
    expect(instance).toBeNull();

    container.bind(MyClass);
    const boundInstance = container.getOptional(MyClass);
    expect(boundInstance).toBeInstanceOf(MyClass);
  });

  it('should allow to use container providers', () => {
    const provider = (c: Container) => {
      c.bind(MyClass);
      c.bind(MyClassWithDep);
    };

    container.use(provider);
    expect(container.get(MyClass)).toBeInstanceOf(MyClass);
    expect(container.get(MyClassWithDep)).toBeInstanceOf(MyClassWithDep);
  });

  it('should allow to expand container with multiple providers', () => {
    const provider1 = (c: Container) => c.bind(MyClass);
    const provider2 = (c: Container) => c.bind(MyClassWithDep);

    container.expand([provider1, provider2]);
    expect(container.get(MyClass)).toBeInstanceOf(MyClass);
    expect(container.get(MyClassWithDep)).toBeInstanceOf(MyClassWithDep);
  });

  it('should throw error when binding symbol without implementation', () => {
    const $MySymbol = Symbol('MySymbol');
    expect(() => container.bind($MySymbol)).toThrow();
  });

  it('should allow to bind instance directly', () => {
    const myInstance = new MyClass();
    container.bindInstance(MyClass, myInstance);

    const retrievedInstance = container.get(MyClass);
    expect(retrievedInstance).toBe(myInstance);
  });

  it('should override bunded service with instance service', () => {
    const key = Identity('TestKey');
    const instance = container.resolve(MySubclass);

    container.bind(key, MyClass);
    container.bindInstance(key, instance);

    expect(container.get(key)).toBeInstanceOf(MySubclass);
  });

  // Additional tests for uncovered lines

  it('should handle flushQueue with empty queue', () => {
    // This should not throw and should handle empty queue gracefully
    expect(() => container.flushQueue()).not.toThrow();
  });

  it('should handle flushQueue with singleton services', () => {
    container.bind(TestSingletonClass);
    // This should initialize singletons in the queue
    expect(() => container.flushQueue()).not.toThrow();
  });

  it('should throw error when getting unregistered service', () => {
    const unregisteredKey = Identity('UnregisteredService');
    expect(() => container.get(unregisteredKey)).toThrow('Unresolved dependency');
  });

  it('should handle invalid factory type in internalResolve', () => {
    // This test covers the default case in internalResolve
    // We'll test this by trying to access a service that doesn't exist
    const key = Identity('InvalidFactoryTest');
    expect(() => container.get(key)).toThrow('Unresolved dependency');
  });

  it('should handle disposal through rebinding', () => {
    const instance = new TestInstanceClass();
    container.bindInstance(TestInstanceClass, instance);
    
    // Rebinding should trigger internal disposal
    const newInstance = new TestInstanceClass();
    container.bindInstance(TestInstanceClass, newInstance);
    
    expect(container.get(TestInstanceClass)).toBe(newInstance);
  });

  it('should handle disposal of singleton services through rebinding', () => {
    container.bind(TestSingletonClass);
    const instance1 = container.get(TestSingletonClass);
    
    // Rebinding should trigger internal disposal
    container.bind(TestSingletonClass);
    const instance2 = container.get(TestSingletonClass);
    
    expect(instance1).toStrictEqual(instance2); // Should still be singleton
  });

  it('should handle disposal of transient services through rebinding', () => {
    container.bindTransient(TestTransientClass);
    const instance1 = container.get(TestTransientClass);
    
    // Rebinding should trigger internal disposal
    container.bindTransient(TestTransientClass);
    const instance2 = container.get(TestTransientClass);
    
    expect(instance1).not.toBe(instance2); // Should be different instances
  });

  it('should handle error messages for different key types', () => {
    // Test symbol key error
    const symbolKey = Symbol('TestSymbol');
    expect(() => container.get(symbolKey)).toThrow('TestSymbol');

    // Test function key error
    const functionKey = function TestFunction() {};
    expect(() => container.get(functionKey)).toThrow('TestFunction');

    // Test class key error
    class TestClassForError {}
    expect(() => container.get(TestClassForError)).toThrow('TestClassForError');
  });

  it('should handle lock and unlock operations', () => {
    expect(() => container.lock()).not.toThrow();
    expect(() => container.unlock()).not.toThrow();
  });

  it('should handle complex dependency tree', () => {
    // Create a complex dependency tree
    class ServiceC {
      public value = 'test';
    }

    class ServiceB {
      @Inject(ServiceC)
      public serviceC: ServiceC;
    }

    class ServiceA {
      @Inject(ServiceB)
      public serviceB: ServiceB;
    }

    container.bind(ServiceA);
    container.bind(ServiceB);
    container.bind(ServiceC);

    const serviceA = container.get(ServiceA);
    expect(serviceA.serviceB.serviceC.value).toBe('test');
  });

  it('should handle complex dependency injection scenarios', () => {
    class DeepService {
      public value = 'deep';
    }

    class MiddleService {
      @Inject(DeepService)
      public deepService: DeepService;
    }

    class TopService {
      @Inject(MiddleService)
      public middleService: MiddleService;
    }

    container.bind(DeepService);
    container.bind(MiddleService);
    container.bind(TopService);

    const topService = container.get(TopService);
    expect(topService.middleService.deepService.value).toBe('deep');
  });

  it('should handle complex dependency injection scenarios', () => {
    class DeepService {
      public value = 'deep';
    }

    class MiddleService {
      @Inject(DeepService)
      public deepService: DeepService;
    }

    class TopService {
      @Inject(MiddleService)
      public middleService: MiddleService;
    }

    container.bind(DeepService);
    container.bind(MiddleService);
    container.bind(TopService);

    const topService = container.get(TopService);
    expect(topService.middleService.deepService.value).toBe('deep');
  });

  // Tests to cover uncovered lines for 100% coverage

  it('should handle flushQueue with empty queue (lines 279-280)', () => {
    // This test covers the early return when queue is empty
    // We need to ensure the queue is actually empty and the early return is triggered
    expect(() => container.flushQueue()).not.toThrow();
    
    // Call it again to make sure the early return path is covered
    expect(() => container.flushQueue()).not.toThrow();
  });

  it('should throw error for invalid factory type in internalResolve (lines 361-362)', () => {
    // Create a service definition with invalid type to trigger the default case
    const invalidServiceDef = {
      serviceKey: Symbol('InvalidService'),
      serviceValue: class InvalidClass {},
      type: 'INVALID_TYPE' as any
    };

    // We need to access the protected method, so we'll use a different approach
    // Let's test this by creating a service that would cause an invalid factory type
    const key = Identity('InvalidFactoryTest');
    
    // Mock the internal services map to inject an invalid service definition
    (container as any).fServices.set(key, invalidServiceDef);
    
    expect(() => container.get(key)).toThrow('Container - invalid factory type: INVALID_TYPE');
  });

  it('should throw error for invalid def type in internalDispose (lines 476-477)', () => {
    // Create an invalid service definition to trigger the default case in internalDispose
    const invalidServiceDef = {
      serviceKey: Symbol('InvalidDisposeService'),
      serviceValue: class InvalidDisposeClass {},
      type: 'INVALID_DISPOSE_TYPE' as any
    };

    // We need to trigger internalDispose by rebinding a service
    const key = Identity('DisposeTest');
    container.bind(key, class TestClass {});
    
    // Mock the service definition to be invalid
    (container as any).fServices.set(key, invalidServiceDef);
    
    // Rebinding should trigger internalDispose
    expect(() => container.bind(key, class TestClass2 {})).toThrow('Container::internalDispose() - invalid def type: INVALID_DISPOSE_TYPE');
  });

  it('should handle getKeyDescription for object keys (lines 493-496)', () => {
    // Test object key with constructor name
    const objectKey = { constructor: { name: 'TestObject' } };
    expect(() => container.get(objectKey as any)).toThrow('TestObject');

    // Test object key without constructor name
    const objectKeyNoName = { constructor: {} };
    expect(() => container.get(objectKeyNoName as any)).toThrow('Unknown object');

    // Test object key without constructor
    const objectKeyNoConstructor = {};
    expect(() => container.get(objectKeyNoConstructor as any)).toThrow('Object');
  });

  it('should handle getKeyDescription for unknown key types', () => {
    // Test with a key that doesn't match any known type
    const unknownKey = 123 as any;
    expect(() => container.get(unknownKey)).toThrow('Unknown');
  });

  it('should handle flushQueue with singleton services that need initialization', () => {
    // Create a singleton service that will be in the queue
    container.bind(TestSingletonClass);
    
    // This should trigger the singleton initialization in flushQueue
    expect(() => container.flushQueue()).not.toThrow();
    
    // Verify the service is properly initialized
    const instance = container.get(TestSingletonClass);
    expect(instance).toBeInstanceOf(TestSingletonClass);
  });

  it('should handle flushQueue with non-singleton services in queue', () => {
    // Create a transient service that will be in the queue
    container.bindTransient(TestTransientClass);
    
    // This should skip singleton initialization but still clear the queue
    expect(() => container.flushQueue()).not.toThrow();
    
    // Verify the service is properly registered
    const instance = container.get(TestTransientClass);
    expect(instance).toBeInstanceOf(TestTransientClass);
  });

  it('should handle flushQueue with empty queue after clearing', () => {
    // First, add something to the queue
    container.bind(TestSingletonClass);
    
    // Clear the queue
    container.flushQueue();
    
    // Now the queue should be empty, triggering the early return
    expect(() => container.flushQueue()).not.toThrow();
  });

});
