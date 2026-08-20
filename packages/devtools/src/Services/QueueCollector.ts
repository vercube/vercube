import { Container, Inject } from '@vercube/di';
import { describeKey } from '../Utils/Introspect';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Maximum processed jobs listed. */
const MAX_EVENTS = 200;

/** Shape of the queue manager this collector reads, without importing it. */
interface ManagerLike {
  inspect?: () => DevtoolsTypes.QueueSnapshot;
  stats?: (params: { queue: string; strategy?: string }) => Promise<Record<string, number | undefined>>;
}

/**
 * Reports what the queue module is doing: which transports are mounted, which
 * handlers listen on which queue, how many jobs went through them and how the
 * last ones ended.
 * The queue package is optional, so it is discovered by name in the container.
 */
export class QueueCollector {
  @Inject(Container)
  private readonly gContainer!: Container;

  /**
   * Reads the queue module.
   * @returns what could be seen of the queue layer
   */
  public async collect(): Promise<DevtoolsTypes.QueueView> {
    const manager = this.resolveLive<ManagerLike>('QueueManager');
    const snapshot = this.readSnapshot(manager);

    if (!manager || !snapshot) {
      return { available: false, started: false, mounts: [], handlers: [], queues: [], events: [] };
    }

    return {
      available: true,
      started: Boolean(snapshot.started),
      mounts: snapshot.strategies ?? [],
      handlers: snapshot.consumers ?? [],
      queues: await this.readQueues(manager, snapshot),
      events: (snapshot.events ?? []).slice(0, MAX_EVENTS),
    };
  }

  /**
   * Asks the manager what it holds, tolerating a manager that predates the
   * inspection API or fails while answering.
   * @param manager the live queue manager, when there is one
   * @returns the snapshot, or null when it cannot be read
   */
  private readSnapshot(manager: ManagerLike | null): DevtoolsTypes.QueueSnapshot | null {
    if (typeof manager?.inspect !== 'function') {
      return null;
    }

    try {
      return manager.inspect() ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Joins the counters the manager keeps with the ones the transport reports.
   * @param manager the live queue manager
   * @param snapshot what the manager currently holds
   * @returns one line per queue
   */
  private async readQueues(manager: ManagerLike, snapshot: DevtoolsTypes.QueueSnapshot): Promise<DevtoolsTypes.QueueLine[]> {
    const lines: DevtoolsTypes.QueueLine[] = [];

    for (const metrics of snapshot.metrics ?? []) {
      const handlers = (snapshot.consumers ?? []).filter(
        (consumer) => consumer.strategy === metrics.strategy && consumer.queue === metrics.queue,
      );

      lines.push({
        ...metrics,
        jobs: handlers.map((consumer) => consumer.job).sort((a, b) => a.localeCompare(b)),
        running: handlers.some((consumer) => consumer.running),
        stats: await this.readStats(manager, metrics.strategy, metrics.queue),
      });
    }

    return lines.sort((a, b) => a.strategy.localeCompare(b.strategy) || a.queue.localeCompare(b.queue));
  }

  /**
   * Asks the transport for its own counters. A transport that keeps none, or one
   * that cannot be reached, simply reports nothing.
   * @param manager the live queue manager
   * @param strategy name of the mounted strategy
   * @param queue queue to read
   * @returns the transport counters, or null
   */
  private async readStats(
    manager: ManagerLike,
    strategy: string,
    queue: string,
  ): Promise<DevtoolsTypes.QueueTransportStats | null> {
    if (typeof manager.stats !== 'function') {
      return null;
    }

    try {
      const stats = await manager.stats({ queue, strategy });

      return stats && Object.keys(stats).length > 0 ? stats : null;
    } catch {
      return null;
    }
  }

  /**
   * Finds an already-constructed service by its display name.
   * @param name service name to look for
   * @returns the live instance, or null when unbound or never instantiated
   */
  private resolveLive<T extends object>(name: string): T | null {
    for (const [key] of this.gContainer.services) {
      if (describeKey(key) !== name || !this.gContainer.hasInstance(key)) {
        continue;
      }

      return this.gContainer.get(key as never) as T;
    }

    return null;
  }
}
