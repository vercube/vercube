import type { RequestContext } from '@vercube/core';

export type CtxKey<T> = { readonly name: string };

export const ctxKey = <T>(name: string): CtxKey<T> => ({ name });

export class TypedRequestContext {
  public constructor(private readonly ctx: RequestContext) {}

  public set<T>(key: CtxKey<T>, value: T): void {
    this.ctx.set(key.name, value);
  }

  public get<T>(key: CtxKey<T>): T | undefined {
    return this.ctx.get<T>(key.name);
  }

  public getOrDefault<T>(key: CtxKey<T>, fallback: T): T {
    const value = this.get(key);
    return value === undefined ? fallback : value;
  }

  public keys(): string[] {
    return this.ctx.keys();
  }

  public getAll(): Map<string, unknown> {
    return this.ctx.getAll();
  }
}
