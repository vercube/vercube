import type { SchedulerManager } from '../Services/SchedulerManager';

/**
 * Key of the process-wide set of scheduler managers.
 *
 * A symbol from the global registry rather than a module variable: the CLI
 * imports the built application, which may carry its own copy of this package,
 * and both copies must see the same set.
 */
const KEY = Symbol.for('vercube.scheduler.managers');

/** Environment variable that keeps every scheduler from arming its timers. */
export const AUTOSTART_ENV = 'VERCUBE_SCHEDULER_AUTOSTART';

/**
 * The set of live managers, created on first use.
 *
 * @returns The set
 */
function managers(): Set<SchedulerManager> {
  const scope = globalThis as unknown as Record<symbol, Set<SchedulerManager> | undefined>;

  scope[KEY] ??= new Set();

  return scope[KEY];
}

/**
 * Records a manager, so the CLI can find it in an application it imported.
 *
 * @param manager - The manager
 * @returns Nothing
 */
export function registerManager(manager: SchedulerManager): void {
  managers().add(manager);
}

/**
 * Forgets a manager.
 *
 * @param manager - The manager
 * @returns Nothing
 */
export function unregisterManager(manager: SchedulerManager): void {
  managers().delete(manager);
}

/**
 * Every manager alive in this process, oldest first.
 *
 * @returns The managers
 */
export function liveManagers(): SchedulerManager[] {
  return [...managers()];
}
