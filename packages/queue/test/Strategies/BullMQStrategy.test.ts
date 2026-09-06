import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueError } from '../../src/Errors/QueueError';
import { BullMQStrategy } from '../../src/Strategies/BullMQStrategy';
import { ATTEMPT_HEADER, JOB_HEADER } from '../../src/Utils/Job';
import type { QueueTypes } from '../../src/Types/QueueTypes';

const state = vi.hoisted(() => ({
  queues: [] as any[],
  workers: [] as any[],
  addError: null as Error | null,
  countsError: null as Error | null,
  jobsError: null as Error | null,
  jobs: {} as Record<string, unknown[]>,
}));

vi.mock('bullmq', () => {
  class Queue {
    public add = vi.fn(async () => {
      if (state.addError) {
        throw state.addError;
      }

      return { id: 42 };
    });

    public addBulk = vi.fn(async (jobs: unknown[]) => {
      if (state.addError) {
        throw state.addError;
      }

      return jobs.map((_job, index) => ({ id: index + 1 }));
    });

    public getJobCounts = vi.fn(async () => {
      if (state.countsError) {
        throw state.countsError;
      }

      return { waiting: 1, active: 2, completed: 3, failed: 4, delayed: 5 };
    });

    public getJobs = vi.fn(async (states: string[], _start: number, end: number) => {
      if (state.jobsError) {
        throw state.jobsError;
      }

      return (state.jobs[states[0]] ?? []).slice(0, end + 1);
    });

    public close = vi.fn(async () => undefined);

    constructor(
      public name: string,
      public options: Record<string, unknown>,
    ) {
      state.queues.push(this);
    }
  }

  class Worker {
    public listeners: Record<string, (payload: unknown) => void> = {};

    public on = vi.fn((event: string, listener: (payload: unknown) => void) => {
      this.listeners[event] = listener;

      return this;
    });

    public close = vi.fn(async () => undefined);

    constructor(
      public name: string,
      public processor: (job: unknown) => Promise<void>,
      public options: Record<string, unknown>,
    ) {
      state.workers.push(this);
    }
  }

  class UnrecoverableError extends Error {
    public override name = 'UnrecoverableError';
  }

  return { Queue, UnrecoverableError, Worker };
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

describe('BullMQStrategy', () => {
  let container: Container;
  let logger: Logger;
  let strategy: BullMQStrategy;

  beforeEach(() => {
    state.queues.length = 0;
    state.workers.length = 0;
    state.addError = null;
    state.countsError = null;
    state.jobsError = null;
    state.jobs = {};

    container = new Container();
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);

    strategy = container.resolve(BullMQStrategy);
    strategy.initialize({ connection: { host: 'localhost', port: 6379 }, prefix: 'app' });
  });

  it('should report that the broker owns the whole job model', () => {
    expect(strategy.transport).toBe('bullmq');
    expect(strategy.capabilities).toEqual({
      retries: true,
      delay: true,
      priority: true,
      progress: true,
      stats: true,
      peek: true,
    });
  });

  it('should refuse to initialize without a connection', () => {
    const bare = container.resolve(BullMQStrategy);

    expect(() => bare.initialize({} as never)).toThrow(QueueError);
  });

  it('should refuse to work before it is initialized', async () => {
    const bare = container.resolve(BullMQStrategy);

    await expect(bare.publish(request())).rejects.toThrow('not initialized');
    await expect(bare.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined })).rejects.toThrow(
      'not initialized',
    );
  });

  describe('publishing', () => {
    it('should create one queue per name and reuse it', async () => {
      await strategy.publish(request());
      await strategy.publish(request());
      await strategy.publish(request({ queue: 'reports' }));

      expect(state.queues).toHaveLength(2);
      expect(state.queues[0].name).toBe('emails');
      expect(state.queues[0].options).toMatchObject({
        connection: { host: 'localhost', port: 6379 },
        prefix: 'app',
      });
    });

    it('should add the job under its name, with headers kept alongside the payload', async () => {
      const ref = await strategy.publish(request());

      expect(ref).toEqual({ id: '42', queue: 'emails', job: 'welcome', strategy: 'bullmq' });
      expect(state.queues[0].add).toHaveBeenCalledWith(
        'welcome',
        { payload: { id: 1 }, headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '1' } },
        expect.any(Object),
      );
    });

    it('should hand the job options to the broker', async () => {
      await strategy.publish(
        request({
          options: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 500 },
            delay: 1000,
            priority: 2,
            jobId: 'fixed',
            removeOnComplete: 10,
            removeOnFail: true,
          },
        }),
      );

      expect(state.queues[0].add.mock.calls[0][2]).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        delay: 1000,
        priority: 2,
        jobId: 'fixed',
        removeOnComplete: 10,
        removeOnFail: true,
      });
    });

    it('should leave the options it was given nothing for alone', async () => {
      await strategy.publish(request({ options: { attempts: 3 } }));

      // BullMQ merges these over the queue's defaultJobOptions with
      // Object.assign, so an own property holding undefined would erase a
      // configured default instead of leaving it in place.
      expect(state.queues[0].add.mock.calls[0][2]).toEqual({ attempts: 3 });
    });

    it('should treat a plain backoff number as a fixed delay', async () => {
      await strategy.publish(request({ options: { backoff: 250 } }));

      expect(state.queues[0].add.mock.calls[0][2].backoff).toEqual({ type: 'fixed', delay: 250 });
    });

    it('should wrap a broker failure', async () => {
      state.addError = new Error('redis down');

      await expect(strategy.publish(request())).rejects.toMatchObject({ name: 'QueueError', operation: 'publish' });
    });

    it('should publish many jobs in one call', async () => {
      const refs = await strategy.publishMany([request(), request({ payload: { id: 2 } })]);

      expect(refs.map((ref) => ref.id)).toEqual(['1', '2']);
      expect(state.queues[0].addBulk).toHaveBeenCalledWith([
        { name: 'welcome', data: { payload: { id: 1 }, headers: expect.any(Object) }, opts: expect.any(Object) },
        { name: 'welcome', data: { payload: { id: 2 }, headers: expect.any(Object) }, opts: expect.any(Object) },
      ]);
    });

    it('should do nothing when there is nothing to publish', async () => {
      expect(await strategy.publishMany([])).toEqual([]);
      expect(state.queues).toHaveLength(0);
    });

    it('should wrap a broker failure of a bulk publish', async () => {
      state.addError = new Error('redis down');

      await expect(strategy.publishMany([request()])).rejects.toMatchObject({ operation: 'publishMany' });
    });
  });

  describe('consuming', () => {
    it('should start a worker with the requested concurrency', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 4, dispatch: async () => undefined });

      expect(state.workers).toHaveLength(1);
      expect(state.workers[0].name).toBe('emails');
      expect(state.workers[0].options).toMatchObject({ concurrency: 4, prefix: 'app' });
    });

    it('should dispatch a job with its attempt and payload', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);
      const updateProgress = vi.fn();

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });

      await state.workers[0].processor({
        id: 7,
        name: 'welcome',
        data: { payload: { id: 1 }, headers: { 'x-tenant': 'acme' } },
        attemptsStarted: 2,
        attemptsMade: 1,
        opts: { attempts: 5 },
        updateProgress,
      });

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '7',
          job: 'welcome',
          payload: { id: 1 },
          headers: { 'x-tenant': 'acme' },
          attempt: 2,
          attempts: 5,
        }),
      );

      await dispatch.mock.calls[0][0].updateProgress(50);
      expect(updateProgress).toHaveBeenCalledWith(50);
    });

    it('should fall back to the attempts the broker made', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      await state.workers[0].processor({ id: 1, name: 'welcome', data: {}, attemptsStarted: 0, attemptsMade: 2, opts: {} });

      expect(dispatch.mock.calls[0][0]).toMatchObject({ attempt: 3, attempts: 1 });
    });

    it('should read a job added by another producer as a plain payload', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      await state.workers[0].processor({ id: 1, name: 'welcome', data: { userId: 'u1' }, attemptsStarted: 1, opts: {} });

      expect(dispatch.mock.calls[0][0]).toMatchObject({ payload: { userId: 'u1' }, headers: {} });
    });

    it('should treat an envelope without headers as empty ones', async () => {
      const dispatch = vi.fn().mockResolvedValue(undefined);

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });
      await state.workers[0].processor({
        id: 1,
        name: 'welcome',
        data: { payload: { id: 1 }, headers: null },
        attemptsStarted: 1,
        opts: {},
      });

      expect(dispatch.mock.calls[0][0]).toMatchObject({ headers: {} });
    });

    it('should let a failure reach the broker so it can retry', async () => {
      await strategy.consume({
        queue: 'emails',
        concurrency: 1,
        dispatch: async () => {
          throw new Error('boom');
        },
      });

      await expect(
        state.workers[0].processor({ id: 1, name: 'welcome', data: {}, attemptsStarted: 1, opts: {} }),
      ).rejects.toThrow('boom');
    });

    it('should log worker errors', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      state.workers[0].listeners.error(new Error('lost connection'));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Worker of "emails" failed'),
        expect.objectContaining({ message: 'lost connection' }),
      );
    });

    it('should replace a worker already running on the queue', async () => {
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });
      await strategy.consume({ queue: 'emails', concurrency: 2, dispatch: async () => undefined });

      expect(state.workers).toHaveLength(2);
      expect(state.workers[0].close).toHaveBeenCalled();
    });

    it('should close the worker when the consumer stops', async () => {
      const handle = await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      await handle.stop();

      expect(state.workers[0].close).toHaveBeenCalled();
    });
  });

  describe('unrecoverable failures', () => {
    it('should stop BullMQ retrying a failure that running the job again cannot fix', async () => {
      const dispatch = vi.fn().mockRejectedValue(new QueueError('bad payload', 'validate', undefined, undefined, false));

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });

      // BullMQ owns the retries here, so a validation failure would otherwise
      // burn every attempt the job was published with.
      await expect(
        state.workers[0].processor({ id: 1, name: 'welcome', data: { payload: {}, headers: {} }, attemptsMade: 0, opts: {} }),
      ).rejects.toMatchObject({ name: 'UnrecoverableError', message: 'bad payload' });
    });

    it('should carry the cause into the message BullMQ keeps', async () => {
      const dispatch = vi
        .fn()
        .mockRejectedValue(new QueueError('bad payload', 'validate', new Error('id must be a number'), undefined, false));

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });

      // BullMQ stores only the message as `failedReason`, so a cause left off it
      // is gone from the failed job record.
      await expect(
        state.workers[0].processor({ id: 1, name: 'welcome', data: { payload: {}, headers: {} }, attemptsMade: 0, opts: {} }),
      ).rejects.toMatchObject({ message: 'bad payload: id must be a number' });
    });

    it('should let a failure that could pass next time retry as usual', async () => {
      const dispatch = vi.fn().mockRejectedValue(new Error('redis blinked'));

      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch });

      await expect(
        state.workers[0].processor({ id: 1, name: 'welcome', data: { payload: {}, headers: {} }, attemptsMade: 0, opts: {} }),
      ).rejects.toThrow('redis blinked');
    });
  });

  describe('inspection and shutdown', () => {
    it('should report the job counts of a queue', async () => {
      expect(await strategy.stats('emails')).toEqual({ waiting: 1, active: 2, completed: 3, failed: 4, delayed: 5 });
      expect(state.queues[0].getJobCounts).toHaveBeenCalledWith('waiting', 'active', 'completed', 'failed', 'delayed');
    });

    it('should wrap a failure while reading the counts', async () => {
      state.countsError = new Error('redis down');

      await expect(strategy.stats('emails')).rejects.toMatchObject({ operation: 'stats' });
    });

    it('should show what a queue holds, failed jobs included', async () => {
      state.jobs = {
        waiting: [{ id: 1, name: 'welcome', data: { payload: { id: 1 }, headers: { 'x-job': 'welcome' } }, opts: {} }],
        failed: [
          {
            id: 2,
            name: 'bounce',
            data: { payload: { id: 2 }, headers: {} },
            opts: { attempts: 3 },
            attemptsMade: 3,
            failedReason: 'mailbox does not exist',
            stacktrace: ['Error: mailbox does not exist', '    at handler'],
          },
        ],
      };

      const messages = await strategy.peek({ queue: 'emails', limit: 20, states: ['waiting', 'failed'] });

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ id: '1', job: 'welcome', state: 'waiting', payload: { id: 1 } });
      expect(messages[1]).toMatchObject({ id: '2', job: 'bounce', state: 'failed', attempt: 3 });
      expect(messages[1].error).toMatchObject({ message: 'mailbox does not exist' });
      expect(messages[1].error?.stack).toContain('at handler');
    });

    it('should tell a delayed job when it becomes available', async () => {
      state.jobs = { delayed: [{ id: 3, name: 'welcome', data: {}, opts: { delay: 5000 }, timestamp: 1000 }] };

      const [message] = await strategy.peek({ queue: 'emails', limit: 20, states: ['delayed'] });

      expect(message).toMatchObject({ state: 'delayed', availableAt: 6000 });
    });

    it('should stop reading once the limit is reached', async () => {
      state.jobs = {
        waiting: [
          { id: 1, name: 'a', data: {}, opts: {} },
          { id: 2, name: 'b', data: {}, opts: {} },
        ],
        failed: [{ id: 3, name: 'c', data: {}, opts: {} }],
      };

      const messages = await strategy.peek({ queue: 'emails', limit: 2, states: ['waiting', 'failed'] });

      expect(messages.map((message) => message.job)).toEqual(['a', 'b']);
      expect(state.queues[0].getJobs).toHaveBeenCalledTimes(1);
    });

    it('should wrap a failure while reading the queue', async () => {
      state.jobsError = new Error('redis down');

      await expect(strategy.peek({ queue: 'emails', limit: 20, states: ['waiting'] })).rejects.toMatchObject({
        operation: 'peek',
      });
    });

    it('should close every worker and queue', async () => {
      await strategy.publish(request());
      await strategy.consume({ queue: 'emails', concurrency: 1, dispatch: async () => undefined });

      await strategy.close();

      expect(state.queues[0].close).toHaveBeenCalled();
      expect(state.workers[0].close).toHaveBeenCalled();

      // closing twice must not touch anything again
      await strategy.close();
      expect(state.queues[0].close).toHaveBeenCalledTimes(1);
    });
  });
});
