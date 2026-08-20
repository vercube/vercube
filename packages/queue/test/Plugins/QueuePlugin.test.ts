import { Container } from '@vercube/di';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueuePlugin } from '../../src/Plugins/QueuePlugin';
import { QueueManager } from '../../src/Services/QueueManager';
import { MemoryStrategy } from '../../src/Strategies/MemoryStrategy';
import { RecordingStrategy } from '../Utils/Mock.mock';
import type { App } from '@vercube/core';

describe('QueuePlugin', () => {
  let container: Container;
  let app: App;
  let plugin: QueuePlugin;

  beforeEach(() => {
    container = new Container();
    container.bindInstance(Container, container);

    app = { container } as unknown as App;
    plugin = container.resolve(QueuePlugin);
  });

  it('should be named', () => {
    expect(plugin.name).toBe('QueuePlugin');
  });

  it('should bind the queue manager', async () => {
    await plugin.use(app);

    expect(container.get(QueueManager)).toBeInstanceOf(QueueManager);
  });

  it('should mount every configured strategy', async () => {
    await plugin.use(app, {
      strategies: [
        { strategy: MemoryStrategy },
        { name: 'recording', strategy: RecordingStrategy, initOptions: { label: 'recording' } },
      ],
    });

    const manager = container.get(QueueManager);

    expect(manager.getStrategy()).toBeInstanceOf(MemoryStrategy);
    expect(manager.getStrategy('recording')).toBeInstanceOf(RecordingStrategy);
  });

  it('should apply the manager settings it is given', async () => {
    await plugin.use(app, { autoStart: false, concurrency: 8, onUnhandled: 'fail', maxEvents: 10 });

    expect(container.get(QueueManager).defaults).toEqual({
      autoStart: false,
      concurrency: 8,
      onUnhandled: 'fail',
      maxEvents: 10,
    });
  });

  it('should keep the defaults when no options are given', async () => {
    await plugin.use(app);

    expect(container.get(QueueManager).defaults).toMatchObject({ autoStart: true, concurrency: 1 });
  });
});
