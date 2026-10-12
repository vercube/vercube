import { stub, describeKey } from './Stub';
import type { TestingTypes } from '../Types/TestingTypes';
import type { Container } from '@vercube/di';

/**
 * Tells a class apart from an object. Arrow functions have no prototype, so a
 * function with one is taken to be a class.
 *
 * @param value - An override replacement or a provider
 * @returns True for a class
 */
function isClass(value: unknown): value is new () => unknown {
  return typeof value === 'function' && value.prototype !== undefined;
}

/**
 * Binds providers as singletons.
 *
 * @param container - The container
 * @param providers - Classes, or `[key, implementation]`
 */
export function bindProviders(container: Container, providers: TestingTypes.Provider[] = []): void {
  for (const provider of providers) {
    if (Array.isArray(provider)) {
      container.bind(provider[0], provider[1]);
    } else {
      container.bind(provider);
    }
  }
}

/**
 * Replaces dependencies: a class is bound as a singleton, an object as the
 * instance itself, wrapped with {@link stub} when `strict` is set.
 *
 * @param container - The container
 * @param overrides - `[key, replacement]` pairs
 * @param strict - Whether object overrides throw on members they do not define
 */
export function applyOverrides(container: Container, overrides: TestingTypes.Override[] = [], strict: boolean = false): void {
  for (const [key, replacement] of overrides) {
    if (isClass(replacement)) {
      container.bind(key, replacement);
    } else {
      container.bindMock(key, strict ? stub(replacement as object, describeKey(key)) : replacement);
    }
  }
}
