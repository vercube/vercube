import { beforeEach, describe, expect, it } from 'vitest';
import type { IDecoratedInstance } from '../src';
import {
  BaseDecorator,
  Container,
  createDecorator,
  destroyContainer,
  destroyDecorators,
  Identity,
  initializeContainer,
  initializeDecorators,
} from '../src';

describe('[Framework][IOC] Utils', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Identity', () => {
    it('should create unique symbols for different names', () => {
      const id1 = Identity('test1');
      const id2 = Identity('test2');
      const id1Duplicate = Identity('test1');

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id1Duplicate);
      expect(Symbol.keyFor(id1)).toBeUndefined(); // Should be unique symbol
      expect(id1.description).toBe('test1');
    });
  });

  describe('createDecorator', () => {
    class TestDecorator extends BaseDecorator<{ value: string }> {
      public created(): void {
        this.instance.testValue = this.options.value;
      }
    }

    it('should create a decorator function', () => {
      const decorator = createDecorator(TestDecorator, { value: 'test' });
      expect(typeof decorator).toBe('function');
    });

    it('should initialize __decorators array on target', () => {
      const decorator = createDecorator(TestDecorator, { value: 'test' });
      const target = {};
      decorator(target, 'testProperty', {});
      expect(Array.isArray((target as any).__decorators)).toBe(true);
      expect((target as any).__decorators.length).toBe(1);
    });

    it('should store decorator metadata correctly', () => {
      const decorator = createDecorator(TestDecorator, { value: 'test' });
      const target = {};
      const descriptor = { configurable: true, enumerable: true };
      decorator(target, 'testProperty', descriptor);

      const decoratorEntry = (target as any).__decorators[0];
      expect(decoratorEntry.classType).toBe(TestDecorator);
      expect(decoratorEntry.params).toEqual({ value: 'test' });
      expect(decoratorEntry.target).toBe(target);
      expect(decoratorEntry.propertyName).toBe('testProperty');
      expect(decoratorEntry.descriptor).toBe(descriptor);
    });
  });

  describe('Decorator Lifecycle', () => {
    class LifecycleDecorator extends BaseDecorator<{ value: string }> {
      public created(): void {
        this.instance.createdCalled = true;
        this.instance.value = this.options.value;
      }

      public destroyed(): void {
        this.instance.destroyedCalled = true;
      }
    }

    class TestClass implements IDecoratedInstance {
      public createdCalled: boolean = false;
      public destroyedCalled: boolean = false;
      public value: string = '';
      public __decoratorInstances?: BaseDecorator<any>[];

      @createDecorator(LifecycleDecorator, { value: 'test' })
      public testProperty: string = '';
    }

    it('should initialize decorators correctly', () => {
      const instance = new TestClass();
      initializeDecorators(instance, container);

      expect(instance.createdCalled).toBe(true);
      expect(instance.value).toBe('test');
    });

    it('should destroy decorators correctly', () => {
      const instance = new TestClass();
      initializeDecorators(instance, container);
      destroyDecorators(instance, container);

      expect(instance.destroyedCalled).toBe(true);
    });

    it('should handle container initialization', () => {
      container.bind(TestClass);
      initializeContainer(container);
      const instance = container.get(TestClass);

      expect(instance.createdCalled).toBe(true);
      expect(instance.value).toBe('test');
    });

    it('should handle container destruction', () => {
      container.bind(TestClass);
      const instance = container.get(TestClass);
      initializeDecorators(instance, container);

      destroyContainer(container);
      expect(instance.destroyedCalled).toBe(true);
    });

    it('should handle container initialization with no services', () => {
      initializeContainer(container);
      expect(() => container.get(TestClass)).toThrow();
    });

    it('should handle container destruction with no services', () => {
      destroyContainer(container);
      expect(() => container.get(TestClass)).toThrow();
    });

    it('should handle container destruction with no decorator instances', () => {
      container.bind(TestClass);
      const instance = container.get(TestClass);
      expect(instance.__decoratorInstances).toBeUndefined();
      destroyContainer(container);

      // @ts-expect-error
      container = undefined;

      // should not throw error
      expect(() => container.get(TestClass)).toThrow();
    });

    it('should handle container destruction with multiple services', () => {
      class Service1 implements IDecoratedInstance {
        public __decoratorInstances?: BaseDecorator<any>[];
      }
      class Service2 implements IDecoratedInstance {
        public __decoratorInstances?: BaseDecorator<any>[];
      }

      container.bind(Service1);
      container.bind(Service2);

      destroyContainer(container);

      // @ts-expect-error
      container = undefined;

      expect(() => container.get(Service1)).toThrow();
      expect(() => container.get(Service2)).toThrow();
    });
  });
});
