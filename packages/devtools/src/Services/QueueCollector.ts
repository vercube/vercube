import { Container, Destroy, Init, Inject } from '@vercube/di';
import { describeKey } from '../Utils/Introspect';
import { DevtoolsEventBus } from './DevtoolsEventBus';
import type { DevtoolsTypes } from '../Types/DevtoolsTypes';

/** Maximum processed jobs listed. */
const MAX_EVENTS = 200;

/**
 * How long jobs are collected before a batch is pushed. A queue can finish
 * thousands of jobs a second, and one frame per job would drown the stream
 * without telling anybody anything more.
 */
const BATCH_MS = 250;

/** Maximum jobs carried by one batch, so a burst cannot produce a huge frame. */
const MAX_BATCH = 200;

/** Shape of the queue manager this collector reads, without importing it. */
interface ManagerLike {
  inspect?: () => DevtoolsTypes.QueueSnapshot;
  stats?: (params: { queue: string; strategy?: string }) => Promise<Record<string, number | undefined>>;
  configure?: (defaults: { capturePayloads?: boolean }) => void;
  subscribe?: (listener: (event: DevtoolsTypes.QueueJob) => void) => () => void;
  peek?: (params: { queue: string; strategy?: string; limit?: number }) => Promise<DevtoolsTypes.QueueMessage[]>;
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

  @Inject(DevtoolsEventBus)
  private readonly gEventBus!: DevtoolsEventBus;

  /** Whether the queue module was already asked to keep failure payloads */
  private fCapturing: boolean = false;

  /** Removes the job listener again on shutdown */
  private fUnsubscribe: (() => void) | null = null;

  /** Jobs waiting to be pushed, oldest first */
  private fPending: DevtoolsTypes.QueueJob[] = [];

  /** Jobs dropped from the current batch because it is full */
  private fDropped: number = 0;

  /** Timer that flushes the current batch */
  private fTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Turns failure capturing on as soon as the container is ready, so the very
   * first failed job is already diagnosable instead of the first one after
   * somebody opened the panel.
   * @returns nothing
   */
  @Init()
  protected init(): void {
    const manager = this.resolveLive<ManagerLike>('QueueManager');

    this.enableCapture(manager);
    this.follow(manager);
  }

  /**
   * Stops following the queue module when the container is torn down.
   * @returns nothing
   */
  @Destroy()
  protected destroy(): void {
    this.fUnsubscribe?.();
    this.fUnsubscribe = null;

    if (this.fTimer) {
      clearTimeout(this.fTimer);
      this.fTimer = null;
    }
  }

  /**
   * Follows every job the queue module processes and pushes them to the
   * connected inspectors in batches.
   * @param manager the live queue manager, when there is one
   * @returns nothing
   */
  private follow(manager: ManagerLike | null): void {
    if (this.fUnsubscribe || typeof manager?.subscribe !== 'function') {
      return;
    }

    this.fUnsubscribe = manager.subscribe((event) => this.enqueue(event));
  }

  /**
   * Adds a job to the current batch and makes sure it will be flushed.
   * @param event the processed job
   * @returns nothing
   */
  private enqueue(event: DevtoolsTypes.QueueJob): void {
    if (this.fPending.length >= MAX_BATCH) {
      this.fDropped++;
    } else {
      this.fPending.push(event);
    }

    if (this.fTimer) {
      return;
    }

    this.fTimer = setTimeout(() => this.flush(), BATCH_MS);
    this.fTimer.unref?.();
  }

  /**
   * Pushes the collected jobs, together with the counters as they stand now, and
   * starts a fresh batch.
   * @returns nothing
   */
  private flush(): void {
    this.fTimer = null;

    if (this.fPending.length === 0 && this.fDropped === 0) {
      return;
    }

    const events = this.fPending.reverse();
    const dropped = this.fDropped;

    this.fPending = [];
    this.fDropped = 0;

    const manager = this.resolveLive<ManagerLike>('QueueManager');
    const snapshot = this.readSnapshot(manager);

    this.gEventBus.publish({
      type: 'queue',
      payload: { events, metrics: snapshot?.metrics ?? [], dropped },
    });
  }

  /**
   * Reads the queue module.
   * @returns what could be seen of the queue layer
   */
  public async collect(): Promise<DevtoolsTypes.QueueView> {
    const manager = this.resolveLive<ManagerLike>('QueueManager');

    this.enableCapture(manager);

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
   * Asks the queue module to keep the payload and headers of failed jobs, which
   * it does not do on its own because those are user data. Devtools only run in
   * development, or behind an explicit token, so the trade is theirs to make
   * once they open the inspector.
   * @param manager the live queue manager, when there is one
   * @returns nothing
   */
  private enableCapture(manager: ManagerLike | null): void {
    if (this.fCapturing || typeof manager?.configure !== 'function') {
      return;
    }

    try {
      manager.configure({ capturePayloads: true });
      this.fCapturing = true;
    } catch {
      // a manager that refuses to be configured is still worth reading
    }
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
        peekable: (snapshot.strategies ?? []).some(
          (mount) => mount.name === metrics.strategy && mount.capabilities?.peek === true,
        ),
      });
    }

    return lines.sort((a, b) => a.strategy.localeCompare(b.strategy) || a.queue.localeCompare(b.queue));
  }

  /**
   * Reads what a queue is holding, on demand. Kept out of `collect()` on purpose:
   * this costs a broker round trip per queue, and only the queue somebody opened
   * is worth paying it for.
   * @param queue queue to read
   * @param strategy mount to read it through
   * @param limit how many messages to read
   * @returns the messages found, or why they could not be read
   */
  public async readMessages(queue: string, strategy: string, limit: number): Promise<DevtoolsTypes.QueueMessages> {
    const manager = this.resolveLive<ManagerLike>('QueueManager');
    const snapshot = this.readSnapshot(manager);
    const peekable = (snapshot?.strategies ?? []).some((mount) => mount.name === strategy && mount.capabilities?.peek === true);

    if (!manager || typeof manager.peek !== 'function') {
      return { queue, strategy, peekable: false, messages: [], error: 'The queue module cannot be read.' };
    }

    if (!peekable) {
      return {
        queue,
        strategy,
        peekable: false,
        messages: [],
        error: 'This transport cannot show a queue without consuming it.',
      };
    }

    try {
      return { queue, strategy, peekable: true, messages: await manager.peek({ queue, strategy, limit }) };
    } catch (error) {
      return {
        queue,
        strategy,
        peekable: true,
        messages: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
