import { Container, getErrorGuidance } from '@vercube/di';
import { describe, expect, it } from 'vitest';
import { QueueErrors } from '../../src/Errors/Catalog';
import { QueueError } from '../../src/Errors/QueueError';
import { QueueManager } from '../../src/Services/QueueManager';
import { BullMQStrategy } from '../../src/Strategies/BullMQStrategy';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { withMemoryQueue } from '../../src/Testing/MemoryQueue';
import { toQueueError } from '../../src/Utils/Errors';
import { encodePayload } from '../../src/Utils/Job';

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

function createManager(): QueueManager {
  const container = new Container();

  container.bindInstance(Container, container);

  const manager = container.resolve(QueueManager);

  manager.configure({ autoStart: false });

  return manager;
}

describe('QueueErrors', () => {
  it('describes a publish to a strategy that is not mounted', async () => {
    const manager = createManager();
    const error = (await thrownBy(() => manager.add({ queue: 'emails', job: 'send', payload: {} } as never))) as QueueError;

    expect(error).toBeInstanceOf(QueueError);
    expect(error.name).toBe('QueueError');
    expect(error.message).toBe('No queue strategy is mounted as "default"');
    expect(error.operation).toBe('add');
    expect(error.retryable).toBe(true);
    expect(error.cause).toBeUndefined();
    expect(error.metadata).toEqual({ mounted: [] });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_QUEUE_STRATEGY_UNKNOWN');
    expect(getErrorGuidance(error)?.fix).toContain('QueuePlugin');
  });

  it('describes a ping of a name nothing is mounted under, and of a closed manager', async () => {
    const manager = createManager();
    const missing = (await thrownBy(() => manager.ping('events'))) as QueueError;

    expect(missing).toBeInstanceOf(QueueError);
    expect(missing.message).toBe('No queue strategy is mounted under "events"');
    expect(missing.operation).toBe('ping');
    expect(missing.retryable).toBe(false);
    expect(missing.metadata).toBeUndefined();
    expect(getErrorGuidance(missing)?.code).toBe('VERCUBE_QUEUE_STRATEGY_NOT_MOUNTED');

    await manager.close();

    const closed = (await thrownBy(() => manager.ping())) as QueueError;

    expect(closed).toBeInstanceOf(QueueError);
    expect(closed.message).toBe('The queue manager is closed');
    expect(getErrorGuidance(closed)?.code).toBe('VERCUBE_QUEUE_MANAGER_CLOSED');
  });

  it('describes a delay the memory strategy cannot honour', async () => {
    const manager = createManager();

    await manager.mount({ strategy: MemoryStrategy });

    const error = (await thrownBy(() =>
      manager.add({ queue: 'emails', job: 'send', payload: {}, options: { delay: Number.NaN } } as never),
    )) as QueueError;

    expect(error).toBeInstanceOf(QueueError);
    expect(error.message).toBe('Invalid job delay: NaN');
    expect(error.operation).toBe('publish');
    expect(error.retryable).toBe(false);
    expect(error.metadata).toEqual({ queue: 'emails', job: 'send' });
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_QUEUE_DELAY_INVALID');

    await manager.close();
  });

  it('keeps the cause of a payload that cannot be serialized as a field', async () => {
    const circular: Record<string, unknown> = {};

    circular.self = circular;

    const error = (await thrownBy(() => encodePayload(circular))) as QueueError;

    expect(error).toBeInstanceOf(QueueError);
    expect(error.message).toBe('Job payload is not serializable');
    expect(error.operation).toBe('encode');
    expect(error.retryable).toBe(false);
    expect(error.cause).toBeInstanceOf(TypeError);
    expect(Object.keys(error)).toContain('cause');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_QUEUE_PAYLOAD_NOT_SERIALIZABLE');
  });

  it('describes a strategy used before it was initialized', async () => {
    const error = (await thrownBy(() => new BullMQStrategy().ping())) as QueueError;

    expect(error).toBeInstanceOf(QueueError);
    expect(error.message).toBe('BullMQ strategy is not initialized');
    expect(error.operation).toBe('ping');
    expect(error.retryable).toBe(false);
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_QUEUE_BULLMQ_NOT_INITIALIZED');

    const missing = (await thrownBy(() => new BullMQStrategy().initialize(undefined as never))) as QueueError;

    expect(missing.message).toBe('BullMQ needs a Redis connection');
    expect(missing.operation).toBe('initialize');
    expect(getErrorGuidance(missing)?.code).toBe('VERCUBE_QUEUE_BULLMQ_CONNECTION_MISSING');
  });

  it('keeps the plain error of the testing extension', async () => {
    const error = (await thrownBy(() => withMemoryQueue().manager)) as Error;

    expect(error.constructor).toBe(Error);
    expect(error.message).toBe('withMemoryQueue() is not set up yet: pass it to createTestApp({ extensions }) first.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_QUEUE_TESTING_NOT_SET_UP');
  });

  it('wraps what a transport threw, and leaves a queue error alone', () => {
    const cause = new TypeError('socket closed');
    const error = QueueErrors.KAFKA_PUBLISH_FAILED({ cause, metadata: { queue: 'emails' } });

    expect(error).toBeInstanceOf(QueueError);
    expect(error.message).toBe('Failed to produce Kafka records');
    expect(error.operation).toBe('publish');
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
    expect(error.metadata).toEqual({ queue: 'emails' });
    expect(error.stack).not.toContain('ErrorCatalog');

    // the exported helper takes its message from the caller, so it stays outside the catalog
    const wrapped = toQueueError(cause, 'Custom transport failed', 'publish');

    expect(wrapped).toBeInstanceOf(QueueError);
    expect(getErrorGuidance(wrapped)).toBeUndefined();
    expect(toQueueError(error, 'ignored', 'publish')).toBe(error);
  });
});
