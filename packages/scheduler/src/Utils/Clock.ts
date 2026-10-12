import type { SchedulerTypes } from '../Types/SchedulerTypes';

/**
 * Longest delay a single timer can wait. Longer waits overflow to an immediate
 * call in every runtime, so the manager re-arms in chunks of at most this long.
 */
export const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * Clock backed by the runtime's own time and timers.
 *
 * Timers stay referenced: a process that only runs scheduled jobs must stay
 * alive until their next occurrence. They exist only while the scheduler is
 * started or a run is in flight, and `stop()` clears them, so a stopped
 * scheduler never holds a process open.
 */
export const SystemClock: SchedulerTypes.Clock = {
  now: () => Date.now(),

  setTimeout: (fn, ms) => setTimeout(fn, Math.min(Math.max(0, ms), MAX_TIMEOUT)),

  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/**
 * Waits on a clock.
 *
 * @param clock - Clock to wait on
 * @param ms - How long to wait
 * @returns Resolves once the time has passed
 */
export function sleep(clock: SchedulerTypes.Clock, ms: number): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, ms);
  });
}
