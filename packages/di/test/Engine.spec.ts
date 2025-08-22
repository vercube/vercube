import { beforeEach, describe, expect, it } from 'vitest';
import { Container, Inject, InjectOptional, IOC } from '../src';
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

    it('should return null for class without dependencies', () => {
      class ClassWithoutDeps {}
      const entry = IOCEngine.getEntryForClass(ClassWithoutDeps);
      expect(entry).toBeNull();
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

  // Tests to cover uncovered lines for 100% coverage

  describe('Edge Cases', () => {
    it('should handle getDeps with undefined entry (lines 86-87)', () => {
      // Create an instance of a class that has no @Inject decorators
      class ClassWithoutInject {}
      const instance = new ClassWithoutInject();

      // This should return an empty array when no entry exists
      const deps = IOCEngine.getDeps(instance);
      expect(deps).toEqual([]);
    });

    it('should handle getEntryForClass with existing entry (line 73)', () => {
      // Create a class with @Inject decorator to ensure an entry exists
      class TestDependency {}
      class TestClass {
        @Inject(TestDependency)
        public dep!: TestDependency;
      }

      // This should return the entry (not null) when it exists
      const entry = IOCEngine.getEntryForClass(TestClass);
      expect(entry).not.toBeNull();
      expect(entry?.deps.length).toBe(1);
    });

    it('should handle getDeps with entry but undefined deps (lines 86-87)', () => {
      // Create a class with @Inject decorator
      class TestDependency {}
      class TestClass {
        @Inject(TestDependency)
        public dep!: TestDependency;
      }

      const instance = new TestClass();

      // Get the entry and manually modify it to have undefined deps
      const entry = IOCEngine.getEntryForClass(TestClass);
      if (entry) {
        // Temporarily set deps to undefined to test the fallback
        const originalDeps = entry.deps;
        entry.deps = undefined as any;

        const deps = IOCEngine.getDeps(instance);
        expect(deps).toEqual([]);

        // Restore the original deps
        entry.deps = originalDeps;
      }
    });

    it('should handle injectDeps with null prototype (lines 106-107)', () => {
      // Create an object with null prototype
      const instanceWithNullPrototype = Object.create(null);

      // This should not throw and should return early
      expect(() => {
        IOCEngine.injectDeps(container, instanceWithNullPrototype, IOC.InjectMethod.STATIC);
      }).not.toThrow();
    });

    it('should handle getDeps with null prototype', () => {
      // Create an object with null prototype
      const instanceWithNullPrototype = Object.create(null);

      // This should return an empty array
      const deps = IOCEngine.getDeps(instanceWithNullPrototype);
      expect(deps).toEqual([]);
    });
  });
});
