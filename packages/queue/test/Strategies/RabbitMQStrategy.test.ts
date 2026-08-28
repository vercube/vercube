import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RabbitMQStrategy } from '../../src/Strategies/RabbitMQStrategy';
import { ATTEMPT_HEADER, JOB_HEADER } from '../../src/Utils/Job';
import type { QueueTypes } from '../../src/Types/QueueTypes';

const state = vi.hoisted(() => ({
  connections: [] as any[],
  channels: [] as any[],
  connectArgs: [] as any[],
  connectError: null as Error | null,
  sendResult: true,
  checkError: null as Error | null,
  closeError: null as Error | null,
}));

vi.mock('amqplib', () => {
  class FakeChannel {
    public listeners: Record<string, (payload: unknown) => void> = {};
    public deliveries: ((message: unknown) => void)[] = [];

    public assertQueue = vi.fn(async () => ({ queue: 'emails', messageCount: 0, consumerCount: 0 }));
    public checkQueue = vi.fn(async () => {
      if (state.checkError) {
        throw state.checkError;
      }

      return { queue: 'emails', messageCount: 7, consumerCount: 1 };
    });

    public prefetch = vi.fn(async () => ({}));
    public sendToQueue = vi.fn(() => state.sendResult);
    public ack = vi.fn();
    public nack = vi.fn();
    public cancel = vi.fn(async () => ({}));
    public close = vi.fn(async () => {
      if (state.closeError) {
        throw state.closeError;
      }
    });

    public consume = vi.fn(async (_queue: string, onMessage: (message: unknown) => void) => {
      this.deliveries.push(onMessage);

      return { consumerTag: `tag-${state.channels.indexOf(this)}` };
    });

    public on = vi.fn((event: string, listener: (payload: unknown) => void) => {
      this.listeners[event] = listener;

      return this;
    });

    public once = vi.fn((event: string, listener: (payload: unknown) => void) => {
      this.listeners[event] = listener;

      return this;
    });

    constructor() {
      state.channels.push(this);
    }

    /** Hands a message to the consumer registered on this channel. */
    public deliver(message: unknown): void {
      for (const onMessage of this.deliveries) {
        onMessage(message);
      }
    }
  }

  class FakeConnection {
    public listeners: Record<string, (payload: unknown) => void> = {};

    public createChannel = vi.fn(async () => new FakeChannel());
    public close = vi.fn(async () => undefined);

    public on = vi.fn((event: string, listener: (payload: unknown) => void) => {
      this.listeners[event] = listener;

      return this;
    });

    constructor() {
      state.connections.push(this);
    }
  }

  return {
    connect: vi.fn(async (...args: unknown[]) => {
      state.connectArgs.push(args);

      if (state.connectError) {
        throw state.connectError;
      }

      return new FakeConnection();
    }),
  };
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

/**
 * Builds an AMQP delivery.
 *
 * @param overrides - Message fields to override
 * @returns A fake delivery
 */
function delivery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    content: Buffer.from(JSON.stringify({ id: 1 })),
    properties: { messageId: 'msg-1', type: 'welcome', headers: { [ATTEMPT_HEADER]: 2 } },
    fields: { deliveryTag: 1 },
    ...overrides,
  };
}

describe('RabbitMQStrategy', () => {
  let container: Container;
  let logger: Logger;
  let strategy: RabbitMQStrategy;

  beforeEach(async () => {
    state.connections.length = 0;
    state.channels.length = 0;
    state.connectArgs.length = 0;
    state.connectError = null;
    state.closeError = null;
    state.checkError = null;
    state.sendResult = true;

    container = new Container();
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);

    strategy = container.resolve(RabbitMQStrategy);
    await strategy.initialize({ url: 'amqp://localhost' });
  });

  it('should leave attempts and delays to the manager', () => {
    expect(strategy.transport).toBe('rabbitmq');
    expect(strategy.capabilities).toEqual({
      retries: false,
      delay: false,
      priority: true,
      progress: false,
      stats: true,
      peek: false,
    });
  });

  describe('connecting', () => {
    it('should connect with recovery enabled by default', () => {
      expect(state.connectArgs[0]).toEqual(['amqp://localhost', { recovery: {} }]);
    });

    it('should pass recovery options through', async () => {
      const tuned = container.resolve(RabbitMQStrategy);

      await tuned.initialize({ url: 'amqp://localhost', recovery: { maxRetries: 3 }, socketOptions: { timeout: 100 } });

      expect(state.connectArgs[1]).toEqual(['amqp://localhost', { timeout: 100, recovery: { maxRetries: 3 } }]);
    });

    it('should be able to connect without recovery', async () => {
      const fragile = container.resolve(RabbitMQStrategy);

      await fragile.initialize({ url: 'amqp://localhost', recovery: false });

      expect(state.connectArgs[1]).toEqual(['amqp://localhost', undefined]);
    });

    it('should refuse to connect without a url', async () => {
      const bare = container.resolve(RabbitMQStrategy);

      await expect(bare.initialize({} as never)).rejects.toThrow('needs a broker url');
    });

    it('should wrap a connection failure', async () => {
      state.connectError = new Error('refused');

      const bare = container.resolve(RabbitMQStrategy);

      await expect(bare.initialize({ url: 'amqp://localhost' })).rejects.toMatchObject({
        name: 'QueueError',
        operation: 'initialize',
      });
    });

    it('should log connection errors', () => {
      state.connections[0].listeners.error(new Error('lost'));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed'),
        expect.objectContaining({ message: 'lost' }),
      );
    });

    it('should declare its queues again after a reconnection', async () => {
      await strategy.publish(request());
      expect(state.channels[0].assertQueue).toHaveBeenCalledTimes(1);

      state.connections[0].listeners.connect({});
      await strategy.publish(request());

      // a fresh channel, and the queue asserted on it again
      expect(state.channels).toHaveLength(2);
      expect(state.channels[1].assertQueue).toHaveBeenCalledTimes(1);
    });

    it('should refuse to work before it is connected', async () => {
      const bare = container.resolve(RabbitMQStrategy);

      await expect(bare.publish(request())).rejects.toThrow('not initialized');
      await expect(bare.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined })).rejects.toThrow(
        'not initialized',
      );
    });
  });

  describe('publishing', () => {
    it('should send the job with its name, headers and id', async () => {
      const ref = await strategy.publish(request({ options: { jobId: 'fixed', priority: 3, key: 'tenant-1' } }));

      expect(ref).toEqual({ id: 'fixed', queue: 'emails', job: 'welcome', strategy: 'rabbitmq' });
      expect(state.channels[0].sendToQueue).toHaveBeenCalledWith(
        'emails',
        Buffer.from(JSON.stringify({ id: 1 })),
        expect.objectContaining({
          persistent: true,
          type: 'welcome',
          messageId: 'fixed',
          priority: 3,
          correlationId: 'tenant-1',
          headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '1' },
        }),
      );
    });

    it('should generate an id when the job has none', async () => {
      const ref = await strategy.publish(request());

      expect(ref.id).toBeTruthy();
    });

    it('should declare a queue only once per connection', async () => {
      await strategy.publish(request());
      await strategy.publish(request());

      expect(state.channels[0].assertQueue).toHaveBeenCalledTimes(1);
      expect(state.channels[0].assertQueue).toHaveBeenCalledWith('emails', { durable: true });
    });

    it('should declare queues with the given options', async () => {
      const configured = container.resolve(RabbitMQStrategy);

      await configured.initialize({ url: 'amqp://localhost', queueOptions: { durable: false, maxPriority: 5 } });
      await configured.publish(request());

      expect(state.channels[0].assertQueue).toHaveBeenCalledWith('emails', { durable: false, maxPriority: 5 });
    });

    it('should wait for the channel to drain when its buffer is full', async () => {
      state.sendResult = false;

      const publishing = strategy.publish(request());

      // the publish only settles once the channel says it is ready again
      await new Promise((resolve) => setTimeout(resolve, 5));
      state.channels[0].listeners.drain(undefined);

      await expect(publishing).resolves.toMatchObject({ queue: 'emails' });
    });

    it('should wrap a broker failure', async () => {
      await strategy.publish(request());
      state.channels[0].sendToQueue.mockImplementationOnce(() => {
        throw new Error('channel closed');
      });

      await expect(strategy.publish(request())).rejects.toMatchObject({ name: 'QueueError', operation: 'publish' });
    });

    it('should log publish channel errors', async () => {
      await strategy.publish(request());

      state.channels[0].listeners.error(new Error('channel gone'));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Publish channel failed'),
        expect.objectContaining({ message: 'channel gone' }),
      );
    });
  });

  describe('consuming', () => {
    it('should consume on its own channel with a prefetch matching the concurrency', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 5, dispatch: async () => undefined });

      expect(state.channels[0].assertQueue).toHaveBeenCalledWith('emails', { durable: true });
      expect(state.channels[0].prefetch).toHaveBeenCalledWith(5);
      expect(state.channels[0].consume).toHaveBeenCalled();
    });

    it('should let the prefetch be pinned', async () => {
      const pinned = container.resolve(RabbitMQStrategy);

      await pinned.initialize({ url: 'amqp://localhost', prefetch: 1 });
      await pinned.consume({ queue: 'emails', concurrency: 10, dispatch: async () => undefined });

      expect(state.channels[0].prefetch).toHaveBeenCalledWith(1);
    });

    it('should dispatch a delivery and acknowledge it', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      state.channels[0].deliver(delivery());
      await vi.waitFor(() => expect(state.channels[0].ack).toHaveBeenCalled());

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-1',
          job: 'welcome',
          payload: { id: 1 },
          headers: { [ATTEMPT_HEADER]: '2' },
          attempt: 2,
        }),
      );
    });

    it('should read the job name from the headers when the message has no type', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      state.channels[0].deliver(delivery({ properties: { messageId: 'msg-2', headers: { [JOB_HEADER]: 'digest' } } }));
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());

      expect(dispatch.mock.calls[0][0]).toMatchObject({ job: 'digest', attempt: 1 });
    });

    it('should fall back to an unknown job name and a generated id', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      state.channels[0].deliver(delivery({ properties: { headers: {} } }));
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());

      expect(dispatch.mock.calls[0][0].job).toBe('unknown');
      expect(dispatch.mock.calls[0][0].id).toBeTruthy();
    });

    it('should nack a failed job without requeueing it', async () => {
      await strategy.consume({
        queue: 'emails',
        concurrency: 1,
        dispatch: async () => {
          throw new Error('boom');
        },
      });

      state.channels[0].deliver(delivery());
      await vi.waitFor(() => expect(state.channels[0].nack).toHaveBeenCalledWith(expect.any(Object), false, false));

      expect(state.channels[0].ack).not.toHaveBeenCalled();
    });

    it('should report a consumer cancelled by the broker', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      state.channels[0].deliver(null);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('cancelled by the broker'));
    });

    it('should wrap a failure while starting the consumer', async () => {
      state.connections[0].createChannel.mockRejectedValueOnce(new Error('no channels left'));

      await expect(strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined })).rejects.toMatchObject({
        operation: 'consume',
      });
    });

    it('should cancel, drain and close when the consumer stops', async () => {
      let release: (() => void) | undefined;

      const handle = await strategy.consume({
        queue: 'emails',
        concurrency: 1,
        dispatch: () => new Promise<void>((resolve) => (release = resolve)),
      });

      state.channels[0].deliver(delivery());
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));

      let stopped = false;
      const stopping = handle.stop().then(() => {
        stopped = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(stopped).toBe(false);

      release?.();
      await stopping;

      expect(state.channels[0].cancel).toHaveBeenCalledWith('tag-0');
      expect(state.channels[0].close).toHaveBeenCalled();
    });

    it('should ignore stopping a consumer twice', async () => {
      const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      await handle.stop();
      await handle.stop();

      expect(state.channels[0].cancel).toHaveBeenCalledTimes(1);
    });

    it('should log a consumer that fails to stop', async () => {
      const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      state.channels[0].cancel.mockRejectedValueOnce(new Error('gone'));
      await handle.stop();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to stop the consumer'), expect.anything());
    });
  });

  describe('inspection and shutdown', () => {
    it('should report how many messages wait on a queue', async () => {
      expect(await strategy.stats('emails')).toEqual({ waiting: 7, active: 0 });
    });

    it('should wrap a failure while inspecting a queue', async () => {
      state.checkError = new Error('no such queue');

      await expect(strategy.stats('emails')).rejects.toMatchObject({ operation: 'stats' });
    });

    it('should stop consumers and close the connection', async () => {
      await strategy.publish(request());
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      await strategy.close();

      expect(state.channels[1].cancel).toHaveBeenCalled();
      expect(state.channels[0].close).toHaveBeenCalled();
      expect(state.connections[0].close).toHaveBeenCalled();
    });

    it('should log a failure while closing', async () => {
      await strategy.publish(request());
      state.closeError = new Error('stuck');

      await strategy.close();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to close the connection'), expect.anything());
    });
  });
});
