import { createDecorator } from '@vercube/di';
import { WILDCARD_JOB } from '../Utils/Job';
import { JobDecorator } from './Job';
import type { QueueTypes } from '../Types/QueueTypes';

/**
 * Declares the decorated method as the handler of every job of the queue that no
 * `@Job()` claims.
 *
 * A handler registered for a job name always wins, so `@AnyJob()` is the fallback
 * rather than a replacement. It is what makes a queue somebody else fills
 * consumable: messages produced outside this module carry no job name, and would
 * otherwise be reported as unhandled.
 *
 * The real job name is on the context, so the handler can still branch on it.
 * Only one `@AnyJob()` per queue is allowed, like any other handler.
 *
 * @param {QueueTypes.HandlerOptions} [options] - Retries, timeout and payload schema of this handler
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * // a queue filled by another application, whose messages carry no job name
 * @Consumer({ queue: 'legacy-events' })
 * export class LegacyConsumer {
 *   @AnyJob({ attempts: 3 })
 *   public async handle(payload: unknown, context: QueueTypes.JobContext): Promise<void> {
 *     await this.gEvents.ingest(payload, context.job);
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * // known jobs handled on their own, everything else swept up
 * @Consumer({ queue: 'emails' })
 * export class EmailConsumer {
 *   @Job('welcome')
 *   public async welcome(payload: Welcome): Promise<void> {}
 *
 *   @AnyJob()
 *   public async rest(payload: unknown, context: QueueTypes.JobContext): Promise<void> {
 *     context.logger?.warn(`unrecognised job ${context.job}`);
 *   }
 * }
 * ```
 */
export function AnyJob(options: QueueTypes.HandlerOptions = {}): Function {
  return createDecorator(JobDecorator, { name: WILDCARD_JOB, options });
}
