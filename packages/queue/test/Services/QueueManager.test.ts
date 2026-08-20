import { ValidationProvider } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueError } from '../../src/Errors/QueueError';
import { QueueManager } from '../../src/Services/QueueManager';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { ATTEMPT_HEADER, ATTEMPTS_HEADER, JOB_HEADER, WILDCARD_JOB } from '../../src/Utils/Job';
import { idSchema, RecordingStrategy, registration } from '../Utils/Mock.mock';
import type { QueueTypes } from '../../src/Types/QueueTypes';

/** Logger stub recording every level. */
function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

describe('QueueManager', () => {
  let container: Container;
  let logger: Logger;
  let manager: QueueManager;

  beforeEach(() => {
    container = new Container();
    logger = createLogger();

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bindInstance(ValidationProvider, {
      validate: (schema, data) => (schema as typeof idSchema)['~standard'].validate(data),
    } as ValidationProvider);

    manager = container.resolve(QueueManager);
    manager.configure({ autoStart: false });
  });

  /**
   * Mounts the recording strategy and starts the manager.
   *
   * @param name - Mount name
   * @returns The mounted strategy
   */
  async function mountRecording(name?: string): Promise<RecordingStrategy> {
    await manager.mount({ name, strategy: RecordingStrategy, initOptions: { label: name ?? 'default' } });

    return manager.getStrategy(name) as RecordingStrategy;
  }

  describe('configuration', () => {
    it('should expose its defaults', () => {
      expect(manager.defaults).toEqual({
        autoStart: false,
        concurrency: 1,
        onUnhandled: 'ignore',
        maxEvents: 50,
        capturePayloads: false,
        maxPayloadBytes: 4096,
      });
    });

    it('should merge configuration and ignore undefined values', () => {
      manager.configure({ concurrency: 4, onUnhandled: undefined });

      expect(manager.defaults).toMatchObject({ concurrency: 4, onUnhandled: 'ignore' });
    });
  });

  describe('mounting', () => {
    it('should resolve the strategy through the container', async () => {
      const strategy = await mountRecording();

      expect(strategy).toBeInstanceOf(RecordingStrategy);
      expect(manager.getStrategy()).toBe(strategy);
    });

    it('should initialize a strategy once, on first use', async () => {
      const strategy = await mountRecording();

      expect(strategy.initialized).toBe(0);

      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });
      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });

      expect(strategy.initialized).toBe(1);
      expect(strategy.initOptions).toEqual({ label: 'default' });
    });

    it('should keep several strategies side by side', async () => {
      const first = await mountRecording();
      const second = await mountRecording('kafka');

      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });
      await manager.add({ strategy: 'kafka', queue: 'events', job: 'created', payload: {} });

      expect(first.published).toHaveLength(1);
      expect(second.published).toHaveLength(1);
    });

    it('should report a strategy that fails to initialize', async () => {
      const strategy = await mountRecording();
      strategy.initError = new Error('no broker');

      await expect(manager.add({ queue: 'emails', job: 'welcome', payload: {} })).rejects.toThrow(QueueError);
      expect(manager.inspect().strategies[0]).toMatchObject({ status: 'error', error: 'no broker' });
    });

    it('should retry initialization after a failure', async () => {
      const strategy = await mountRecording();
      strategy.initError = new Error('no broker');

      await expect(manager.add({ queue: 'emails', job: 'welcome', payload: {} })).rejects.toThrow(QueueError);

      strategy.initError = null;
      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });

      expect(strategy.initialized).toBe(2);
      expect(manager.inspect().strategies[0]).toMatchObject({ status: 'ready', error: undefined });
    });

    it('should stop and close a strategy on unmount', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();
      await manager.unmount();

      expect(strategy.stopped).toEqual(['emails']);
      expect(strategy.closed).toBe(1);
      expect(manager.getStrategy()).toBeUndefined();
    });

    it('should ignore unmounting something that is not mounted', async () => {
      await expect(manager.unmount('nothing')).resolves.toBeUndefined();
    });

    it('should start consuming a strategy mounted after the manager started', async () => {
      manager.registerConsumer(registration());
      await manager.start();

      const strategy = await mountRecording();

      expect(strategy.consumers.has('emails')).toBe(true);
    });
  });

  describe('publishing', () => {
    it('should publish a job with its routing headers', async () => {
      const strategy = await mountRecording();

      const ref = await manager.add({ queue: 'emails', job: 'welcome', payload: { id: 1 } });

      expect(ref).toMatchObject({ queue: 'emails', job: 'welcome' });
      expect(strategy.published[0]).toEqual({
        queue: 'emails',
        job: 'welcome',
        payload: { id: 1 },
        headers: { [JOB_HEADER]: 'welcome', [ATTEMPT_HEADER]: '1' },
        options: {},
      });
    });

    it('should carry the requested attempts and custom headers', async () => {
      const strategy = await mountRecording();

      await manager.add({
        queue: 'emails',
        job: 'welcome',
        payload: {},
        options: { attempts: 3, headers: { 'x-tenant': 'acme' } },
      });

      expect(strategy.published[0].headers).toEqual({
        'x-tenant': 'acme',
        [JOB_HEADER]: 'welcome',
        [ATTEMPT_HEADER]: '1',
        [ATTEMPTS_HEADER]: '3',
      });
    });

    it('should count published jobs', async () => {
      await mountRecording();

      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });

      expect(manager.inspect().metrics).toEqual([expect.objectContaining({ queue: 'emails', published: 1 })]);
    });

    it('should publish many jobs at once', async () => {
      const strategy = await mountRecording();

      const refs = await manager.addMany({ queue: 'emails', job: 'welcome', payloads: [{ id: 1 }, { id: 2 }] });

      expect(refs).toHaveLength(2);
      expect(strategy.published.map((request) => request.payload)).toEqual([{ id: 1 }, { id: 2 }]);
      expect(manager.inspect().metrics[0]).toMatchObject({ published: 2 });
    });

    it('should do nothing when there is no payload to publish', async () => {
      const strategy = await mountRecording();

      expect(await manager.addMany({ queue: 'emails', job: 'welcome', payloads: [] })).toEqual([]);
      expect(strategy.initialized).toBe(0);
    });

    it('should fail when nothing is mounted under the requested name', async () => {
      await mountRecording();

      await expect(manager.add({ strategy: 'kafka', queue: 'emails', job: 'welcome', payload: {} })).rejects.toThrow(
        'No queue strategy is mounted as "kafka"',
      );
    });

    it('should wrap a transport failure', async () => {
      const strategy = await mountRecording();
      strategy.publishError = new Error('broker down');

      await expect(manager.add({ queue: 'emails', job: 'welcome', payload: {} })).rejects.toMatchObject({
        name: 'QueueError',
        operation: 'add',
      });

      strategy.publishError = new Error('broker down');
      await expect(manager.addMany({ queue: 'emails', job: 'welcome', payloads: [{}] })).rejects.toMatchObject({
        operation: 'addMany',
      });
    });
  });

  describe('registering handlers', () => {
    it('should refuse two handlers for the same job', () => {
      manager.registerConsumer(registration());

      expect(() => manager.registerConsumer(registration({ source: 'Other.welcome' }))).toThrow('already has a handler');
    });

    it('should allow the same job name on another queue or strategy', () => {
      manager.registerConsumer(registration());

      expect(() => manager.registerConsumer(registration({ queue: 'reports' }))).not.toThrow();
      expect(() => manager.registerConsumer(registration({ strategy: 'kafka' }))).not.toThrow();
    });

    it('should start consuming a queue registered after the manager started', async () => {
      const strategy = await mountRecording();
      await manager.start();

      expect(strategy.consumers.size).toBe(0);

      manager.registerConsumer(registration());
      await manager.drain();

      expect(strategy.consumers.has('emails')).toBe(true);
    });
  });

  describe('starting and stopping', () => {
    it('should consume every queue that has a handler', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      manager.registerConsumer(registration({ job: 'digest' }));
      manager.registerConsumer(registration({ queue: 'reports', job: 'nightly' }));

      await manager.start();

      expect([...strategy.consumers.keys()]).toEqual(['emails', 'reports']);
      expect(manager.started).toBe(true);
    });

    it('should use the highest concurrency requested for a queue', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ concurrency: 2 }));
      manager.registerConsumer(registration({ job: 'digest', concurrency: 5 }));

      await manager.start();

      expect(strategy.consumers.get('emails')?.concurrency).toBe(5);
    });

    it('should fall back to the configured concurrency', async () => {
      const strategy = await mountRecording();

      manager.configure({ concurrency: 3 });
      manager.registerConsumer(registration());
      await manager.start();

      expect(strategy.consumers.get('emails')?.concurrency).toBe(3);
    });

    it('should not consume a second time when started twice', async () => {
      const strategy = await mountRecording();
      const consume = vi.spyOn(strategy, 'consume');

      manager.registerConsumer(registration());
      await manager.start();
      await manager.start();

      expect(consume).toHaveBeenCalledTimes(1);
    });

    it('should log a strategy that cannot be consumed', async () => {
      const strategy = await mountRecording();
      strategy.consumeError = new Error('no group');

      manager.registerConsumer(registration());
      await manager.start();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to consume queue "emails"'), expect.anything());
    });

    it('should not start consumers of a strategy that cannot connect', async () => {
      const strategy = await mountRecording();
      strategy.initError = new Error('no broker');

      manager.registerConsumer(registration());
      await manager.start();

      expect(strategy.consumers.size).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize strategy'), expect.anything());
    });

    it('should stop consumers but keep publishing available', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();
      await manager.stop();

      expect(strategy.stopped).toEqual(['emails']);
      expect(strategy.closed).toBe(0);
      expect(manager.started).toBe(false);

      await expect(manager.add({ queue: 'emails', job: 'welcome', payload: {} })).resolves.toBeDefined();
    });

    it('should log a consumer that fails to stop', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();

      const handle = strategy.consumers.get('emails');
      vi.spyOn(strategy, 'consume');
      strategy.consumers.set('emails', handle!);

      // replace the stop function of the handle the manager holds
      const manual = manager as unknown as { fConsumers: Map<string, QueueTypes.ConsumerHandle> };
      manual.fConsumers.set('default::emails', {
        queue: 'emails',
        stop: async () => {
          throw new Error('stuck');
        },
      });

      await manager.stop();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to stop consumer'), expect.anything());
    });

    it('should close every strategy', async () => {
      const first = await mountRecording();
      const second = await mountRecording('kafka');

      manager.registerConsumer(registration());
      await manager.start();
      await manager.close();

      // every mount connects on start, so every one of them is closed again
      expect(first.closed).toBe(1);
      expect(second.closed).toBe(1);
    });

    it('should log a strategy that fails to close', async () => {
      const strategy = await mountRecording();
      vi.spyOn(strategy, 'close').mockRejectedValue(new Error('stuck'));

      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });
      await manager.close();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to close strategy'), expect.anything());
    });
  });

  describe('processing', () => {
    it('should route a job to the handler of its name', async () => {
      const strategy = await mountRecording();
      const welcome = vi.fn();
      const digest = vi.fn();

      manager.registerConsumer(registration({ handler: welcome }));
      manager.registerConsumer(registration({ job: 'digest', handler: digest }));
      await manager.start();

      await strategy.deliver('emails', { job: 'digest', payload: { id: 7 } });

      expect(welcome).not.toHaveBeenCalled();
      expect(digest).toHaveBeenCalledTimes(1);
      expect(digest.mock.calls[0][0]).toEqual({ id: 7 });
    });

    it('should describe the job in the handler context', async () => {
      const strategy = await mountRecording();
      const handler = vi.fn();

      manager.registerConsumer(registration({ handler, options: { attempts: 3 } }));
      await manager.start();

      await strategy.deliver('emails', { id: 'abc', job: 'welcome', payload: { id: 1 }, attempt: 2, headers: { a: 'b' } });

      const context = handler.mock.calls[0][1] as QueueTypes.JobContext;

      expect(context).toMatchObject({
        id: 'abc',
        job: 'welcome',
        queue: 'emails',
        strategy: 'default',
        attempt: 2,
        attempts: 3,
        payload: { id: 1 },
        headers: { a: 'b' },
      });
    });

    it('should let the handler report progress', async () => {
      const strategy = await mountRecording();
      const updateProgress = vi.fn();

      manager.registerConsumer(
        registration({
          handler: async (_payload, context) => {
            await context.updateProgress(42);
          },
        }),
      );
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', updateProgress });

      expect(updateProgress).toHaveBeenCalledWith(42);
    });

    it('should survive a transport with no progress support', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(
        registration({
          handler: async (_payload, context) => {
            await context.updateProgress(42);
          },
        }),
      );
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).resolves.toBeUndefined();
    });

    it('should give the handler a job scoped logger', async () => {
      const child = createLogger();
      (logger as unknown as { child: unknown }).child = vi.fn().mockReturnValue(child);

      const strategy = await mountRecording();
      const handler = vi.fn();

      manager.registerConsumer(registration({ handler }));
      await manager.start();
      await strategy.deliver('emails', { job: 'welcome', id: 'abc' });

      expect(logger.child).toHaveBeenCalledWith({ queue: 'emails', job: 'welcome', jobId: 'abc', attempt: 1 });
      expect((handler.mock.calls[0][1] as QueueTypes.JobContext).logger).toBe(child);
    });

    it('should count a processed job', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();
      await strategy.deliver('emails', { job: 'welcome' });

      expect(manager.inspect().metrics[0]).toMatchObject({ processed: 1, failed: 0, active: 0 });
      expect(manager.inspect().events[0]).toMatchObject({ job: 'welcome', status: 'completed', attempt: 1 });
    });

    it('should ignore a job with no handler by default', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'unknown' })).resolves.toBeUndefined();
      expect(manager.inspect().metrics[0]).toMatchObject({ unhandled: 1 });
      expect(manager.inspect().events[0]).toMatchObject({ status: 'unhandled' });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No handler for job "unknown"'));
    });

    it('should fail a job with no handler when asked to', async () => {
      const strategy = await mountRecording();

      manager.configure({ onUnhandled: 'fail' });
      manager.registerConsumer(registration());
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'unknown' })).rejects.toMatchObject({
        name: 'QueueError',
        retryable: false,
      });
    });
  });

  describe('the fallback handler', () => {
    it('should pick up a job no named handler claims', async () => {
      const strategy = await mountRecording();
      const named = vi.fn();
      const fallback = vi.fn();

      manager.registerConsumer(registration({ handler: named }));
      manager.registerConsumer(registration({ job: WILDCARD_JOB, handler: fallback, source: 'C.any' }));
      await manager.start();

      await strategy.deliver('emails', { job: 'never-declared', payload: { id: 1 } });

      expect(named).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(fallback.mock.calls[0][0]).toEqual({ id: 1 });
    });

    it('should let a named handler win over the fallback', async () => {
      const strategy = await mountRecording();
      const named = vi.fn();
      const fallback = vi.fn();

      manager.registerConsumer(registration({ handler: named }));
      manager.registerConsumer(registration({ job: WILDCARD_JOB, handler: fallback, source: 'C.any' }));
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome' });

      expect(named).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should report the real job name, not the wildcard', async () => {
      const strategy = await mountRecording();
      const handler = vi.fn();

      manager.registerConsumer(registration({ job: WILDCARD_JOB, handler, source: 'C.any' }));
      await manager.start();

      await strategy.deliver('emails', { job: 'OrderPlaced', id: 'evt-1' });

      expect((handler.mock.calls[0][1] as QueueTypes.JobContext).job).toBe('OrderPlaced');
      expect(manager.inspect().events[0]).toMatchObject({ job: 'OrderPlaced', status: 'completed' });
      expect(manager.inspect().metrics[0]).toMatchObject({ processed: 1, unhandled: 0 });
    });

    it('should retry under the real job name', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(
        registration({ job: WILDCARD_JOB, handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 2 } }),
      );
      await manager.start();

      await strategy.deliver('emails', { job: 'OrderPlaced' });
      await manager.drain();

      expect(strategy.published[0]).toMatchObject({ job: 'OrderPlaced', headers: { [ATTEMPT_HEADER]: '2' } });
    });

    it('should apply its own options', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ job: WILDCARD_JOB, handler: vi.fn(), options: { schema: idSchema } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'anything', payload: { id: 'nope' } })).rejects.toMatchObject({
        operation: 'validate',
      });
    });

    it('should report a job as unhandled when there is no fallback', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();
      await strategy.deliver('emails', { job: 'never-declared' });

      expect(manager.inspect().metrics[0]).toMatchObject({ unhandled: 1 });
    });

    it('should not leak across queues or strategies', async () => {
      const strategy = await mountRecording();
      const fallback = vi.fn();

      manager.registerConsumer(registration({ job: WILDCARD_JOB, handler: fallback, source: 'C.any' }));
      manager.registerConsumer(registration({ queue: 'reports', job: 'nightly' }));
      await manager.start();

      await strategy.deliver('reports', { job: 'whatever' });

      expect(fallback).not.toHaveBeenCalled();
      expect(manager.inspect().metrics.find((entry) => entry.queue === 'reports')).toMatchObject({ unhandled: 1 });
    });

    it('should let a hook filtered by the wildcard watch every job', async () => {
      const strategy = await mountRecording();
      const hook = vi.fn();

      manager.registerConsumer(registration({ job: WILDCARD_JOB, handler: vi.fn(), source: 'C.any' }));
      manager.registerHook('completed', {
        strategy: 'default',
        queue: 'emails',
        job: WILDCARD_JOB,
        hook,
        source: 'C.done',
      });
      await manager.start();

      await strategy.deliver('emails', { job: 'anything' });

      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it('should hand the validated payload to the handler', async () => {
      const strategy = await mountRecording();
      const handler = vi.fn();

      manager.registerConsumer(registration({ handler, options: { schema: idSchema } }));
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', payload: { id: 5 } });

      expect(handler).toHaveBeenCalledWith({ id: 5 }, expect.objectContaining({ payload: { id: 5 } }));
    });

    it('should fail a job whose payload does not match, without retrying it', async () => {
      const strategy = await mountRecording();
      const handler = vi.fn();

      manager.registerConsumer(registration({ handler, options: { schema: idSchema, attempts: 3 } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', payload: { id: 'nope' } })).rejects.toMatchObject({
        name: 'QueueError',
        operation: 'validate',
        retryable: false,
      });

      expect(handler).not.toHaveBeenCalled();
      expect(strategy.published).toHaveLength(0);
    });

    it('should fail when a schema is declared but no provider is bound', async () => {
      const bare = new Container();
      bare.bindInstance(Container, bare);

      const bareManager = bare.resolve(QueueManager);
      bareManager.configure({ autoStart: false });
      await bareManager.mount({ strategy: RecordingStrategy, initOptions: undefined });

      const strategy = bareManager.getStrategy() as RecordingStrategy;

      bareManager.registerConsumer(registration({ options: { schema: idSchema } }));
      await bareManager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toThrow('no ValidationProvider is bound');
    });
  });

  describe('failures and retries', () => {
    it('should republish a failed job for its next attempt', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 3 } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', payload: { id: 1 } })).resolves.toBeUndefined();
      await manager.drain();

      expect(strategy.published).toHaveLength(1);
      expect(strategy.published[0]).toMatchObject({
        queue: 'emails',
        job: 'welcome',
        payload: { id: 1 },
        headers: { [ATTEMPT_HEADER]: '2', [ATTEMPTS_HEADER]: '3' },
      });
      expect(manager.inspect().metrics[0]).toMatchObject({ failed: 1, retried: 1 });
      expect(manager.inspect().events[0]).toMatchObject({
        status: 'retried',
        error: { name: 'Error', message: 'boom' },
      });
    });

    it('should hand the backoff to a transport that can delay jobs', async () => {
      const strategy = await mountRecording();
      strategy.reported = { ...strategy.reported, delay: true };

      manager.registerConsumer(
        registration({
          handler: vi.fn().mockRejectedValue(new Error('boom')),
          options: { attempts: 3, backoff: { type: 'exponential', delay: 100 } },
        }),
      );
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', attempt: 2 });
      await manager.drain();

      expect(strategy.published[0].options).toEqual({ delay: 200 });
    });

    it('should wait for the backoff itself when the transport cannot delay', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(
        registration({ handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 2, backoff: 20 } }),
      );
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome' });

      expect(strategy.published).toHaveLength(0);

      await manager.drain();

      expect(strategy.published[0].options).toEqual({});
    });

    it('should report a retry that cannot be published', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 2 } }));
      await manager.start();

      strategy.publishError = new Error('broker down');
      await strategy.deliver('emails', { job: 'welcome' });
      await manager.drain();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to schedule retry'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should give up once the attempts are exhausted', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 2 } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', attempt: 2 })).rejects.toThrow('boom');
      expect(strategy.published).toHaveLength(0);
      expect(manager.inspect().events[0]).toMatchObject({ status: 'failed', attempt: 2 });
    });

    it('should leave retries to a transport that owns them', async () => {
      const strategy = await mountRecording();
      strategy.reported = { ...strategy.reported, retries: true };

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 3 } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toThrow('boom');
      expect(strategy.published).toHaveLength(0);
      expect(manager.inspect().metrics[0]).toMatchObject({ failed: 1, retried: 0 });
    });

    it('should prefer the attempts the job was published with', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')), options: { attempts: 1 } }));
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', headers: { [ATTEMPTS_HEADER]: '2' } });
      await manager.drain();

      expect(strategy.published).toHaveLength(1);
    });

    it('should trust the attempt count a transport reports', async () => {
      const strategy = await mountRecording();
      const handler = vi.fn();

      manager.registerConsumer(registration({ handler, options: { attempts: 9 } }));
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', attempts: 2 });

      expect((handler.mock.calls[0][1] as QueueTypes.JobContext).attempts).toBe(2);
    });

    it('should fail a job that outlives its timeout', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(
        registration({
          handler: () => new Promise((resolve) => setTimeout(resolve, 100)),
          options: { timeout: 10 },
        }),
      );
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toMatchObject({
        name: 'QueueError',
        operation: 'timeout',
      });
    });

    it('should not time out a handler that returns in time', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ options: { timeout: 100 } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).resolves.toBeUndefined();
    });

    it('should keep the last error on the queue metrics', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toThrow('boom');
      expect(manager.inspect().metrics[0]).toMatchObject({ lastError: 'boom' });
    });
  });

  describe('failure detail', () => {
    it('should describe a plain error with its stack', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new TypeError('nope')) }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toThrow('nope');

      const event = manager.inspect().events[0];

      expect(event.error).toMatchObject({ name: 'TypeError', message: 'nope' });
      expect(event.error?.stack).toContain('TypeError: nope');
      expect(event.source).toBe('TestConsumer.welcome');
    });

    it('should describe a queue error with its operation and retryability', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn(), options: { schema: idSchema } }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', payload: { id: 'no' } })).rejects.toThrow();

      expect(manager.inspect().events[0].error).toMatchObject({
        name: 'QueueError',
        operation: 'validate',
        retryable: false,
      });
    });

    it('should describe an unhandled job as a failure of its own', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await manager.start();
      await strategy.deliver('emails', { job: 'nobody-home' });

      expect(manager.inspect().events[0]).toMatchObject({
        status: 'unhandled',
        error: { operation: 'process', retryable: false },
      });
    });

    it('should keep no payload unless capturing is on', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', payload: { id: 1 } })).rejects.toThrow();

      const event = manager.inspect().events[0];

      expect(event.payload).toBeUndefined();
      expect(event.headers).toBeUndefined();
    });

    it('should keep the payload and headers of a failure when capturing is on', async () => {
      const strategy = await mountRecording();

      manager.configure({ capturePayloads: true });
      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      await manager.start();

      await expect(
        strategy.deliver('emails', { job: 'welcome', payload: { id: 1 }, headers: { 'x-tenant': 'acme' } }),
      ).rejects.toThrow();

      const event = manager.inspect().events[0];

      expect(JSON.parse(event.payload!)).toEqual({ id: 1 });
      expect(event.headers).toEqual({ 'x-tenant': 'acme' });
    });

    it('should withhold credential-looking fields and headers', async () => {
      const strategy = await mountRecording();

      manager.configure({ capturePayloads: true });
      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      await manager.start();

      await expect(
        strategy.deliver('emails', {
          job: 'welcome',
          payload: { userId: 'u-1', accessToken: 'leak-me', nested: { password: 'leak-me' } },
          headers: { authorization: 'Bearer leak-me', 'x-tenant': 'acme' },
        }),
      ).rejects.toThrow();

      const event = manager.inspect().events[0];

      expect(event.payload).not.toContain('leak-me');
      expect(event.payload).toContain('u-1');
      expect(event.headers).toEqual({ authorization: '<redacted>', 'x-tenant': 'acme' });
    });

    it('should cap the payload preview and the stack', async () => {
      const strategy = await mountRecording();

      manager.configure({ capturePayloads: true, maxPayloadBytes: 64 });
      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', payload: { blob: 'x'.repeat(500) } })).rejects.toThrow();

      const event = manager.inspect().events[0];

      expect(event.payload).toContain('truncated');
      expect(event.payload!.length).toBeLessThan(200);
      expect(event.error!.stack!.length).toBeLessThanOrEqual(64);
    });

    it('should keep nothing for a job that completed', async () => {
      const strategy = await mountRecording();

      manager.configure({ capturePayloads: true });
      manager.registerConsumer(registration());
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', payload: { id: 1 } });

      const event = manager.inspect().events[0];

      expect(event.status).toBe('completed');
      expect(event.payload).toBeUndefined();
      expect(event.headers).toBeUndefined();
    });

    it('should survive a payload that cannot be serialized', async () => {
      const strategy = await mountRecording();
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      manager.configure({ capturePayloads: true });
      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome', payload: circular })).rejects.toThrow();

      expect(manager.inspect().events[0].payload).toBe('<unserializable>');
    });
  });

  describe('hooks', () => {
    it('should run the completed hooks of the queue', async () => {
      const strategy = await mountRecording();
      const hook = vi.fn();

      manager.registerConsumer(registration());
      manager.registerHook('completed', { strategy: 'default', queue: 'emails', hook, source: 'Consumer.done' });
      manager.registerHook('completed', {
        strategy: 'default',
        queue: 'reports',
        hook: vi.fn(),
        source: 'Other.done',
      });
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome' });

      expect(hook).toHaveBeenCalledWith(expect.objectContaining({ job: 'welcome' }));
    });

    it('should run the failed hooks with the error', async () => {
      const strategy = await mountRecording();
      const hook = vi.fn();

      manager.registerConsumer(registration({ handler: vi.fn().mockRejectedValue(new Error('boom')) }));
      manager.registerHook('failed', { strategy: 'default', queue: 'emails', hook, source: 'Consumer.failed' });
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).rejects.toThrow('boom');
      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'boom' }),
        expect.objectContaining({ job: 'welcome' }),
      );
    });

    it('should honour a job filter on a hook', async () => {
      const strategy = await mountRecording();
      const hook = vi.fn();

      manager.registerConsumer(registration());
      manager.registerConsumer(registration({ job: 'digest' }));
      manager.registerHook('completed', {
        strategy: 'default',
        queue: 'emails',
        job: 'digest',
        hook,
        source: 'Consumer.done',
      });
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome' });
      expect(hook).not.toHaveBeenCalled();

      await strategy.deliver('emails', { job: 'digest' });
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('should not let a throwing hook change the outcome', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      manager.registerHook('completed', {
        strategy: 'default',
        queue: 'emails',
        hook: vi.fn().mockRejectedValue(new Error('hook down')),
        source: 'Consumer.done',
      });
      await manager.start();

      await expect(strategy.deliver('emails', { job: 'welcome' })).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Hook Consumer.done threw'), expect.anything());
    });
  });

  describe('inspection', () => {
    it('should describe strategies, handlers and counters', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration({ options: { attempts: 2, timeout: 500, schema: idSchema } }));
      await manager.start();
      await strategy.deliver('emails', { job: 'welcome', payload: { id: 1 } });

      const snapshot = manager.inspect();

      expect(snapshot.started).toBe(true);
      expect(snapshot.strategies[0]).toMatchObject({
        name: 'default',
        transport: 'recording',
        driver: 'RecordingStrategy',
        status: 'ready',
      });
      expect(snapshot.consumers[0]).toMatchObject({
        queue: 'emails',
        job: 'welcome',
        source: 'TestConsumer.welcome',
        attempts: 2,
        timeout: 500,
        validated: true,
        running: true,
      });
      expect(snapshot.metrics[0]).toMatchObject({ processed: 1 });
    });

    it('should report an idle strategy before its first use', async () => {
      await mountRecording();

      expect(manager.inspect().strategies[0]).toMatchObject({ status: 'idle' });
    });

    it('should keep only the newest events', async () => {
      const strategy = await mountRecording();

      manager.configure({ maxEvents: 2 });
      manager.registerConsumer(registration());
      await manager.start();

      await strategy.deliver('emails', { job: 'welcome', id: '1' });
      await strategy.deliver('emails', { job: 'welcome', id: '2' });
      await strategy.deliver('emails', { job: 'welcome', id: '3' });

      expect(manager.inspect().events.map((event) => event.id)).toEqual(['3', '2']);
    });

    it('should be able to keep no events at all', async () => {
      const strategy = await mountRecording();

      manager.configure({ maxEvents: 0 });
      manager.registerConsumer(registration());
      await manager.start();
      await strategy.deliver('emails', { job: 'welcome' });

      expect(manager.inspect().events).toEqual([]);
    });

    it('should read the counters of a queue from the transport', async () => {
      await mountRecording();

      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });

      expect(await manager.stats({ queue: 'emails' })).toEqual({ waiting: 1 });
    });

    it('should report no counters for an unknown strategy', async () => {
      expect(await manager.stats({ queue: 'emails', strategy: 'nothing' })).toEqual({});
    });

    it('should report no counters when the transport keeps none', async () => {
      await manager.mount({ strategy: MemoryStrategy });

      const strategy = manager.getStrategy() as MemoryStrategy;
      (strategy as unknown as { stats?: unknown }).stats = undefined;

      expect(await manager.stats({ queue: 'emails' })).toEqual({});
    });

    it('should survive a transport that fails to report counters', async () => {
      const strategy = await mountRecording();
      vi.spyOn(strategy, 'stats').mockRejectedValue(new Error('no info'));

      expect(await manager.stats({ queue: 'emails' })).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith('Vercube/QueueManager::stats', expect.anything());
    });
  });

  describe('container lifecycle', () => {
    it('should start consumers once the container is initialized', async () => {
      const bound = new Container();
      bound.bindInstance(Container, bound);
      bound.bind(QueueManager);
      initializeContainer(bound);

      const auto = bound.get(QueueManager);
      await auto.mount({ strategy: RecordingStrategy, initOptions: undefined });
      auto.registerConsumer(registration());

      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      await auto.drain();

      expect(auto.started).toBe(true);
      expect((auto.getStrategy() as RecordingStrategy).consumers.has('emails')).toBe(true);
    });

    it('should stay idle when auto start is disabled', async () => {
      const strategy = await mountRecording();

      manager.registerConsumer(registration());
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

      expect(manager.started).toBe(false);
      expect(strategy.consumers.size).toBe(0);
    });
  });

  describe('end to end', () => {
    it('should carry a job from add to handler through the memory strategy', async () => {
      await manager.mount({ strategy: MemoryStrategy });

      const seen: unknown[] = [];

      manager.registerConsumer(
        registration({
          handler: async (payload) => {
            seen.push(payload);
          },
        }),
      );

      await manager.start();
      await manager.add({ queue: 'emails', job: 'welcome', payload: { id: 1 } });
      await (manager.getStrategy() as MemoryStrategy).idle();

      expect(seen).toEqual([{ id: 1 }]);
      expect(manager.inspect().metrics[0]).toMatchObject({ published: 1, processed: 1 });
    });

    it('should retry a failing job through the memory strategy until it succeeds', async () => {
      await manager.mount({ strategy: MemoryStrategy });

      const handler = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);

      manager.registerConsumer(registration({ handler, options: { attempts: 3 } }));

      await manager.start();
      await manager.add({ queue: 'emails', job: 'welcome', payload: { id: 1 } });

      const strategy = manager.getStrategy() as MemoryStrategy;
      await strategy.idle();
      await manager.drain();
      await strategy.idle();

      expect(handler).toHaveBeenCalledTimes(2);
      expect(manager.inspect().metrics[0]).toMatchObject({ processed: 1, failed: 1, retried: 1 });
    });
  });
});
