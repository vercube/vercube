import { setConsumerOptions } from '../Utils/Metadata';
import type { QueueTypes } from '../Types/QueueTypes';

/**
 * Declares a class as the consumer of a queue.
 *
 * The class itself does nothing until it is bound in the container: that is when
 * its `@Job()` methods register themselves and the queue starts being consumed.
 * Options declared here become the defaults of every handler in the class.
 *
 * @param {QueueTypes.ConsumerOptions} options - Queue to consume, its concurrency and the handler defaults
 * @returns {Function} The class decorator
 *
 * @example
 * ```ts
 * @Consumer({ queue: 'emails', concurrency: 5 })
 * export class EmailConsumer {
 *   @Job('welcome')
 *   public async welcome(payload: { userId: string }): Promise<void> {
 *     await this.mailer.sendWelcome(payload.userId);
 *   }
 * }
 *
 * // in the container setup
 * container.bind(EmailConsumer);
 * ```
 *
 * @example
 * ```ts
 * // defaults for every handler of the class, overridable per job
 * @Consumer({ queue: 'reports', strategy: 'kafka', attempts: 3, timeout: 30_000 })
 * export class ReportConsumer {}
 * ```
 */
export function Consumer(options: QueueTypes.ConsumerOptions): Function {
  return function internalDecorator(target: { prototype: object }) {
    setConsumerOptions(target.prototype, options);
  };
}
