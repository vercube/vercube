import { ValidationProvider } from '@vercube/core';
import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Consumer } from '../../src/Decorators/Consumer';
import { Job } from '../../src/Decorators/Job';
import { OnJobCompleted } from '../../src/Decorators/OnJobCompleted';
import { OnJobFailed } from '../../src/Decorators/OnJobFailed';
import { QueueManager } from '../../src/Services/QueueManager';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { idSchema, RecordingStrategy } from '../Utils/Mock.mock';
import type { QueueTypes } from '../../src/Types/QueueTypes';

/** Records every call a consumer class makes, so tests can assert on them. */
const calls: { handler: string; payload: unknown; context?: QueueTypes.JobContext; error?: Error }[] = [];

@Consumer({ queue: 'emails', concurrency: 4, attempts: 2, timeout: 5000 })
class EmailConsumer {
  /** Proves the handler keeps its instance bound. */
  private readonly label: string = 'email';

  @Job('welcome')
  public async welcome(payload: unknown, context: QueueTypes.JobContext): Promise<void> {
    calls.push({ handler: `${this.label}.welcome`, payload, context });
  }

  @Job('digest', { attempts: 5, timeout: 10, schema: idSchema })
  public async digest(payload: unknown): Promise<void> {
    calls.push({ handler: `${this.label}.digest`, payload });
  }

  @Job('bounce')
  public async bounce(): Promise<void> {
    throw new Error('bounced');
  }

  @OnJobCompleted()
  public async completed(context: QueueTypes.JobContext): Promise<void> {
    calls.push({ handler: 'completed', payload: context.job, context });
  }

  @OnJobFailed({ job: 'bounce' })
  public async failed(error: Error, context: QueueTypes.JobContext): Promise<void> {
    calls.push({ handler: 'failed', payload: context.job, error });
  }
}

@Consumer({ queue: 'reports', strategy: 'secondary' })
class ReportConsumer {
  @Job('nightly')
  public async nightly(payload: unknown): Promise<void> {
    calls.push({ handler: 'report.nightly', payload });
  }
}

/** Inherits the queue of its base class. */
class ExtendedEmailConsumer extends EmailConsumer {
  @Job('reminder')
  public async reminder(payload: unknown): Promise<void> {
    calls.push({ handler: 'extended.reminder', payload });
  }
}

describe('Queue decorators', () => {
  let container: Container;
  let logger: Logger;
  let manager: QueueManager;

  beforeEach(() => {
    calls.length = 0;
    container = new Container();
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bindInstance(ValidationProvider, {
      validate: (schema, data) => (schema as typeof idSchema)['~standard'].validate(data),
    } as ValidationProvider);
    container.bind(QueueManager);

    manager = container.get(QueueManager);
    manager.configure({ autoStart: false });
  });

  describe('@Consumer and @Job', () => {
    it('should register every job of the class', () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      expect(manager.inspect().consumers).toEqual([
        expect.objectContaining({ strategy: 'default', queue: 'emails', job: 'welcome', source: 'EmailConsumer.welcome' }),
        expect.objectContaining({ queue: 'emails', job: 'digest', source: 'EmailConsumer.digest' }),
        expect.objectContaining({ queue: 'emails', job: 'bounce' }),
      ]);
    });

    it('should inherit the class options and let the job override them', () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      const consumers = manager.inspect().consumers;

      expect(consumers[0]).toMatchObject({ attempts: 2, timeout: 5000, validated: false });
      expect(consumers[1]).toMatchObject({ attempts: 5, timeout: 10, validated: true });
    });

    it('should read the strategy of the class', () => {
      container.bind(ReportConsumer);
      initializeContainer(container);

      expect(manager.inspect().consumers[0]).toMatchObject({ strategy: 'secondary', queue: 'reports' });
    });

    it('should pass the concurrency of the class to the transport', async () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      await manager.mount({ strategy: RecordingStrategy, initOptions: undefined });
      await manager.start();

      expect((manager.getStrategy() as RecordingStrategy).consumers.get('emails')?.concurrency).toBe(4);
    });

    it('should find the queue of a handler declared on a subclass', () => {
      container.bind(ExtendedEmailConsumer);
      initializeContainer(container);

      expect(manager.inspect().consumers).toContainEqual(
        expect.objectContaining({ queue: 'emails', job: 'reminder', source: 'ExtendedEmailConsumer.reminder' }),
      );
    });

    it('should run the handler on its own instance', async () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      await manager.mount({ strategy: MemoryStrategy });
      await manager.start();
      await manager.add({ queue: 'emails', job: 'welcome', payload: { id: 1 } });
      await (manager.getStrategy() as MemoryStrategy).idle();

      expect(calls[0]).toMatchObject({ handler: 'email.welcome', payload: { id: 1 } });
      expect(calls[0].context).toMatchObject({ queue: 'emails', job: 'welcome', attempt: 1, attempts: 2 });
    });

    it('should validate the payload of a job declaring a schema', async () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      await manager.mount({ strategy: MemoryStrategy });
      await manager.start();
      await manager.add({ queue: 'emails', job: 'digest', payload: { id: 'not a number' } });
      await (manager.getStrategy() as MemoryStrategy).idle();

      expect(calls.filter((call) => call.handler === 'email.digest')).toEqual([]);
      expect(manager.inspect().events[0]).toMatchObject({ job: 'digest', status: 'failed' });
    });

    it('should warn when the class is not a consumer', () => {
      class Orphan {
        @Job('lost')
        public async lost(): Promise<void> {}
      }

      container.bind(Orphan);
      initializeContainer(container);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Did you use @Consumer()?'));
      expect(manager.inspect().consumers).toEqual([]);
    });

    it('should warn when the decorated property is not a method', () => {
      @Consumer({ queue: 'emails' })
      class NotAMethod {
        @Job('lost')
        public lost: number = 1;
      }

      container.bind(NotAMethod);
      initializeContainer(container);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('is not a method'));
    });

    it('should warn when no queue manager is bound', () => {
      const bare = new Container();
      const bareLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

      bare.bindInstance(Container, bare);
      bare.bindInstance(Logger, bareLogger);
      bare.bind(ReportConsumer);
      initializeContainer(bare);

      expect(bareLogger.warn).toHaveBeenCalledWith(expect.stringContaining('QueueManager is not bound'));
    });

    it('should fall back to the console when no logger is bound', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const bare = new Container();

      bare.bindInstance(Container, bare);
      bare.bind(ReportConsumer);
      initializeContainer(bare);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('QueueManager is not bound'));
      warn.mockRestore();
    });

    it('should let a consumer class be bound again', () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      expect(() => {
        container.bind(EmailConsumer);
        initializeContainer(container);
      }).not.toThrow();

      expect(manager.inspect().consumers).toHaveLength(3);
    });
  });

  describe('@OnJobCompleted and @OnJobFailed', () => {
    beforeEach(async () => {
      container.bind(EmailConsumer);
      initializeContainer(container);

      await manager.mount({ strategy: MemoryStrategy });
      await manager.start();
    });

    it('should report every completed job of the queue', async () => {
      await manager.add({ queue: 'emails', job: 'welcome', payload: {} });
      await (manager.getStrategy() as MemoryStrategy).idle();

      expect(calls.map((call) => call.handler)).toEqual(['email.welcome', 'completed']);
    });

    it('should report a failed job of the job it listens to, once per attempt', async () => {
      const strategy = manager.getStrategy() as MemoryStrategy;

      await manager.add({ queue: 'emails', job: 'bounce', payload: {} });
      await strategy.idle();
      await manager.drain();
      await strategy.idle();

      // the class allows two attempts, and neither of them succeeds
      expect(calls.map((call) => call.handler)).toEqual(['failed', 'failed']);
      expect(calls[0].error?.message).toBe('bounced');
    });

    it('should ignore jobs the hook does not listen to', async () => {
      await manager.add({ queue: 'emails', job: 'digest', payload: { id: 1 } });
      await (manager.getStrategy() as MemoryStrategy).idle();

      expect(calls.map((call) => call.handler)).toEqual(['email.digest', 'completed']);
    });
  });

  describe('auto start', () => {
    it('should start consuming without an explicit start call', async () => {
      const auto = new Container();

      auto.bindInstance(Container, auto);
      auto.bind(QueueManager);
      auto.bind(EmailConsumer);
      initializeContainer(auto);

      const autoManager = auto.get(QueueManager);
      await autoManager.mount({ strategy: RecordingStrategy, initOptions: undefined });

      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      await autoManager.drain();

      expect(autoManager.started).toBe(true);
      expect((autoManager.getStrategy() as RecordingStrategy).consumers.has('emails')).toBe(true);
    });
  });
});
