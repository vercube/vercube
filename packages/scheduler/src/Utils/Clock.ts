import type { SchedulerTypes } from '../Types/SchedulerTypes';

/**
 * Longest delay a single timer can wait. Longer waits overflow to an immediate
 * call in every runtime, so the manager re-arms in chunks of at most this long.
 */
export const MAX_TIMEOUT = 2 ** 31 - 1;

/**
 * Clock backed by the runtime's own time and timers.
 *
 * Timers are unreferenced where the runtime allows it, so a scheduler waiting
 * for its next occurrence never keeps a process alive on its own.
 */
export const SystemClock: SchedulerTypes.Clock = {
  now: () => Date.now(),

  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, Math.min(Math.max(0, ms), MAX_TIMEOUT));

    unref(handle);

    return handle;
  },

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

/**
 * Unreferences a timer: `unref()` on Node and Bun, `Deno.unrefTimer()` on Deno.
 *
 * @param handle - Timer handle returned by `setTimeout`
 * @returns Nothing
 */
function unref(handle: unknown): void {
  if (typeof (handle as { unref?: unknown })?.unref === 'function') {
    (handle as { unref: () => void }).unref();

    return;
  }

  const deno = (globalThis as { Deno?: { unrefTimer?: (id: number) => void } }).Deno;

  if (typeof handle === 'number' && typeof deno?.unrefTimer === 'function') {
    deno.unrefTimer(handle);
  }
}
