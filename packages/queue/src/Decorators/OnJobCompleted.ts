import { createDecorator } from '@vercube/di';
import { JobHookDecorator } from './JobHookDecorator';
import type { JobHookDecoratorOptions } from './JobHookDecorator';

/**
 * Runs the decorated method after a job of the consumer's queue completed.
 *
 * The hook receives the {@link QueueTypes.JobContext} of the finished job. It
 * never changes the outcome of that job: a throwing hook is logged and forgotten.
 *
 * @param {object} [options] - Narrows the hook down to a single job
 * @param {string} [options.job] - Name of the only job to listen for, every job of the queue by default
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * @Consumer({ queue: 'emails' })
 * export class EmailConsumer {
 *   @Job('welcome')
 *   public async welcome(payload: { userId: string }): Promise<void> {}
 *
 *   @OnJobCompleted()
 *   public async sent(context: QueueTypes.JobContext): Promise<void> {
 *     this.metrics.increment(`emails.${context.job}.sent`);
 *   }
 * }
 * ```
 */
export function OnJobCompleted(options: { job?: string } = {}): Function {
  const hook: JobHookDecoratorOptions = { event: 'completed', job: options.job };

  return createDecorator(JobHookDecorator, hook);
}
