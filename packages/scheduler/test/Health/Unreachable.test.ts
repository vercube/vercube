import { HealthRegistry } from '@vercube/core';
import { Container } from '@vercube/di';
import { afterEach, describe, expect, it } from 'vitest';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import { PostgresStore } from '../../src/Stores/PostgresStore';
import { RedisStore } from '../../src/Stores/RedisStore';
import type { SchedulerTypes } from '../../src/Types/SchedulerTypes';

/**
 * The checks against real clients pointed at a port nothing listens on, the
 * one failure CI can reproduce without a database.
 */
describe('scheduler health against an unreachable store', () => {
  let manager: SchedulerManager;

  const ping = async (store: SchedulerTypes.AnyMount): Promise<Record<string, unknown>> => {
    const container = new Container();
    container.bindInstance(Container, container);
    container.bind(SchedulerManager);

    manager = container.get(SchedulerManager);
    await manager.mount(store as SchedulerTypes.Mount<never>);

    const registry = new HealthRegistry();
    registry.configure({ timeout: 2000, cacheTtl: 0 });
    registry.register({ name: 'scheduler:store', check: () => manager.ping() });

    return (await registry.check()).checks['scheduler:store'] as unknown as Record<string, unknown>;
  };

  afterEach(async () => {
    await manager?.close().catch(() => undefined);
  });

  it('should report Redis down', async () => {
    const result = await ping({ store: RedisStore, initOptions: { url: 'redis://127.0.0.1:1' } });

    expect(result).toMatchObject({ status: 'down', error: expect.stringContaining('Failed to initialize store "redis"') });
  });

  it('should report Postgres down', async () => {
    const result = await ping({
      store: PostgresStore,
      initOptions: { connectionString: 'postgres://postgres:pg@127.0.0.1:1/postgres' },
    });

    expect(result).toMatchObject({ status: 'down', error: expect.stringContaining('Failed to initialize store "postgres"') });
  });
});
