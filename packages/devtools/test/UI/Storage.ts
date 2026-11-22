import type { StorageLike } from '../../ui/src/playground/auth';

/**
 * An in-memory stand-in for `localStorage`.
 */
export class MemoryStorage implements StorageLike {
  /** Set to make every call throw, as a full or blocked storage does. */
  public fail: boolean = false;

  /** The stored values. */
  private readonly fValues: Map<string, string> = new Map();

  /** @inheritdoc */
  public getItem(key: string): string | null {
    this.check();

    return this.fValues.get(key) ?? null;
  }

  /** @inheritdoc */
  public setItem(key: string, value: string): void {
    this.check();
    this.fValues.set(key, value);
  }

  /** @inheritdoc */
  public removeItem(key: string): void {
    this.check();
    this.fValues.delete(key);
  }

  /**
   * Throws while the storage is set to fail.
   */
  private check(): void {
    if (this.fail) {
      throw new Error('storage unavailable');
    }
  }
}
