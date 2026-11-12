import { HealthRegistry, HEALTH_REGISTRY_KEY } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { StorageManager } from '../../src';
import { RedisStorage } from '../../src/Drivers/RedisStorage';

/**
 * A real client pointed at a port nothing listens on, the one failure CI can
 * reproduce without Redis. The storage connects while initializing, so the
 * check reports the mount as down from the first probe.
 */
describe('storage health against an unreachable Redis', () => {
  it('should report the mount down', async () => {
    const container = new Container();
    const registry = new HealthRegistry();

    registry.configure({ timeout: 2000, cacheTtl: 0 });
    container.bindInstance(Container, container);
    container.bindInstance(HEALTH_REGISTRY_KEY, registry);
    container.bind(StorageManager);

    const manager = container.get(StorageManager);

    await manager.mount({ name: 'redis', storage: RedisStorage, initOptions: { url: 'redis://127.0.0.1:1' } });
    initializeContainer(container);
    // init() swallows the failure and records it for every later operation
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = (await registry.check()).checks['storage:redis'] as unknown as Record<string, unknown>;

    expect(result).toMatchObject({ status: 'down', error: expect.stringContaining('Failed to initialize storage "redis"') });

    await container.dispose();
  });
});
