import { createDecorator } from '@vercube/di';
import { JobHookDecorator } from './JobHookDecorator';
import type { JobHookDecoratorOptions } from './JobHookDecorator';

/**
 * Runs the decorated method after an attempt of a job of the consumer's queue threw.
 *
 * The hook receives the error and the {@link QueueTypes.JobContext} of the failed
 * attempt, so it can tell a retry from a final failure by comparing
 * `context.attempt` with `context.attempts`. It never changes the outcome of the
 * job: a throwing hook is logged and forgotten.
 *
 * @param {object} [options] - Narrows the hook down to a single job
 * @param {string} [options.job] - Name of the only job to listen for, every job of the queue by default
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * @Consumer({ queue: 'emails' })
 * export class EmailConsumer {
 *   @Job('welcome', { attempts: 3 })
 *   public async welcome(payload: { userId: string }): Promise<void> {}
 *
 *   @OnJobFailed()
 *   public async failed(error: Error, context: QueueTypes.JobContext): Promise<void> {
 *     if (context.attempt === context.attempts) {
 *       await this.alerts.report(error, context.id);
 *     }
 *   }
 * }
 * ```
 */
export function OnJobFailed(options: { job?: string } = {}): Function {
  const hook: JobHookDecoratorOptions = { event: 'failed', job: options.job };

  return createDecorator(JobHookDecorator, hook);
}
