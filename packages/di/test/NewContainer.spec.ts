/**
 * These tests are simiplar to "Container.spec.ts" but here we test strictly new container API. I've used
 * this to TDD my way towards working IOC container.
 *
 * The old Container.spec.ts measures backward compatiblity between new & old container.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Container, IOC, Identity, Inject, InjectOptional } from '../src';

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

/**
 * Tests for identity-based injections.
 */
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

class MyClassWithDeprecatedDecorator {}

describe('[Framework][IOC] Container', () => {

  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('should allow new container to be created', () => {
     
    expect(() => { new Container(); }).not.toThrow();
  });

  it('should allow to get keys', () => {
    container.bind(MyClass);
    container.bind(MyClassWithDep);

    const keys = container.servicesKeys;
    expect(keys.length).toEqual(3); // 3 because Container is always bind
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

  it('should ignore deprecated @Injectable() decorator', () => {
    container.bind(MyClassWithDeprecatedDecorator);
    const instance = container.get(MyClassWithDeprecatedDecorator);
    expect(instance).toBeTruthy();
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

  it('should work properly for static injects', () => {
    container = new Container({ injectMethod: IOC.InjectMethod.STATIC });
    container.bind(MyClass);
    container.bind(MyClassWithDep);

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

});
