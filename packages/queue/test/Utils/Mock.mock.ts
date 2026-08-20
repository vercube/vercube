import { QueueStrategy } from '../../src/Services/QueueStrategy';
import type { QueueTypes } from '../../src/Types/QueueTypes';

/**
 * Strategy that records what the manager asks of it and lets a test hand jobs
 * to the consumer by calling `deliver()`.
 */
export class RecordingStrategy extends QueueStrategy<{ label?: string } | undefined> {
  public readonly transport: string = 'recording';

  /** Capabilities reported to the manager, overridable per test. */
  public reported: QueueTypes.Capabilities = {
    retries: false,
    delay: false,
    priority: false,
    progress: false,
    stats: false,
  };

  /** Every published job, in order. */
  public published: QueueTypes.PublishRequest[] = [];

  /** Options the strategy was initialized with. */
  public initOptions: { label?: string } | undefined;

  /** How many times the strategy was initialized. */
  public initialized: number = 0;

  /** How many times the strategy was closed. */
  public closed: number = 0;

  /** Running consumers, indexed by queue. */
  public consumers: Map<string, QueueTypes.ConsumeRequest> = new Map();

  /** Queues whose consumer has been stopped, in order. */
  public stopped: string[] = [];

  /** Error thrown by the next `initialize()` call. */
  public initError: Error | null = null;

  /** Error thrown by the next `publish()` call. */
  public publishError: Error | null = null;

  /** Error thrown by the next `consume()` call. */
  public consumeError: Error | null = null;

  public override get capabilities(): QueueTypes.Capabilities {
    return this.reported;
  }

  public initialize(options: { label?: string } | undefined): void {
    this.initialized++;
    this.initOptions = options;

    if (this.initError) {
      throw this.initError;
    }
  }

  public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
    if (this.publishError) {
      throw this.publishError;
    }

    this.published.push(request);

    return {
      id: `job-${this.published.length}`,
      queue: request.queue,
      job: request.job,
      strategy: this.transport,
    };
  }

  public async consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle> {
    if (this.consumeError) {
      throw this.consumeError;
    }

    this.consumers.set(request.queue, request);

    return {
      queue: request.queue,
      stop: async () => {
        this.stopped.push(request.queue);
        this.consumers.delete(request.queue);
      },
    };
  }

  public async close(): Promise<void> {
    this.closed++;
  }

  public override async stats(queue: string): Promise<QueueTypes.QueueStats> {
    return { waiting: this.published.filter((request) => request.queue === queue).length };
  }

  /**
   * Hands a job to the consumer of a queue, exactly as a broker would.
   *
   * @param queue - Queue the job arrives on
   * @param job - Partial job, filled with sane defaults
   * @returns The promise the manager returns for that job
   */
  public deliver(queue: string, job: Partial<QueueTypes.IncomingJob> & { job: string }): Promise<void> {
    const consumer = this.consumers.get(queue);

    if (!consumer) {
      throw new Error(`No consumer is running for queue "${queue}"`);
    }

    return consumer.dispatch({
      id: job.id ?? 'job-1',
      job: job.job,
      payload: job.payload ?? {},
      headers: job.headers ?? {},
      attempt: job.attempt ?? 1,
      attempts: job.attempts,
      raw: job.raw,
      updateProgress: job.updateProgress,
    });
  }
}

/**
 * Builds the registration shape the manager expects, with test friendly defaults.
 *
 * @param overrides - Fields to override
 * @returns A registration ready to be passed to `registerConsumer()`
 */
export function registration(overrides: Partial<QueueTypes.Registration> = {}): QueueTypes.Registration {
  return {
    strategy: 'default',
    queue: 'emails',
    job: 'welcome',
    handler: async () => undefined,
    options: {},
    source: 'TestConsumer.welcome',
    ...overrides,
  };
}

/** Minimal Standard Schema accepting objects with a numeric `id`. */
export const idSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: unknown) => {
      if (typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'number') {
        return { value };
      }

      return { issues: [{ message: 'id must be a number' }] };
    },
  },
} as const;
