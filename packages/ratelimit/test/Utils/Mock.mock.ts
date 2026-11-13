import { Storage } from '@vercube/storage';

/** A storage whose backend is down: every operation rejects. */
export class BrokenStorage extends Storage {
  public initialize(): void {}

  private fail(): Promise<never> {
    return Promise.reject(new Error('ECONNREFUSED'));
  }

  public getItem<T>(): Promise<T> {
    return this.fail();
  }

  public getItems<T>(): Promise<T[]> {
    return this.fail();
  }

  public setItem(): Promise<void> {
    return this.fail();
  }

  public increment(): Promise<number> {
    return this.fail();
  }

  public deleteItem(): Promise<void> {
    return this.fail();
  }

  public hasItem(): Promise<boolean> {
    return this.fail();
  }

  public getKeys(): Promise<string[]> {
    return this.fail();
  }

  public clear(): Promise<void> {
    return this.fail();
  }

  public size(): Promise<number> {
    return this.fail();
  }
}
