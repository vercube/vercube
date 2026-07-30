import { describe, expect, it } from 'vitest';
import { StorageCollector } from '../../src/Services/StorageCollector';
import { createDevtoolsApp } from '../Utils/App';
import type { App } from '@vercube/core';

/**
 * Structural stand-in for `@vercube/storage`'s `StorageManager`.
 * Named and shaped so the collector finds it without importing the package.
 */
class StorageManager {
  public static pending: Record<string, Record<string, unknown>> = {};

  public fStorages = new Map<string, { storage: unknown }>();

  public constructor() {
    for (const [name, entries] of Object.entries(StorageManager.pending)) {
      this.fStorages.set(name, { storage: new FakeDriver(entries) });
    }
  }
}

/**
 * Minimal in-memory storage driver for tests.
 */
class FakeDriver {
  private readonly data = new Map<string, unknown>();

  public constructor(entries: Record<string, unknown>) {
    for (const [key, value] of Object.entries(entries)) {
      this.data.set(key, value);
    }
  }

  public getKeys(): string[] {
    return [...this.data.keys()];
  }

  public size(): number {
    return this.data.size;
  }

  public getItem(key: string): unknown {
    return this.data.get(key);
  }
}

/**
 * Boots a devtools app with a fake storage manager already mounted.
 * @param mounts mount name to seeded key/value pairs
 * @returns the running application
 */
async function createStorageApp(mounts: Record<string, Record<string, unknown>>): Promise<App> {
  const app = await createDevtoolsApp({}, (instance) => {
    StorageManager.pending = mounts;

    // Prefer bind + get over bindInstance so hasInstance is true.
    instance.container.bind(StorageManager);
    instance.container.get(StorageManager);
  });

  return app;
}

describe('StorageCollector', () => {
  it('reports no storage when nothing is mounted', async () => {
    const app = await createStorageApp({});
    const collector = app.container.get(StorageCollector);

    const view = await collector.collect();

    expect(view.available).toBe(true);
    expect(view.mounts).toEqual([]);
  });

  it('lists keys per mount without reading their values', async () => {
    const app = await createStorageApp({
      default: { 'session:abc': { userId: 1 }, 'session:def': { userId: 2 } },
    });
    const collector = app.container.get(StorageCollector);

    const view = await collector.collect();

    expect(view.mounts).toEqual([expect.objectContaining({ name: 'default', driver: 'FakeDriver', size: 2, truncated: false })]);
    expect(view.mounts[0].keys.sort()).toEqual(['session:abc', 'session:def']);
  });

  it('previews a value as pretty JSON', async () => {
    const app = await createStorageApp({ default: { 'user:1': { name: 'vercube', roles: ['admin', 'editor'] } } });
    const collector = app.container.get(StorageCollector);

    const value = await collector.readValue('default', 'user:1');

    expect(value.error).toBeUndefined();
    expect(value.type).toBe('object');
    expect(JSON.parse(value.text ?? 'null')).toEqual({ name: 'vercube', roles: ['admin', 'editor'] });
  });

  it('reports a helpful error for a missing key', async () => {
    const app = await createStorageApp({ default: {} });
    const collector = app.container.get(StorageCollector);

    const value = await collector.readValue('default', 'missing');

    expect(value.error).toMatch(/nothing is stored/i);
  });

  it('reports a helpful error for an unknown mount', async () => {
    const app = await createStorageApp({ default: {} });
    const collector = app.container.get(StorageCollector);

    const value = await collector.readValue('elsewhere', 'anything');

    expect(value.error).toMatch(/no "elsewhere" mount/i);
  });

  it('renders Map and Set values instead of dropping them', async () => {
    const app = await createStorageApp({
      default: { config: new Map([['a', 1]]), tags: new Set(['x', 'y']) },
    });
    const collector = app.container.get(StorageCollector);

    const map = await collector.readValue('default', 'config');
    const set = await collector.readValue('default', 'tags');

    expect(JSON.parse(map.text ?? 'null')).toEqual({ '[Map]': { a: 1 } });
    expect(JSON.parse(set.text ?? 'null')).toEqual({ '[Set]': ['x', 'y'] });
  });
});
