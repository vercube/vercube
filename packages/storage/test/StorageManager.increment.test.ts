import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageError, StorageManager } from '../src';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';
import { TestStorage } from './Utils/Mock.mock';

/** A driver without `increment`, backed by a map, recording the write options. */
class PlainStorage extends TestStorage {
  public data: Map<string, unknown> = new Map();
  public writes: unknown[] = [];

  public override getItem<T = unknown>(key?: string): T {
    return this.data.get(key!) as T;
  }

  public override setItem(key?: string, value?: unknown, options?: unknown): void {
    this.data.set(key!, value);
    this.writes.push(options);
  }
}

/** A driver that holds a connection to release. */
class ClosingStorage extends TestStorage {
  public close = vi.fn(async () => undefined);
}

class FailingCloseStorage extends TestStorage {
  public close = vi.fn(async () => {
    throw new Error('ECONNRESET');
  });
}

describe('StorageManager.increment', () => {
  let container: Container;
  let logger: Logger;
  let manager: StorageManager;

  beforeEach(() => {
    container = new Container();
    logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bind(StorageManager);
    initializeContainer(container);

    manager = container.get(StorageManager);
  });

  it('should use the atomic increment of a driver that has one', async () => {
    await manager.mount({ storage: MemoryStorage });
    const spy = vi.spyOn(manager.getStorage() as MemoryStorage, 'increment');

    expect(await manager.increment({ key: 'hits', ttl: 60 })).toBe(1);
    expect(await manager.increment({ key: 'hits', by: 4 })).toBe(5);

    expect(spy).toHaveBeenNthCalledWith(1, 'hits', { by: 1, ttl: 60 });
    expect(manager.isAtomic()).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should fall back to a read and a write, warning once per mount', async () => {
    await manager.mount({ name: 'plain', storage: PlainStorage });
    const driver = manager.getStorage('plain') as PlainStorage;

    expect(await manager.increment({ storage: 'plain', key: 'hits', ttl: 60 })).toBe(1);
    expect(await manager.increment({ storage: 'plain', key: 'hits', ttl: 60 })).toBe(2);
    expect(await manager.increment({ storage: 'plain', key: 'other' })).toBe(1);

    expect(driver.data.get('hits')).toBe(2);
    // the expiry is written every time, so a TTL-aware driver never keeps the key forever
    expect(driver.writes).toEqual([{ ttl: 60 }, { ttl: 60 }, undefined]);
    expect(manager.isAtomic('plain')).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Vercube/StorageManager::increment', expect.stringContaining('"plain"'));
  });

  it('should restart a fallback counter that holds something else than a number', async () => {
    await manager.mount({ name: 'plain', storage: PlainStorage });
    (manager.getStorage('plain') as PlainStorage).data.set('hits', 'garbage');

    expect(await manager.increment({ storage: 'plain', key: 'hits' })).toBe(1);
  });

  it('should fail for a mount that does not exist', async () => {
    await expect(manager.increment({ storage: 'missing', key: 'hits' })).rejects.toThrow(StorageError);
    expect(manager.isAtomic('missing')).toBe(false);
  });

  it('should report whether each mount is atomic in describe()', async () => {
    await manager.mount({ name: 'memory', storage: MemoryStorage });
    await manager.mount({ name: 'plain', storage: PlainStorage });

    const { mounts } = await manager.describe();

    expect(mounts.map(({ name, atomicIncrement }) => ({ name, atomicIncrement }))).toEqual([
      { name: 'memory', atomicIncrement: true },
      { name: 'plain', atomicIncrement: false },
    ]);
  });
});

describe('StorageManager.close', () => {
  it('should close every driver once the container is disposed, logging a failure without stopping', async () => {
    const container = new Container();
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bind(StorageManager);
    initializeContainer(container);

    const manager = container.get(StorageManager);

    await manager.mount({ name: 'a', storage: FailingCloseStorage });
    await manager.mount({ name: 'b', storage: ClosingStorage });
    await manager.mount({ name: 'c', storage: MemoryStorage });

    await container.dispose();

    expect((manager.getStorage('a') as FailingCloseStorage).close).toHaveBeenCalledTimes(1);
    expect((manager.getStorage('b') as ClosingStorage).close).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Vercube/StorageManager::close', expect.any(StorageError));
  });
});
