import { createDecorator } from '@vercube/di';
import { ScheduleDecorator } from './ScheduleDecorator';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { ScheduleDecoratorOptions } from './ScheduleDecorator';

/**
 * Runs the decorated method at a fixed interval.
 *
 * Occurrences are aligned to the Unix epoch, landing on `k * interval + offset`
 * rather than counting from when the process started, so every replica agrees
 * on them. The shortest interval is one second.
 *
 * @param {SchedulerTypes.Duration} interval - Milliseconds, or a string such as `'30s'`, `'5m'` or `'1h'`
 * @param {SchedulerTypes.EveryOptions} [options] - Name, offset, scope and run policies of the job
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * export class CacheJobs {
 *   // every replica clears its own cache
 *   @Every('5m', { scope: 'instance' })
 *   public flushLocalCache(): void {
 *     localCache.clear();
 *   }
 * }
 * ```
 */
export function Every(interval: SchedulerTypes.Duration, options: SchedulerTypes.EveryOptions = {}): Function {
  const { offset, ...rest } = options;

  return createDecorator<ScheduleDecoratorOptions, ScheduleDecorator>(ScheduleDecorator, {
    decorator: '@Every()',
    schedule: { every: interval, ...(offset === undefined ? {} : { offset }) },
    options: rest,
  });
}
