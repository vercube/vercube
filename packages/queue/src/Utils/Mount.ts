import type { QueueStrategy } from '../Services/QueueStrategy';
import type { QueueTypes } from '../Types/QueueTypes';

/**
 * Type checks a single strategy mount and erases its options, so a list of
 * mounts of different strategies stays checked.
 *
 * `QueueManager.mount()` infers the strategy from its argument and checks
 * `initOptions` against it. A plain array in `QueuePlugin` options cannot do
 * that, since there is no inference site per entry - this helper is that site.
 *
 * @param {QueueTypes.Mount<T>} mount - Mount name, strategy class and its init options
 * @returns {QueueTypes.AnyMount} The very same mount, with its options type erased
 *
 * @example
 * ```ts
 * app.addPlugin(QueuePlugin, {
 *   strategies: [
 *     defineQueueStrategy({ strategy: RabbitMQStrategy, initOptions: { url: 'amqp://localhost' } }),
 *     defineQueueStrategy({
 *       name: 'events',
 *       strategy: KafkaStrategy,
 *       initOptions: { client: { brokers: ['localhost:9092'] }, groupId: 'workers' },
 *     }),
 *   ],
 * });
 * ```
 */
export function defineQueueStrategy<T extends QueueStrategy<unknown>>(mount: QueueTypes.Mount<T>): QueueTypes.AnyMount {
  return mount as QueueTypes.AnyMount;
}
