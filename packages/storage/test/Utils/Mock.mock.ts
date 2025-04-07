import { vi } from 'vitest';
import { Storage } from '../../src/Service/Storage';

export class TestStorage extends Storage {
  public initialize = vi.fn().mockResolvedValue(undefined);
  public getItem<T = unknown>(): T { return {} as T; }
  public setItem<T = unknown, U = unknown>(): void {}
  public deleteItem(): void {}
  public hasItem(): boolean { return false; }
  public getKeys(): string[] { return []; }
  public clear(): void {}
  public size(): number { return 0; }
}

export class ErrorStorage extends Storage {
  public initialize = vi.fn().mockRejectedValue(new Error('Init failed'));
  public getItem<T = unknown>(): T { return {} as T; }
  public setItem<T = unknown, U = unknown>(): void {}
  public deleteItem(): void {}
  public hasItem(): boolean { return false; }
  public getKeys(): string[] { return []; }
  public clear(): void {}
  public size(): number { return 0; }
}