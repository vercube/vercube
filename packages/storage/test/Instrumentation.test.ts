import { Container } from '@vercube/di';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/Drivers/MemoryStorage';
import { StorageManager } from '../src/Service/StorageManager';
import type { TestTelemetry } from '@vercube/telemetry/testing';

let container: Container;
let storage: StorageManager;
let telemetry: TestTelemetry;

describe('storage instrumentation', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    container = new Container();
    container.bind(StorageManager);
    storage = container.get(StorageManager);
    await storage.mount({ storage: MemoryStorage });
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
  });

  it('traces a read', async () => {
    await storage.getItem({ key: 'missing' });

    const span = telemetry.span('storage.getItem');

    expect(span).toBeDefined();
    expect(span!.attributes).toMatchObject({
      'vercube.storage.operation': 'getItem',
      'vercube.storage.mount': 'default',
      'vercube.storage.driver': 'MemoryStorage',
    });
  });

  it('traces a write', async () => {
    await storage.setItem({ key: 'user', value: { id: 1 } });

    expect(telemetry.span('storage.setItem')).toBeDefined();
  });

  it('never puts the key on the span', async () => {
    await storage.getItem({ key: 'tenants/acme/session-token' });

    const span = telemetry.span('storage.getItem')!;

    // Keys routinely carry user and tenant identifiers, so only the fact that
    // one was involved is recorded.
    expect(JSON.stringify(span.attributes)).not.toContain('acme');
    expect(span.attributes['vercube.storage.keyed']).toBe(true);
  });

  it('records the failure when a driver throws', async () => {
    const failing = new Container();
    failing.bind(StorageManager);

    const manager = failing.get(StorageManager);
    await manager.mount({ storage: MemoryStorage });
    // eslint-disable-next-line
    (manager.getStorage() as unknown as { getItem: () => Promise<never> }).getItem = () =>
      Promise.reject(new Error('driver is down'));

    await expect(manager.getItem({ key: 'user' })).rejects.toThrow('driver is down');

    const span = telemetry.span('storage.getItem')!;

    expect(span.attributes['error.type']).toBe('Error');
    expect(span.events.map((event) => event.name)).toContain('exception');
  });

  it('describes what every mount holds', async () => {
    await storage.setItem({ key: 'a', value: 1 });
    await storage.setItem({ key: 'b', value: 2 });

    const described = await storage.describe();

    expect(storage.mounts).toEqual(['default']);
    expect(described.mounts[0]).toMatchObject({ name: 'default', driver: 'MemoryStorage', truncated: false });
    expect(described.mounts[0].keys).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('marks a key list as truncated rather than lying about the size', async () => {
    await storage.setItem({ key: 'x', value: 1 });
    await storage.setItem({ key: 'y', value: 2 });

    const described = await storage.describe({ maxKeys: 1 });

    expect(described.mounts[0].keys).toHaveLength(1);
    expect(described.mounts[0].truncated).toBe(true);
  });

  it('reports null for a driver that cannot enumerate, not an empty list', async () => {
    const limited = new Container();
    limited.bind(StorageManager);

    const manager = limited.get(StorageManager);
    await manager.mount({ storage: MemoryStorage });

    // Shadowed on the instance rather than deleted: they live on the prototype.
    const driver = manager.getStorage() as unknown as Record<string, unknown>;
    driver.getKeys = undefined;
    driver.size = undefined;

    const described = await manager.describe();

    // "cannot tell" has to stay distinguishable from "nothing stored".
    expect(described.mounts[0].keys).toBeNull();
    expect(described.mounts[0].size).toBeNull();
  });

  it('survives a driver that throws while being described', async () => {
    const broken = new Container();
    broken.bind(StorageManager);

    const manager = broken.get(StorageManager);
    await manager.mount({ storage: MemoryStorage });
    (manager.getStorage() as unknown as { getKeys: () => never }).getKeys = () => {
      throw new Error('unavailable');
    };

    await expect(manager.describe()).resolves.toMatchObject({ mounts: [{ keys: null }] });
  });

  it('awaits the write before resolving', async () => {
    await storage.setItem({ key: 'awaited', value: 'value' });

    await expect(storage.getItem({ key: 'awaited' })).resolves.toBe('value');
  });
});
