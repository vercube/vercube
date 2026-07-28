import { Storage } from '@vercube/storage';

/**
 * Storage whose every operation rejects, used to prove that a broken cache
 * backend never breaks the call it was supposed to speed up.
 */
export class BrokenStorage implements Storage {
  public initialize(): void {
    // nothing to initialize
  }

  public getItem<T = unknown>(): Promise<T | null> {
    return Promise.reject(new Error('storage read failed'));
  }

  public getItems<T = unknown>(): Promise<T[]> {
    return Promise.reject(new Error('storage read failed'));
  }

  public setItem(): Promise<void> {
    return Promise.reject(new Error('storage write failed'));
  }

  public deleteItem(): Promise<void> {
    return Promise.reject(new Error('storage delete failed'));
  }

  public hasItem(): Promise<boolean> {
    return Promise.reject(new Error('storage read failed'));
  }

  public getKeys(): Promise<string[]> {
    return Promise.reject(new Error('storage read failed'));
  }

  public clear(): Promise<void> {
    return Promise.reject(new Error('storage clear failed'));
  }

  public size(): Promise<number> {
    return Promise.reject(new Error('storage read failed'));
  }
}
