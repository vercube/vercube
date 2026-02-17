import { RequestContext } from '@vercube/core';
import { Inject } from '@vercube/di';

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
  @Inject(RequestContext)
  private readonly gRequestContext!: RequestContext;

  public set<T>(key: CtxKey<T>, value: T): void {
    this.gRequestContext.set(key.name, value);
  }

  public get<T>(key: CtxKey<T>): T | undefined {
    return this.gRequestContext.get<T>(key.name);
  }

  public getOrDefault<T>(key: CtxKey<T>, fallback: T): T {
    const value = this.get(key);
    return value === undefined ? fallback : value;
  }

  public keys(): string[] {
    return this.gRequestContext.keys();
  }

  public getAll(): Map<string, unknown> {
    return this.gRequestContext.getAll();
  }
}
