import { Container, describeKey, Inject } from '@vercube/di';
import type { IntrospectionTypes } from '@vercube/core';

/** Maximum processed jobs listed. */
const MAX_EVENTS = 200;

/** Most messages one listing may read, whatever the caller asked for. */
const MAX_MESSAGES = 100;

/** What a transport supports, as `@vercube/queue` reports it. */
type QueueCapabilities = Record<string, boolean>;

/** A mounted strategy. */
export interface QueueMount {
  name: string;
  transport: string;
  driver: string;
  status: string;
  capabilities: QueueCapabilities;
  error?: string;
}

/** A registered handler. */
export interface QueueHandler {
  strategy: string;
  queue: string;
  job: string;
  source: string;
  attempts: number;
  timeout?: number;
  validated: boolean;
  running: boolean;
}

/** Counters the manager keeps per queue. */
export interface QueueMetrics {
  strategy: string;
  queue: string;
  published: number;
  processed: number;
  failed: number;
  retried: number;
  unhandled: number;
  active: number;
  lastError?: string;
}

/** A processed job. */
export interface QueueJob {
  at: number;
  strategy: string;
  queue: string;
  job: string;
  id: string;
  attempt: number;
  status: string;
  duration: number;
  error?: { name?: string; message: string; stack?: string; operation?: string; retryable?: boolean };
  payload?: string;
  headers?: Record<string, string>;
  source?: string;
}

/** A message sitting on a queue. */
export interface QueueMessage {
  id: string;
  job: string;
  state: string;
  attempt?: number;
  payload?: string;
  headers: Record<string, string>;
  availableAt?: number;
  error?: { name?: string; message: string; stack?: string };
}

/** One queue, with everything known about it joined together. */
export interface QueueLine extends QueueMetrics {
  /** Jobs handlers are registered for, sorted. */
  jobs: string[];

  /** Whether the queue is currently being consumed. */
  running: boolean;

  /** Counters the transport itself reports, when it keeps any. */
  stats: Record<string, number | undefined> | null;

  /** Whether the queue can be listed without consuming it. */
  peekable: boolean;
}

/** What the queues section reports. */
export interface QueueDescription {
  /** Whether a queue manager is active in this application. */
  available: boolean;

  /** Whether consumers have been started. */
  started: boolean;

  /** Mounted strategies. */
  mounts: QueueMount[];

  /** Registered handlers. */
  handlers: QueueHandler[];

  /** One line per queue. */
  queues: QueueLine[];

  /** Recently processed jobs, newest first. */
  events: QueueJob[];
}

/** What a queue listing answers with. */
export interface QueueMessages {
  queue: string;
  strategy: string;
  peekable: boolean;
  messages: QueueMessage[];
  error?: string;
}

/** Full picture of the queue module, as `@vercube/queue` reports it. */
interface QueueSnapshot {
  started: boolean;
  strategies: QueueMount[];
  consumers: QueueHandler[];
  metrics: QueueMetrics[];
  events: QueueJob[];
}

/** Public surface of `@vercube/queue`'s manager that this reads. */
interface QueueManagerLike {
  inspect?: () => QueueSnapshot;
  stats?: (params: { queue: string; strategy?: string }) => Promise<Record<string, number | undefined>>;
  configure?: (defaults: { capturePayloads?: boolean }) => void;
  peek?: (params: { queue: string; strategy?: string; limit?: number }) => Promise<QueueMessage[]>;
}

/**
 * Describes the queue module: which transports are mounted, which handlers
 * listen on which queue, how many jobs went through them and how the last ones
 * ended.
 *
 * Only the structural half lives here. Individual jobs are traced by
 * `@vercube/queue` itself as producer and consumer spans, so they arrive on the
 * signal plane like every other operation, already joined to the request that
 * queued them.
 *
 * `@vercube/queue` is optional and does not depend on core, so it cannot
 * register a section itself. Devtools registers it on the manager's behalf,
 * looking it up among services the application has **already instantiated**.
 */
export class QueueIntrospection implements IntrospectionTypes.Provider<QueueDescription> {
  /** @inheritdoc */
  public readonly id = 'queues';

  /** @inheritdoc */
  public readonly title = 'Queues';

  @Inject(Container)
  private readonly gContainer!: Container;

  /** Whether the queue module was already asked to keep failure payloads. */
  private fCapturing: boolean = false;

  /** @inheritdoc */
  public revision(): number {
    // Counters move with every processed job, so the section is rebuilt on every
    // read rather than cached against a revision.
    return Date.now();
  }

  /** @inheritdoc */
  public async describe(): Promise<QueueDescription> {
    const manager = this.resolveLive<QueueManagerLike>('QueueManager');

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
   * Reads what a queue is holding, on demand.
   *
   * Kept out of {@link QueueIntrospection.describe} on purpose: this costs a
   * broker round trip per queue, and only the queue somebody opened is worth
   * paying it for.
   *
   * @param queue - Queue to read
   * @param strategy - Mount to read it through
   * @param limit - How many messages to read
   * @returns The messages found, or why they could not be read
   */
  public async readMessages(queue: string, strategy: string, limit: number): Promise<QueueMessages> {
    const manager = this.resolveLive<QueueManagerLike>('QueueManager');
    const snapshot = this.readSnapshot(manager);
    const peekable = (snapshot?.strategies ?? []).some((mount) => mount.name === strategy && mount.capabilities?.peek === true);

    if (!manager || typeof manager.peek !== 'function') {
      return { queue, strategy, peekable: false, messages: [], error: 'The queue module cannot be read.' };
    }

    // Only queues this application declared. A transport reaches every queue
    // sharing its connection, so without this an inspector doubles as a reader
    // of whatever else lives on that broker.
    if (!this.declares(snapshot, strategy, queue)) {
      return { queue, strategy, peekable: false, messages: [], error: `No "${queue}" queue is registered on "${strategy}".` };
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
      const capped = Math.min(Math.max(1, Math.floor(limit)), MAX_MESSAGES);

      return { queue, strategy, peekable: true, messages: await manager.peek({ queue, strategy, limit: capped }) };
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
   * Whether the application registered a queue under a given strategy.
   *
   * @param snapshot - What the manager currently holds
   * @param strategy - Mount the queue would be on
   * @param queue - Queue being asked about
   * @returns Whether it is one of this application's queues
   */
  private declares(snapshot: QueueSnapshot | null, strategy: string, queue: string): boolean {
    const matches = (entry: { strategy: string; queue: string }): boolean => entry.strategy === strategy && entry.queue === queue;

    return (snapshot?.metrics ?? []).some(matches) || (snapshot?.consumers ?? []).some(matches);
  }

  /**
   * Asks the queue module to keep the payload and headers of failed jobs, which
   * it does not do on its own because those are user data. Devtools only run in
   * development, or behind an explicit token, so the trade is theirs to make
   * once they open the inspector.
   *
   * @param manager - The live queue manager, when there is one
   */
  private enableCapture(manager: QueueManagerLike | null): void {
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
   *
   * @param manager - The live queue manager, when there is one
   * @returns The snapshot, or null when it cannot be read
   */
  private readSnapshot(manager: QueueManagerLike | null): QueueSnapshot | null {
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
   *
   * @param manager - The live queue manager
   * @param snapshot - What the manager currently holds
   * @returns One line per queue
   */
  private async readQueues(manager: QueueManagerLike, snapshot: QueueSnapshot): Promise<QueueLine[]> {
    const lines: QueueLine[] = [];

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
   * Asks the transport for its own counters. A transport that keeps none, or one
   * that cannot be reached, simply reports nothing.
   *
   * @param manager - The live queue manager
   * @param strategy - Name of the mounted strategy
   * @param queue - Queue to read
   * @returns The transport counters, or null
   */
  private async readStats(
    manager: QueueManagerLike,
    strategy: string,
    queue: string,
  ): Promise<Record<string, number | undefined> | null> {
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
   * Finds an already-constructed service by the name of its binding key.
   *
   * @param name - Display name of the binding key
   * @returns The instance, or null when it is not bound or not yet built
   */
  private resolveLive<T>(name: string): T | null {
    for (const [key] of this.gContainer.services) {
      if (describeKey(key) === name && this.gContainer.hasInstance(key)) {
        return this.gContainer.get<T>(key as never);
      }
    }

    return null;
  }
}
