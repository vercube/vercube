import { RequestContext } from '@vercube/core';
import { Inject } from '@vercube/di';

// oxlint-disable-next-line no-unused-vars
export type CtxKey<T> = { readonly name: string };

export const ctxKey = <T>(name: string): CtxKey<T> => ({ name });

/**
 * Strongly-typed facade over {@link RequestContext}.
 *
 * Why this exists:
 * `RequestContext` stores values by raw string keys. This wrapper introduces typed keys
 * (`CtxKey<T>`) so callers get compile-time safety for reads/writes and avoid stringly-typed APIs.
 *
 * How it works:
 * `CtxKey<T>` carries type information only at compile time. At runtime, each key is just `name: string`
 * and every operation delegates directly to `RequestContext`.
 *
 * Limitations:
 * The type guarantees are TypeScript-only. There is no runtime schema or value validation.
 *
 * Lifecycle:
 * This class must be created by the IoC container so dependencies (currently `RequestContext`)
 * are injected correctly.
 */
export class TypedRequestContext {
  /**
   * The request context instance.
   */
  @Inject(RequestContext)
  private readonly gRequestContext!: RequestContext;

  /**
   * Sets a value in the request context.
   *
   * @param key - The key to store the value under
   * @param value - The value to store
   */
  public set<T>(key: CtxKey<T>, value: T): void {
    this.gRequestContext.set(key.name, value);
  }

  /**
   * Gets a value from the request context.
   *
   * @param key - The key to retrieve the value from
   * @returns The value if found, undefined otherwise
   */
  public get<T>(key: CtxKey<T>): T | undefined {
    return this.gRequestContext.get<T>(key.name);
  }

  /**
   * Gets a value from the request context, or returns a default value if not found.
   *
   * @param key - The key to retrieve the value from
   * @param fallback - The default value to return if the key is not found
   * @returns The value if found, fallback otherwise
   */
  public getOrDefault<T>(key: CtxKey<T>, fallback: T): T {
    const value = this.get(key);
    return value === undefined ? fallback : value;
  }

  /**
   * Gets all keys from the request context.
   *
   * @returns An array of all keys in the request context
   */
  public keys(): string[] {
    return this.gRequestContext.keys();
  }

  /**
   * Gets all values from the request context.
   *
   * @returns A map of all key-value pairs in the request context
   */
  public getAll(): Map<string, unknown> {
    return this.gRequestContext.getAll();
  }
}
