import { Container, initializeContainer } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Consumer } from '../../src/Decorators/Consumer';
import { Job } from '../../src/Decorators/Job';
import { OnJobCompleted } from '../../src/Decorators/OnJobCompleted';
import { OnJobFailed } from '../../src/Decorators/OnJobFailed';
import { QueueManager } from '../../src/Services/QueueManager';
import { RecordingStrategy } from '../Utils/Mock.mock';

/** Every hook call the consumers below made. */
const calls: string[] = [];

@Consumer({ queue: 'emails' })
class HookedConsumer {
  @Job('welcome')
  public async welcome(): Promise<void> {
    calls.push('welcome');
  }

  @OnJobCompleted()
  public completed(): void {
    calls.push('completed');
  }
}

@Consumer({ queue: 'emails' })
class NotAMethodConsumer {
  @OnJobFailed()
  public failed: number = 1;
}

class OrphanHookConsumer {
  @OnJobCompleted()
  public completed(): void {
    calls.push('orphan');
  }
}

describe('Job hook decorators', () => {
  let container: Container;
  let logger: Logger;
  let manager: QueueManager;

  beforeEach(() => {
    calls.length = 0;
    container = new Container();
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    container.bindInstance(Container, container);
    container.bindInstance(Logger, logger);
    container.bind(QueueManager);

    manager = container.get(QueueManager);
    manager.configure({ autoStart: false });
  });

  it('should warn when the class is not a consumer', () => {
    container.bind(OrphanHookConsumer);
    initializeContainer(container);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Did you use @Consumer()?'));
  });

  it('should warn when the decorated property is not a method', () => {
    container.bind(NotAMethodConsumer);
    initializeContainer(container);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('is not a method'));
  });

  it('should warn when no queue manager is bound', () => {
    const bare = new Container();
    const bareLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    bare.bindInstance(Container, bare);
    bare.bindInstance(Logger, bareLogger);
    bare.bind(HookedConsumer);
    initializeContainer(bare);

    expect(bareLogger.warn).toHaveBeenCalledWith(expect.stringContaining('QueueManager is not bound'));
  });

  it('should fall back to the console when no logger is bound', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bare = new Container();

    bare.bindInstance(Container, bare);
    bare.bind(OrphanHookConsumer);
    initializeContainer(bare);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('QueueManager is not bound'));
    warn.mockRestore();
  });

  it('should drop the hook of a consumer that is bound again', async () => {
    container.bind(HookedConsumer);
    initializeContainer(container);

    // rebinding disposes the previous instance, which must take its hook with it
    container.bind(HookedConsumer);
    initializeContainer(container);

    await manager.mount({ strategy: RecordingStrategy, initOptions: undefined });
    await manager.start();

    const strategy = manager.getStrategy() as RecordingStrategy;

    await strategy.deliver('emails', { job: 'welcome' });

    expect(calls).toEqual(['welcome', 'completed']);
  });
});
