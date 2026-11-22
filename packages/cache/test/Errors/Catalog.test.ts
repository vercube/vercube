import { Container, getErrorGuidance, initializeContainer } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { describe, expect, it } from 'vitest';
import { CacheError, CacheManager } from '../../src';
import { cacheBaseForStorage } from '../../src/Services/CacheStorageAdapter';

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

function createManager(): CacheManager {
  const container = new Container();

  container.bindInstance(Container, container);
  container.bind(StorageManager);
  container.bind(CacheManager);
  initializeContainer(container);

  return container.get(CacheManager);
}

describe('CacheErrors', () => {
  it('describes a cached target that is not a function', async () => {
    const error = (await thrownBy(() => createManager().cached('nope' as never))) as CacheError;

    expect(error).toBeInstanceOf(CacheError);
    expect(error.name).toBe('CacheError');
    expect(error.message).toBe('Cached target must be a function');
    expect(error.operation).toBe('cached');
    expect(error.cause).toBeUndefined();
    expect(error.metadata).toEqual({ received: 'string' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CACHE_TARGET_NOT_FUNCTION');
    expect(getErrorGuidance(error)?.fix).toContain('cached(');
  });

  it('describes an empty list of storages', async () => {
    const error = (await thrownBy(() => createManager().cached(async () => 1, { name: 'answer', storage: [] }))) as CacheError;

    expect(error).toBeInstanceOf(CacheError);
    expect(error.message).toBe('At least one storage must be given when caching');
    expect(error.operation).toBe('resolveOptions');
    expect(error.metadata).toEqual({ name: 'answer' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CACHE_STORAGE_LIST_EMPTY');
  });

  it('describes a storage name with a colon', async () => {
    const error = (await thrownBy(() => cacheBaseForStorage('redis:main'))) as CacheError;

    expect(error).toBeInstanceOf(CacheError);
    expect(error.message).toBe('Storage name used for caching must not contain a colon');
    expect(error.operation).toBe('cacheBaseForStorage');
    expect(error.metadata).toEqual({ storage: 'redis:main' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_CACHE_STORAGE_NAME_HAS_COLON');
  });
});
