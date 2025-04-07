/**
 * Container dynamic expansion test functionality.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Container, Inject } from '../src';

class MyClass {}
class MyDynamicClass {}

class MyDynamicClassWithReverseDep {
  @Inject(MyClass)
  public myClass: MyClass;
}

class MyDynamicClassB {}
class MyDynamicClassA {
  @Inject(MyDynamicClassB)
  public myClassB: MyDynamicClassB;
}

describe('[Framework][IOC] Container', () => {

  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('should allow to expand IOC container in runtime', () => {
    container.bind(MyClass);
    const myClassInstance = container.get(MyClass);
    expect(myClassInstance).toBeInstanceOf(MyClass);

    container.expand((ctr) => {
      ctr.bind(MyDynamicClass);
    });

    const myDynamicClassInstance = container.get(MyDynamicClass);
    expect(myDynamicClassInstance).toBeInstanceOf(MyDynamicClass);
  });

  it('should properly inject dependencies in dynamically-injected resources', () => {
    container.bind(MyClass);
    const myClassInstance = container.get(MyClass);
    expect(myClassInstance).toBeInstanceOf(MyClass);

    container.expand((ctr) => {
      ctr.bind(MyDynamicClassWithReverseDep);
    });

    const myInstance = container.get(MyDynamicClassWithReverseDep);
    expect(myInstance).toBeInstanceOf(MyDynamicClassWithReverseDep);
    expect(myInstance.myClass).toBeInstanceOf(MyClass);
  });

  it('should properly inject dependencies that are dynamic as well', () => {

    container.bind(MyClass);
    const myClassInstance = container.get(MyClass);
    expect(myClassInstance).toBeInstanceOf(MyClass);

    container.expand((ctr) => {
      ctr.bind(MyDynamicClassA);
      ctr.bind(MyDynamicClassB);
    });

    const myInstanceA = container.get(MyDynamicClassA);
    expect(myInstanceA).toBeInstanceOf(MyDynamicClassA);
    expect(myInstanceA.myClassB).toBeInstanceOf(MyDynamicClassB);

  });

});
