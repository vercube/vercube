import { HealthRegistry } from '@vercube/core';
import { Container } from '@vercube/di';
import { afterEach, describe, expect, it } from 'vitest';
import { QueueManager } from '../../src/Services/QueueManager';
import { BullMQStrategy } from '../../src/Strategies/BullMQStrategy';
import { KafkaStrategy } from '../../src/Strategies/KafkaStrategy';
import { RabbitMQStrategy } from '../../src/Strategies/RabbitMQStrategy';
import type { QueueTypes } from '../../src/Types/QueueTypes';

/** Nothing listens on port 1, so every connection is refused. */
const UNREACHABLE = '127.0.0.1:1';

/**
 * The checks against real clients pointed at a port nothing listens on, the
 * one failure CI can reproduce without a broker. Most clients connect while
 * initializing, so this proves a check fails when the first connect does;
 * the unit tests of each strategy cover a ping failing once connected.
 */
describe('queue health against an unreachable broker', () => {
  let manager: QueueManager;

  const ping = async (mount: QueueTypes.AnyMount): Promise<Record<string, unknown>> => {
    const container = new Container();
    container.bindInstance(Container, container);
    container.bind(QueueManager);

    manager = container.get(QueueManager);
    await manager.mount(mount as QueueTypes.Mount<never>);

    const registry = new HealthRegistry();
    registry.configure({ timeout: 500, cacheTtl: 0 });
    registry.register({ name: 'queue', check: () => manager.ping(mount.name ?? 'default') });

    return (await registry.check()).checks.queue as unknown as Record<string, unknown>;
  };

  afterEach(async () => {
    await manager?.close().catch(() => undefined);
  });

  it('should report BullMQ down', async () => {
    const result = await ping({
      strategy: BullMQStrategy,
      initOptions: { connection: { host: '127.0.0.1', port: 1, maxRetriesPerRequest: null, retryStrategy: () => 50 } },
    });

    // the read waits for a reconnect that never comes
    expect(result).toMatchObject({ status: 'down', error: 'Timed out after 500ms' });
  });

  it.runIf(process.env.REDIS_URL)('should report BullMQ up when Redis answers', async () => {
    const url = new URL(process.env.REDIS_URL!);
    const result = await ping({
      strategy: BullMQStrategy,
      initOptions: { connection: { host: url.hostname, port: Number(url.port || 6379), maxRetriesPerRequest: null } },
    });

    expect(result.status).toBe('ok');
  });

  it('should report RabbitMQ down', async () => {
    const result = await ping({ strategy: RabbitMQStrategy, initOptions: { url: `amqp://${UNREACHABLE}`, recovery: false } });

    expect(result).toMatchObject({ status: 'down', error: 'Failed to connect to RabbitMQ' });
  });

  it('should report Kafka down', async () => {
    const result = await ping({
      strategy: KafkaStrategy,
      initOptions: { client: { brokers: [UNREACHABLE], retry: { retries: 0 }, connectionTimeout: 100, logLevel: 0 } },
    });

    expect(result.status).toBe('down');
  });
});
