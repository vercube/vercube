import { createDecorator } from '@vercube/di';
import { ScheduleDecorator } from './ScheduleDecorator';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { ScheduleDecoratorOptions } from './ScheduleDecorator';

/**
 * Runs the decorated method on a cron schedule.
 *
 * 5 fields (minute precision), 6 fields (with seconds) and nicknames such as
 * `@hourly` or `@daily` are accepted. An invalid expression or time zone fails
 * when the class is bound, not at the first tick.
 *
 * The method receives a {@link SchedulerTypes.JobContext}. Jobs are `cluster`
 * scoped by default: exactly one replica runs each occurrence.
 *
 * @param {string} expression - The cron expression
 * @param {SchedulerTypes.CronOptions} [options] - Name, time zone, scope and run policies of the job
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * export class BillingJobs {
 *   @Cron('0 3 * * *', { name: 'billing.close-day', timezone: 'Europe/Warsaw' })
 *   public async closeDay(ctx: SchedulerTypes.JobContext): Promise<void> {
 *     for (const batch of await this.invoices.openBatches()) {
 *       ctx.signal.throwIfAborted();
 *       await this.invoices.close(batch, { idempotencyKey: ctx.occurrenceId });
 *     }
 *   }
 * }
 *
 * container.bind(BillingJobs);
 * ```
 */
export function Cron(expression: string, options: SchedulerTypes.CronOptions = {}): Function {
  const { timezone, ...rest } = options;

  return createDecorator<ScheduleDecoratorOptions, ScheduleDecorator>(ScheduleDecorator, {
    decorator: '@Cron()',
    schedule: { cron: expression, ...(timezone === undefined ? {} : { timezone }) },
    options: rest,
  });
}
