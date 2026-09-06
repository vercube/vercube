import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KafkaStrategy } from '../../src/Strategies/KafkaStrategy';
import { ATTEMPT_HEADER, JOB_HEADER } from '../../src/Utils/Job';
import type { QueueTypes } from '../../src/Types/QueueTypes';

const state = vi.hoisted(() => ({
  clients: [] as any[],
  producers: [] as any[],
  consumers: [] as any[],
  admins: [] as any[],
  connectError: null as Error | null,
  sendError: null as Error | null,
  runError: null as Error | null,
  offsetsError: null as Error | null,
  disconnectError: null as Error | null,
}));

vi.mock('kafkajs', () => {
  const producer = () => {
    const instance = {
      connect: vi.fn(async () => {
        if (state.connectError) {
          throw state.connectError;
        }
      }),
      send: vi.fn(async () => {
        if (state.sendError) {
          throw state.sendError;
        }

        return [{ topicName: 'emails', partition: 2, baseOffset: '10' }];
      }),
      disconnect: vi.fn(async () => {
        if (state.disconnectError) {
          throw state.disconnectError;
        }
      }),
    };

    state.producers.push(instance);

    return instance;
  };

  const consumer = () => {
    const instance = {
      handler: null as ((payload: unknown) => Promise<void>) | null,
      runOptions: null as Record<string, unknown> | null,
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      run: vi.fn(async (options: Record<string, unknown>) => {
        if (state.runError) {
          throw state.runError;
        }

        instance.runOptions = options;
        instance.handler = options.eachMessage as (payload: unknown) => Promise<void>;
      }),
      disconnect: vi.fn(async () => undefined),
    };

    state.consumers.push(instance);

    return instance;
  };

  const admin = () => {
    const instance = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      fetchTopicOffsets: vi.fn(async () => {
        if (state.offsetsError) {
          throw state.offsetsError;
        }

        return [
          { partition: 0, offset: '100', high: '100', low: '0' },
          { partition: 1, offset: '50', high: '50', low: '0' },
        ];
      }),
      fetchOffsets: vi.fn(async () => [
        {
          topic: 'emails',
          partitions: [
            { partition: 0, offset: '90' },
            { partition: 1, offset: '-1' },
          ],
        },
      ]),
    };

    state.admins.push(instance);

    return instance;
  };

  class Kafka {
    public producer = vi.fn(producer);
    public consumer = vi.fn(consumer);
    public admin = vi.fn(admin);

    constructor(public config: Record<string, unknown>) {
      state.clients.push(this);
    }
  }

  return { Kafka };
});

/**
 * Builds a publish request the way the manager does.
 *
 * @param overrides - Fields to override
 * @returns A publish request
 */
function request(overrides: Partial<QueueTypes.PublishRequest> = {}): QueueTypes.PublishRequest {
  return {
    queue: 'emails',
    job: 'welcome',
    payload: { id: 1 },
    headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '1' },
    options: {},
    ...overrides,
  };
}

describe('KafkaStrategy', () => {
  let container: Container;
  let logger: Logger;
  let strategy: KafkaStrategy;

  beforeEach(async () => {
    for (const key of ['clients', 'producers', 'consumers', 'admins'] as const) {
      state[key].length = 0;
    }

    state.connectError = null;
    state.sendError = null;
    state.runError = null;
    state.offsetsError = null;
    state.disconnectError = null;

    container = new Container();
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);

    strategy = container.resolve(KafkaStrategy);
    await strategy.initialize({
      client: { clientId: 'app', brokers: ['localhost:9092'] },
      groupId: 'app-workers',
    });
  });

  it('should only claim what a log can do', () => {
    expect(strategy.transport).toBe('kafka');
    expect(strategy.capabilities).toEqual({
      retries: false,
      delay: false,
      priority: false,
      progress: false,
      stats: true,
      peek: false,
    });
  });

  describe('connecting', () => {
    it('should create the client and connect the producer', () => {
      expect(state.clients[0].config).toEqual({ clientId: 'app', brokers: ['localhost:9092'] });
      expect(state.producers[0].connect).toHaveBeenCalled();
    });

    it('should refuse to connect without brokers', async () => {
      const bare = container.resolve(KafkaStrategy);

      await expect(bare.initialize({ client: {} } as never)).rejects.toThrow('at least one broker');
    });

    it('should wrap a producer that cannot connect', async () => {
      state.connectError = new Error('no route to broker');

      const bare = container.resolve(KafkaStrategy);

      await expect(bare.initialize({ client: { brokers: ['localhost:9092'] } })).rejects.toMatchObject({
        name: 'QueueError',
        operation: 'initialize',
      });
    });

    it('should refuse to work before it is initialized', async () => {
      const bare = container.resolve(KafkaStrategy);

      await expect(bare.publish(request())).rejects.toThrow('not initialized');
      await expect(bare.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined })).rejects.toThrow(
        'not initialized',
      );
    });
  });

  describe('producing', () => {
    it('should produce a record with its headers', async () => {
      const ref = await strategy.publish(request());

      expect(ref).toEqual({ id: 'emails-2-10', queue: 'emails', job: 'welcome', strategy: 'kafka' });
      expect(state.producers[0].send).toHaveBeenCalledWith({
        topic: 'emails',
        messages: [
          {
            key: null,
            value: Buffer.from(JSON.stringify({ id: 1 })),
            headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '1' },
          },
        ],
      });
    });

    it('should key a record so related jobs stay ordered', async () => {
      await strategy.publish(request({ options: { key: 'tenant-1' } }));

      expect(state.producers[0].send.mock.calls[0][0].messages[0].key).toBe('tenant-1');
    });

    it('should fall back to the job id as the record key', async () => {
      await strategy.publish(request({ options: { jobId: 'job-7' } }));

      expect(state.producers[0].send.mock.calls[0][0].messages[0].key).toBe('job-7');
    });

    it('should produce a batch in a single request', async () => {
      const refs = await strategy.publishMany([request(), request({ payload: { id: 2 } })]);

      expect(state.producers[0].send).toHaveBeenCalledTimes(1);
      expect(refs.map((ref) => ref.id)).toEqual(['emails-2-10', 'emails-2-11']);
    });

    it('should do nothing when there is nothing to produce', async () => {
      expect(await strategy.publishMany([])).toEqual([]);
      expect(state.producers[0].send).not.toHaveBeenCalled();
    });

    it('should apply the configured send options', async () => {
      const configured = container.resolve(KafkaStrategy);

      await configured.initialize({
        client: { brokers: ['localhost:9092'] },
        send: { acks: 1, timeout: 100 },
      });
      await configured.publish(request());

      expect(state.producers[1].send.mock.calls[0][0]).toMatchObject({ acks: 1, timeout: 100 });
    });

    it('should wrap a broker failure', async () => {
      state.sendError = new Error('leader not available');

      await expect(strategy.publish(request())).rejects.toMatchObject({ name: 'QueueError', operation: 'publish' });
    });
  });

  describe('consuming', () => {
    it('should subscribe a consumer of the configured group', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 3, dispatch: async () => undefined });

      expect(state.clients[0].consumer).toHaveBeenCalledWith({ groupId: 'app-workers' });
      expect(state.consumers[0].subscribe).toHaveBeenCalledWith({ topic: 'emails', fromBeginning: false });
      expect(state.consumers[0].runOptions).toMatchObject({ partitionsConsumedConcurrently: 3 });
    });

    it('should be able to start from the beginning of the topic', async () => {
      const replaying = container.resolve(KafkaStrategy);

      await replaying.initialize({ client: { brokers: ['x'] }, groupId: 'g', fromBeginning: true });
      await replaying.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      expect(state.consumers[0].subscribe).toHaveBeenCalledWith({ topic: 'emails', fromBeginning: true });
    });

    it('should disconnect a consumer it replaces', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      // consume() is public, so a second call must not orphan the first consumer
      expect(state.consumers[0].disconnect).toHaveBeenCalled();
      expect(state.consumers[1].disconnect).not.toHaveBeenCalled();

      await handle.stop();

      expect(state.consumers[1].disconnect).toHaveBeenCalled();
    });

    it('should refuse to consume without a consumer group', async () => {
      const anonymous = container.resolve(KafkaStrategy);

      await anonymous.initialize({ client: { brokers: ['localhost:9092'] } });

      await expect(anonymous.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined })).rejects.toThrow(
        'needs a groupId',
      );
    });

    it('should dispatch a record with its job name and attempt', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      await state.consumers[0].handler?.({
        partition: 4,
        message: {
          offset: '77',
          value: Buffer.from(JSON.stringify({ id: 1 })),
          headers: { [JOB_HEADER]: Buffer.from('welcome'), [ATTEMPT_HEADER]: Buffer.from('3') },
        },
      });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'emails-4-77',
          job: 'welcome',
          payload: { id: 1 },
          attempt: 3,
        }),
      );
    });

    it('should treat a record without a job header as unknown', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      await state.consumers[0].handler?.({ partition: 0, message: { offset: '1', value: null, headers: {} } });

      expect(dispatch.mock.calls[0][0]).toMatchObject({ job: 'unknown', payload: null, attempt: 1 });
    });

    it('should move past a job the manager gave up on', async () => {
      await strategy.consume({
        queue: 'emails',
        concurrency: 1,
        dispatch: async () => {
          throw new Error('boom');
        },
      });

      await expect(
        state.consumers[0].handler?.({ partition: 0, message: { offset: '1', value: null, headers: {} } }),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Skipping a failed job'), expect.anything());
    });

    it('should be able to stop the consumer on a failed job instead', async () => {
      const crashing = container.resolve(KafkaStrategy);

      await crashing.initialize({ client: { brokers: ['x'] }, groupId: 'g', onFailure: 'crash' });
      await crashing.consume({
        queue: 'emails',
        concurrency: 1,
        dispatch: async () => {
          throw new Error('boom');
        },
      });

      await expect(
        state.consumers[0].handler?.({ partition: 0, message: { offset: '1', value: null, headers: {} } }),
      ).rejects.toThrow('boom');
    });

    it('should disconnect and wrap a consumer that cannot start', async () => {
      state.runError = new Error('rebalance failed');

      await expect(strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined })).rejects.toMatchObject({
        operation: 'consume',
      });

      expect(state.consumers[0].disconnect).toHaveBeenCalled();
    });

    it('should disconnect the consumer when it stops', async () => {
      const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      await handle.stop();

      expect(state.consumers[0].disconnect).toHaveBeenCalled();
    });
  });

  describe('inspection and shutdown', () => {
    it('should report how far the group is behind', async () => {
      // partition 0 committed 90 of 100, partition 1 never committed at all
      expect(await strategy.stats('emails')).toEqual({ waiting: 60 });
      expect(state.admins[0].connect).toHaveBeenCalled();
    });

    it('should reuse the admin client', async () => {
      await strategy.stats('emails');
      await strategy.stats('emails');

      expect(state.admins).toHaveLength(1);
    });

    it('should report nothing without a consumer group', async () => {
      const anonymous = container.resolve(KafkaStrategy);

      await anonymous.initialize({ client: { brokers: ['localhost:9092'] } });

      expect(await anonymous.stats('emails')).toEqual({});
    });

    it('should wrap a failure while reading offsets', async () => {
      state.offsetsError = new Error('unknown topic');

      await expect(strategy.stats('emails')).rejects.toMatchObject({ operation: 'stats' });
    });

    it('should disconnect everything it opened', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });
      await strategy.stats('emails');

      await strategy.close();

      expect(state.consumers[0].disconnect).toHaveBeenCalled();
      expect(state.producers[0].disconnect).toHaveBeenCalled();
      expect(state.admins[0].disconnect).toHaveBeenCalled();
    });

    it('should log a failure while disconnecting', async () => {
      state.disconnectError = new Error('stuck');

      await strategy.close();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to disconnect'), expect.anything());
    });
  });
});
