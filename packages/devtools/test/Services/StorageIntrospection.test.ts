import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it } from 'vitest';
import { StorageIntrospection } from '../../src/Services/StorageIntrospection';

class StorageManager {
  public readonly mounts = ['default'];

  public describe(): Promise<unknown> {
    return Promise.resolve({
      mounts: [{ name: 'default', driver: 'MemoryStorage', size: 1, keys: ['user'], truncated: false }],
    });
  }

  public getItem({ key }: { storage: string; key: string }): Promise<unknown> {
    if (key === 'explodes') {
      return Promise.reject(new Error('driver is down'));
    }

    return Promise.resolve({ id: 1 });
  }
}

class CacheManager {
  public readonly defaults = { maxAge: 60, storage: 'cache' };
}

describe('StorageIntrospection', () => {
  let container: Container;
  let introspection: StorageIntrospection;

  beforeEach(() => {
    container = new Container();
    container.bind(StorageIntrospection);
    introspection = container.get(StorageIntrospection);
  });

  it('reports nothing when the application has no storage', async () => {
    await expect(introspection.describe()).resolves.toMatchObject({
      available: false,
      mounts: [],
      cache: { available: false },
    });
  });

  it('ignores a manager that is bound but never built', async () => {
    container.bind(StorageManager);

    // Resolving it would construct a storage the application never asked for,
    // which an inspector must not do.
    await expect(introspection.describe()).resolves.toMatchObject({ available: false });
    expect(container.hasInstance(StorageManager)).toBe(false);
  });

  it('describes a live manager', async () => {
    container.bind(StorageManager);
    container.get(StorageManager);

    const described = await introspection.describe();

    expect(described.available).toBe(true);
    expect(described.mounts[0]).toMatchObject({ name: 'default', driver: 'MemoryStorage' });
  });

  it('flattens the cache defaults and names the mount it writes through', async () => {
    container.bind(CacheManager);
    container.get(CacheManager);

    const described = await introspection.describe();

    expect(described.cache.available).toBe(true);
    expect(described.cache.mount).toBe('cache');
    expect(described.cache.defaults).toContainEqual({ path: 'maxAge', value: '60' });
  });

  it('changes revision so the section is never served stale', () => {
    expect(introspection.revision()).toBeGreaterThan(0);
  });

  it('explains an unknown mount instead of throwing', async () => {
    await expect(introspection.readValue('nope', 'user')).resolves.toMatchObject({
      error: expect.stringContaining('nope'),
    });
  });

  it('reads a value from a live mount', async () => {
    container.bind(StorageManager);
    container.get(StorageManager);

    await expect(introspection.readValue('default', 'user')).resolves.toMatchObject({ mount: 'default', key: 'user' });
  });

  it('never returns a value stored under a credential-looking key', async () => {
    container.bind(StorageManager);
    container.get(StorageManager);

    await expect(introspection.readValue('default', 'session-token')).resolves.toMatchObject({
      type: 'redacted',
      text: '<redacted>',
    });
  });

  it('reports a driver failure rather than propagating it', async () => {
    container.bind(StorageManager);
    container.get(StorageManager);

    await expect(introspection.readValue('default', 'explodes')).resolves.toMatchObject({ error: 'driver is down' });
  });
});
