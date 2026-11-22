import { Container, getErrorGuidance, initializeContainer } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { StorageError, StorageManager } from '../../src';
import { RedisStorage } from '../../src/Drivers/RedisStorage';
import { ErrorStorage, TestStorage } from '../Utils/Mock.mock';

/**
 * Runs a function and returns what it threw.
 *
 * @param run - The function expected to throw
 * @returns The thrown value
 */
async function thrownBy(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the call to throw');
}

function createContainer(): Container {
  const container = new Container();

  container.bindInstance(Container, container);
  container.bind(StorageManager);

  return container;
}

function createManager(): StorageManager {
  return createContainer().get(StorageManager);
}

describe('StorageErrors', () => {
  it('describes a ping before the manager was initialized', async () => {
    const error = (await thrownBy(() => createManager().ping('files'))) as StorageError;

    expect(error).toBeInstanceOf(StorageError);
    expect(error.name).toBe('StorageError');
    expect(error.message).toBe('Storage "files" is not initialized yet');
    expect(error.operation).toBe('ping');
    expect(error.cause).toBeUndefined();
    expect(error.metadata).toEqual({ mount: 'files' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_STORAGE_NOT_INITIALIZED');
  });

  it('describes an operation on a storage that is not mounted', async () => {
    const manager = createManager();
    const error = (await thrownBy(() => manager.getItem({ storage: 'files', key: 'a' }))) as StorageError;

    expect(error).toBeInstanceOf(StorageError);
    expect(error.message).toBe('Storage "files" is not mounted');
    expect(error.operation).toBe('getItem');
    expect(error.metadata).toEqual({ mount: 'files' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_STORAGE_NOT_MOUNTED');
    expect(getErrorGuidance(error)?.fix).toContain('mount(');
  });

  it('keeps what a driver threw while initializing as the cause', async () => {
    const container = createContainer();
    const manager = container.get(StorageManager);

    await manager.mount({ name: 'files', storage: ErrorStorage });
    initializeContainer(container);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const error = (await thrownBy(() => manager.getItem({ storage: 'files', key: 'a' }))) as StorageError;

    expect(error).toBeInstanceOf(StorageError);
    expect(error.message).toBe('Failed to initialize storage "files"');
    expect(error.operation).toBe('initialize');
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause?.message).toBe('Init failed');
    expect(Object.keys(error)).toContain('cause');
    expect(error.metadata).toEqual({ mount: 'files' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_STORAGE_INIT_FAILED');

    // every later operation on the mount fails with the same error
    expect(await thrownBy(() => manager.getItem({ storage: 'files', key: 'a' }))).toBe(error);
  });

  it('describes an increment that is not a finite number', async () => {
    const manager = createManager();

    await manager.mount({ storage: TestStorage });

    const error = (await thrownBy(() => manager.increment({ key: 'hits', by: Number.NaN }))) as StorageError;

    expect(error).toBeInstanceOf(StorageError);
    expect(error.message).toBe('Cannot increment "hits" by NaN');
    expect(error.operation).toBe('increment');
    expect(error.metadata).toEqual({ mount: 'default' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_STORAGE_INCREMENT_INVALID');
  });

  it('describes a Redis storage used before it was initialized', async () => {
    const error = (await thrownBy(() => new RedisStorage().client)) as StorageError;

    expect(error).toBeInstanceOf(StorageError);
    expect(error.message).toBe('RedisStorage is not initialized');
    expect(error.operation).toBe('client');
    expect(error.metadata).toBeUndefined();
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_STORAGE_REDIS_NOT_INITIALIZED');
  });
});
