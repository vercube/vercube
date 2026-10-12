import { Container } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { vi } from 'vitest';
import { SchedulerManager } from '../../src/Services/SchedulerManager';
import type { SchedulerStore } from '../../src/Services/SchedulerStore';
import type { SchedulerTypes } from '../../src/Types/SchedulerTypes';

/** A logger recording every call. */
export function createLogger(): Logger {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

  (logger as unknown as { child: () => Logger }).child = vi.fn(() => logger);

  return logger;
}

/** A replica: its container, manager and logger. */
export interface Replica {
  container: Container;
  manager: SchedulerManager;
  logger: Logger;
  events: SchedulerTypes.RunEvent[];
}

/**
 * Builds a manager in a container of its own, the way a replica would have it.
 *
 * @param options - Settings of the manager, `autoStart` is off unless set
 * @param store - Store to mount, an instance is shared as is
 * @returns The replica
 */
export async function createReplica(
  options: SchedulerTypes.Options = {},
  store?: SchedulerStore<any> | SchedulerTypes.AnyMount,
): Promise<Replica> {
  const container = new Container();
  const logger = createLogger();

  container.bindInstance(Container, container);
  container.bindInstance(Logger, logger);
  container.bind(SchedulerManager);

  const manager = container.get(SchedulerManager);
  const events: SchedulerTypes.RunEvent[] = [];

  manager.configure({ autoStart: false, ...options });
  manager.subscribe((event) => events.push(event));

  if (store) {
    await manager.mount(('store' in store ? store : { store }) as SchedulerTypes.Mount<never>);
  }

  return { container, manager, logger, events };
}

/**
 * Counts events by outcome.
 *
 * @param events - Recorded events
 * @returns Outcome counts
 */
export function outcomes(events: SchedulerTypes.RunEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of events) {
    counts[event.outcome] = (counts[event.outcome] ?? 0) + 1;
  }

  return counts;
}
