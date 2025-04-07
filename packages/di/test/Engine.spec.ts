import { beforeEach, describe, expect, it } from 'vitest';
import { Container, IOC, Inject, InjectOptional } from '../src';
import { IOCEngine } from '../src/Domain/Engine';

describe('[Framework][IOC] Engine', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Dependency Registration', () => {
    class TestDependency {}
    class TestClass {
      @Inject(TestDependency)
      public dep!: TestDependency;
    }

    it('should register dependencies correctly', () => {
      const entry = IOCEngine.getEntryForClass(TestClass);
      expect(entry).not.toBeNull();
      expect(entry?.deps.length).toBe(1);
      expect(entry?.deps[0].dependency).toBe(TestDependency);
      expect(entry?.deps[0].propertyName).toBe('dep');
      expect(entry?.deps[0].type).toBe(IOC.DependencyType.STANDARD);
    });

    it('should get dependencies for an instance', () => {
      const instance = new TestClass();
      const deps = IOCEngine.getDeps(instance);
      expect(deps.length).toBe(1);
      expect(deps[0].dependency).toBe(TestDependency);
    });
  });

  describe('Dependency Injection', () => {
    class TestDependency {
      public value: string = 'test';
    }

    class TestClass {
      @Inject(TestDependency)
      public dep!: TestDependency;
    }

    class TestClassWithOptional {
      @InjectOptional(TestDependency)
      public optionalDep!: TestDependency | null;
    }

    beforeEach(() => {
      container.bind(TestDependency);
    });

    it('should inject dependencies lazily', () => {
      const instance = new TestClass();
      IOCEngine.injectDeps(container, instance, IOC.InjectMethod.LAZY);

      const descriptor = Object.getOwnPropertyDescriptor(instance, 'dep');
      expect(descriptor?.get).toBeDefined();
      expect(instance.dep).toBeInstanceOf(TestDependency);
      expect(instance.dep.value).toBe('test');
    });

    it('should inject dependencies statically', () => {
      const instance = new TestClass();
      IOCEngine.injectDeps(container, instance, IOC.InjectMethod.STATIC);

      const descriptor = Object.getOwnPropertyDescriptor(instance, 'dep');
      expect(descriptor?.get).toBeUndefined();
      expect(instance.dep).toBeInstanceOf(TestDependency);
      expect(instance.dep.value).toBe('test');
    });

    // it('should handle optional dependencies when not bound', () => {
    //   const instance = new TestClassWithOptional();
    //   IOCEngine.injectDeps(container, instance, IOC.InjectMethod.LAZY);
    //   expect(instance.optionalDep).toBeNull();
    // });

    it('should handle optional dependencies when bound', () => {
      const instance = new TestClassWithOptional();
      container.bind(TestDependency);
      IOCEngine.injectDeps(container, instance, IOC.InjectMethod.LAZY);
      expect(instance.optionalDep).toBeInstanceOf(TestDependency);
    });

    it('should handle optional dependencies with static injection', () => {
      const instance = new TestClassWithOptional();
      container.bind(TestDependency);
      IOCEngine.injectDeps(container, instance, IOC.InjectMethod.STATIC);
      expect(instance.optionalDep).toBeInstanceOf(TestDependency);
    });

    // it('should handle optional dependencies with null value', () => {
    //   const instance = new TestClassWithOptional();
    //   container.bindMock(TestDependency, { value: undefined });
    //   IOCEngine.injectDeps(container, instance, IOC.InjectMethod.LAZY);
    //   expect(instance.optionalDep).toBeNull();
    // });

    it('should throw error for invalid inject method', () => {
      const instance = new TestClass();
      expect(() => {
        IOCEngine.injectDeps(container, instance, 'invalid' as IOC.InjectMethod);
      }).toThrow('IOCEngine.injectDeps() - invalid inject method invalid');
    });
  });

  describe('Inheritance', () => {
    class BaseDependency {
      public baseValue: string = 'base';
    }

    class DerivedDependency {
      public derivedValue: string = 'derived';
    }

    class BaseClass {
      @Inject(BaseDependency)
      public baseDep!: BaseDependency;
    }

    class DerivedClass extends BaseClass {
      @Inject(DerivedDependency)
      public derivedDep!: DerivedDependency;
    }

    beforeEach(() => {
      container.bind(BaseDependency);
      container.bind(DerivedDependency);
    });

    it('should inject dependencies in derived classes', () => {
      const instance = new DerivedClass();
      IOCEngine.injectDeps(container, instance, IOC.InjectMethod.STATIC);

      expect(instance.baseDep).toBeInstanceOf(BaseDependency);
      expect(instance.derivedDep).toBeInstanceOf(DerivedDependency);
      expect(instance.baseDep.baseValue).toBe('base');
      expect(instance.derivedDep.derivedValue).toBe('derived');
    });

    it('should not override already injected dependencies', () => {
      const instance = new DerivedClass();
      const customDep = new DerivedDependency();
      customDep.derivedValue = 'custom';
      instance.derivedDep = customDep;

      IOCEngine.injectDeps(container, instance, IOC.InjectMethod.STATIC);
      expect(instance.derivedDep.derivedValue).toBe('custom');
    });
  });
}); 