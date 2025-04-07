import { describe, it, beforeEach, expect, vi } from 'vitest';
import { Container, Identity, Inject, InjectOptional } from '../src';
import TestClass, { ATestClass } from './utils/TestClass';

class MyClass {}
class MySubclass extends MyClass {}

class MyClassWithDep {
  @Inject(MyClass)
  public myClass: MyClass;
}

let singletonId: number = 0;
class MySingletonClass {
  public value: number = (singletonId++);
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

describe('[Framework][IOC] Container', () => {

  let container: Container;

  beforeEach(() => {
    container = new Container();
    singletonId = 0;
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

});
