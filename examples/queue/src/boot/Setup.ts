import { type App } from '@vercube/core';
import { defineQueueStrategy, QueuePlugin } from '@vercube/queue';
import { MemoryStrategy } from '@vercube/queue/strategies/MemoryStrategy';

/**
 * Setup the application.
 *
 * The example runs on the in-memory strategy so it needs no broker. Swapping in
 * a real one is a one line change, and several of them can be mounted at once:
 *
 * ```ts
 * import { BullMQStrategy } from '@vercube/queue/strategies/BullMQStrategy';
 * import { KafkaStrategy } from '@vercube/queue/strategies/KafkaStrategy';
 * import { RabbitMQStrategy } from '@vercube/queue/strategies/RabbitMQStrategy';
 *
 * app.addPlugin(QueuePlugin, {
 *   strategies: [
 *     defineQueueStrategy({
 *       strategy: BullMQStrategy,
 *       initOptions: { connection: { host: '127.0.0.1', port: 6379 } },
 *     }),
 *     defineQueueStrategy({
 *       name: 'events',
 *       strategy: KafkaStrategy,
 *       initOptions: { client: { clientId: 'example', brokers: ['localhost:9092'] }, groupId: 'example-workers' },
 *     }),
 *   ],
 * });
 * ```
 *
 * @param {App} app - The application instance.
 * @returns {Promise<void>} Resolves once the plugins are registered.
 */
export async function setup(app: App): Promise<void> {
  app.addPlugin(QueuePlugin, {
    strategies: [defineQueueStrategy({ strategy: MemoryStrategy })],
  });
}
