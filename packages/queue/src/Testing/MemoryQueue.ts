import { QueuePlugin } from '../Plugins/QueuePlugin';
import { QueueManager } from '../Services/QueueManager';
import { MemoryStrategy } from '../Strategies/MemoryStrategy';
import type { QueueTypes } from '../Types/QueueTypes';
import type { TestingTypes } from '@vercube/testing';

/**
 * The extension {@link withMemoryQueue} returns.
 */
export interface MemoryQueueExtension extends TestingTypes.Extension {
  /** The queue manager of the app under test, once it has booted. */
  readonly manager: QueueManager;

  /**
   * Waits until every published job has been processed, retries included.
   *
   * @returns Resolves once the queue is idle
   */
  drain(): Promise<void>;

  /**
   * The attempts processed so far, oldest first.
   *
   * @returns The processed attempts
   */
  events(): QueueTypes.JobEvent[];
}

/**
 * Mounts the in-memory strategy as `default` for `createTestApp()` from
 * `@vercube/testing`, so consumers run in the test process.
 *
 * @param options - Queue plugin defaults, such as `autoStart`
 * @returns The extension
 *
 * @example
 * ```ts
 * const queue = withMemoryQueue();
 * const app = await createTestApp({ providers: [EmailConsumer], extensions: [queue] });
 *
 * await app.post('/signup').json({ email: 'ada@example.com' }).expect(201);
 * await queue.drain();
 *
 * expect(queue.events()).toMatchObject([{ queue: 'emails', job: 'welcome', status: 'completed' }]);
 * ```
 */
export function withMemoryQueue(options: Omit<QueueTypes.PluginOptions, 'strategies'> = {}): MemoryQueueExtension {
  let manager: QueueManager | null = null;

  const current = (): QueueManager => {
    if (!manager) {
      throw new Error('withMemoryQueue() is not set up yet: pass it to createTestApp({ extensions }) first.');
    }

    return manager;
  };

  return {
    name: 'withMemoryQueue',
    get manager() {
      return current();
    },
    setup: (app) => {
      app.addPlugin(QueuePlugin, { ...options, strategies: [{ name: 'default', strategy: MemoryStrategy }] });
    },
    ready: (testApp) => {
      manager = testApp.resolve(QueueManager);
    },
    drain: async () => {
      const queue = current();
      const strategy = queue.getStrategy('default') as MemoryStrategy | undefined;

      // a retry publishes again, so go round until a pass changes nothing
      for (let pass = 0; pass < 100; pass++) {
        const before = queue.inspect().events.length;

        await queue.drain();
        await strategy?.idle();
        await queue.drain();

        if (queue.inspect().events.length === before) {
          return;
        }
      }
    },
    events: () => [...current().inspect().events].reverse(),
  };
}
