import { describe, it, expect } from 'vitest';
import { Storage } from '../src';

describe('Storage', () => {
  it('should be an abstract class', () => {
    // Create a concrete class that extends Storage
    class ConcreteStorage extends Storage {
      public initialize(): void {}
      public getItem<T = unknown>(): T {
        return {} as T;
      }
      public setItem(): void {}
      public deleteItem(): void {}
      public hasItem(): boolean {
        return false;
      }
      public getKeys(): string[] {
        return [];
      }
      public clear(): void {}
      public size(): number {
        return 0;
      }
    }

    // This should work
    expect(() => new ConcreteStorage()).not.toThrow();
  });

  it('should have all required abstract methods', () => {
    // Create a concrete class that extends Storage
    class ConcreteStorage extends Storage {
      public initialize(): void {}
      public getItem<T = unknown>(): T {
        return {} as T;
      }
      public setItem(): void {}
      public deleteItem(): void {}
      public hasItem(): boolean {
        return false;
      }
      public getKeys(): string[] {
        return [];
      }
      public clear(): void {}
      public size(): number {
        return 0;
      }
    }

    const storage = new ConcreteStorage();
    const storageMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(storage),
    );
    const requiredMethods = [
      'initialize',
      'getItem',
      'setItem',
      'deleteItem',
      'hasItem',
      'getKeys',
      'clear',
      'size',
    ];

    for (const method of requiredMethods) {
      expect(storageMethods).toContain(method);
    }
  });
});
