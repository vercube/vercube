import { TestingError } from '../Errors/TestingError';

/**
 * Properties that must read as missing even on a stub: `then` would make the
 * stub look like a promise, so `await stub()` would hang, and the others are
 * probed by runners and `console.log` when printing a value.
 */
const NEVER_STUBBED: ReadonlySet<PropertyKey> = new Set([
  'then',
  'toJSON',
  'asymmetricMatch',
  '$$typeof',
  'nodeType',
  'constructor',
  Symbol.toPrimitive,
  Symbol.toStringTag,
  Symbol.iterator,
  Symbol.asyncIterator,
]);

/**
 * Creates a stand-in for a dependency from the members a test needs.
 *
 * Calling a method the partial does not define throws a {@link TestingError}
 * naming the class and the method, instead of `undefined is not a function`
 * somewhere further down. Properties other than methods the partial does not
 * define read as `undefined`.
 *
 * The stub does not know which members of `T` are methods, so a missing member
 * reads as a function that throws when called. Check a missing optional
 * property with `'name' in stub` rather than by its value.
 *
 * @template T - The type the stub stands in for
 * @param partial - The members the test needs
 * @param name - Name used in errors, such as the class name
 * @returns The stub, typed as `T`
 *
 * @example
 * ```ts
 * const repo = stub<UserRepository>({ findById: async () => user }, 'UserRepository');
 *
 * await repo.findById('1'); // user
 * await repo.save(user); // TestingError: UserRepository.save is not stubbed
 * ```
 */
export function stub<T extends object>(partial: Partial<T> = {}, name: string = 'stub'): T {
  return new Proxy(partial as T, {
    get(target, property, receiver) {
      if (Reflect.has(target, property) || NEVER_STUBBED.has(property) || typeof property === 'symbol') {
        return Reflect.get(target, property, receiver);
      }

      return function notStubbed(): never {
        throw new TestingError(
          `${name}.${String(property)} is not stubbed. Add it to the object passed to stub() or to the override.`,
        );
      };
    },
  });
}

/**
 * Describes a service key for messages.
 *
 * @param key - A class, abstract class, symbol or string key
 * @returns Its name
 */
export function describeKey(key: unknown): string {
  if (typeof key === 'function') {
    return key.name || 'AnonymousClass';
  }

  if (typeof key === 'symbol') {
    return key.description ?? 'Symbol()';
  }

  return String(key);
}
