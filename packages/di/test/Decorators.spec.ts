import { beforeEach, describe, expect, it } from 'vitest';
import { Container, Init, Destroy, BaseDecorator, initializeContainer, destroyContainer, Inject, InjectOptional } from '../src';

describe('[Framework][IOC] Decorators', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('@Init decorator', () => {
    class MyInitClass {
      public initialized: boolean = false;

      @Init()
      init() {
        this.initialized = true;
      }
    }

    it('should execute init method when service is created', async () => {
      container.bind(MyInitClass);
      initializeContainer(container);

      const instance = container.get(MyInitClass);
      expect(instance.initialized).toBe(true);
    });

    it('should not execute init method if decorated property is not a function', () => {
      class InvalidInitClass {
        @Init()
        notAFunction: string = 'test';
      }

      container.bind(InvalidInitClass);
      const instance = container.get(InvalidInitClass);
      expect(instance.notAFunction).toBe('test');
    });
  });

  describe('@Destroy decorator', () => {
    class MyDestroyClass {
      public destroyed: boolean = false;

      @Destroy()
      cleanup() {
        this.destroyed = true;
      }
    }

    it('should execute destroy method when service is destroyed', () => {
      container.bind(MyDestroyClass);
      initializeContainer(container);

      const instance = container.get(MyDestroyClass);
      destroyContainer(container);

      expect(instance.destroyed).toBe(true);

      // Simulate container destruction by calling destroy on the instance
      instance.cleanup();
      expect(instance.destroyed).toBe(true);
    });

    it('should not execute destroy method if decorated property is not a function', () => {
      class InvalidDestroyClass {
        @Destroy()
        notAFunction: string = 'test';
      }

      container.bind(InvalidDestroyClass);
      const instance = container.get(InvalidDestroyClass);
      expect(instance.notAFunction).toBe('test');
    });

    it('should handle multiple destroy methods', () => {
      class MultiDestroyClass {
        public destroyed1: boolean = false;
        public destroyed2: boolean = false;

        @Destroy()
        cleanup1() {
          this.destroyed1 = true;
        }

        @Destroy()
        cleanup2() {
          this.destroyed2 = true;
        }
      }

      container.bind(MultiDestroyClass);
      const instance = container.get(MultiDestroyClass);
      expect(instance.destroyed1).toBe(false);
      expect(instance.destroyed2).toBe(false);

      instance.cleanup1();
      instance.cleanup2();
      expect(instance.destroyed1).toBe(true);
      expect(instance.destroyed2).toBe(true);
    });

    it('should handle destroy method with parameters', () => {
      class ParamDestroyClass {
        public destroyed: boolean = false;
        public param: string = '';

        @Destroy()
        cleanup(param: string) {
          this.destroyed = true;
          this.param = param;
        }
      }

      container.bind(ParamDestroyClass);
      const instance = container.get(ParamDestroyClass);
      expect(instance.destroyed).toBe(false);
      expect(instance.param).toBe('');

      instance.cleanup('test');
      expect(instance.destroyed).toBe(true);
      expect(instance.param).toBe('test');
    });
  });

  describe('@Inject decorator', () => {
    class MyInjectClass {
      public injected: boolean = false;

      @Inject(MyInjectClass)
      public inject: MyInjectClass;
    }

    it('should inject the correct class', () => {
      container.bind(MyInjectClass);
      const instance = container.get(MyInjectClass);
      expect(instance.inject).toBeInstanceOf(MyInjectClass);
    });

    it('should throw an error if the class is not bound', () => {
      expect(() => container.get(MyInjectClass)).toThrow();
    });
  });

  describe('@InjectOptional decorator', () => {
    class MyInjectOptionalClass {
      public injected: boolean = false;

      @InjectOptional(MyInjectOptionalClass)
      public inject: MyInjectOptionalClass | null;
    }

    it('should inject the correct class', () => {
      container.bind(MyInjectOptionalClass);
      const instance = container.get(MyInjectOptionalClass);
      expect(instance.inject).toBeInstanceOf(MyInjectOptionalClass);
    });

    it('should not throw an error if the class is not bound', () => {
      const instance = container.getOptional(MyInjectOptionalClass);
      expect(instance?.inject).toBeUndefined();
    });
  });

  describe('BaseDecorator', () => {
    class TestDecorator extends BaseDecorator<{ test: string }> {
      public created(): void {
        if (this.instance && this.options) {
          this.instance.testValue = this.options.test;
        }
      }
    }

    it('should properly initialize decorator with options', () => {
      const decorator = new TestDecorator();
      decorator.options = { test: 'test value' };
      decorator.instance = {};
      decorator.created();

      expect(decorator.instance.testValue).toBe('test value');
    });

    it('should handle property descriptor', () => {
      const decorator = new TestDecorator();
      decorator.propertyName = 'test';
      decorator.descriptor = {
        value: 'test',
        writable: true,
        enumerable: true,
        configurable: true,
      };

      expect(decorator.propertyName).toBe('test');
      expect(decorator.descriptor.value).toBe('test');
    });

    it('should handle destroyed lifecycle method', () => {
      const decorator = new TestDecorator();
      expect(() => decorator.destroyed()).not.toThrow();
    });

    it('should handle property index', () => {
      const decorator = new TestDecorator();
      decorator.propertyIndex = 1;
      expect(decorator.propertyIndex).toBe(1);
    });
  });
});
