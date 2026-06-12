import { describe, expect, it } from 'vitest';
import { Injectable } from '../src/Decorators/Injectable';

describe('Injectable', () => {
  it('should return a class decorator', () => {
    const decorator = Injectable();
    expect(typeof decorator).toBe('function');
  });

  it('should be a no-op at runtime', () => {
    const decorator = Injectable();
    class MyClass {}
    expect(() => decorator(MyClass)).not.toThrow();
  });
});
