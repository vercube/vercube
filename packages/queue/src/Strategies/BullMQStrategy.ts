import { InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Queue, Worker } from 'bullmq';
import { QueueError } from '../Errors/QueueError';
import { QueueStrategy } from '../Services/QueueStrategy';
import { toQueueError } from '../Utils/Errors';
import type { QueueTypes } from '../Types/QueueTypes';
import type { ConnectionOptions, Job, JobsOptions, QueueOptions, WorkerOptions } from 'bullmq';

/** Options the BullMQ strategy connects with. */
export interface BullMQStrategyOptions {
  /**
   * Redis connection, either as options or as an existing ioredis client.
   * @see {@link https://docs.bullmq.io/guide/connections}
   */
  connection: ConnectionOptions;

  /** Key prefix every queue lives under in Redis. */
  prefix?: string;

  /** Job options applied to every published job, overridable per job. */
  defaultJobOptions?: JobsOptions;

  /** Extra options handed to every `Queue` this strategy creates. */
  queueOptions?: Omit<QueueOptions, 'connection' | 'prefix' | 'defaultJobOptions'>;

  /** Extra options handed to every `Worker` this strategy creates. */
  workerOptions?: Omit<WorkerOptions, 'connection' | 'prefix' | 'concurrency'>;
}

/** How the strategy stores a job in Redis, so headers survive the round trip. */
interface BullMQEnvelope {
  payload: unknown;
  headers: Record<string, string>;
}

/**
 * BullMQ backed queue implementation.
 *
 * Redis keeps the jobs, and BullMQ owns their lifecycle: attempts, backoff,
 * delays, priorities, progress and the completed and failed sets are all
 * handled by the broker. Because retries belong to BullMQ, the attempts of a job
 * are the ones it was published with - `attempts` on `@Job()` is only a fallback
 * for jobs published without any.
 *
 * @example
 * ```ts
 * await queueManager.mount({
 *   strategy: BullMQStrategy,
 *   initOptions: { connection: { host: '127.0.0.1', port: 6379 } },
 * });
 * ```
 */
export class BullMQStrategy extends QueueStrategy<BullMQStrategyOptions> {
  /** Transport this strategy talks to. */
  public readonly transport: string = 'bullmq';

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** Options the strategy was initialized with */
  private fOptions: BullMQStrategyOptions | null = null;

  /** Producers, one per queue name */
  private fQueues: Map<string, Queue> = new Map();

  /** Consumers, one per queue name */
  private fWorkers: Map<string, Worker> = new Map();

  /**
   * BullMQ supports the full job model natively.
   *
   * @returns {QueueTypes.Capabilities} What this strategy supports
   */
  public override get capabilities(): QueueTypes.Capabilities {
    return {
      retries: true,
      delay: true,
      priority: true,
      progress: true,
      stats: true,
    };
  }

  /**
   * Stores the connection every queue and worker is created with.
   * Redis itself is connected lazily by BullMQ, on the first command.
   *
   * @param {BullMQStrategyOptions} options - Redis connection and BullMQ defaults
   * @returns {void}
   * @throws {QueueError} When no connection is given
   */
  public initialize(options: BullMQStrategyOptions): void {
    if (!options?.connection) {
      throw new QueueError('BullMQ needs a Redis connection', 'initialize', undefined, undefined, false);
    }

    this.fOptions = options;
  }

  /**
   * Adds a job to a BullMQ queue.
   *
   * @param {QueueTypes.PublishRequest} request - Job to publish
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job
   * @throws {QueueError} When the job cannot be added
   */
  public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
    try {
      const job = await this.queueFor(request.queue).add(
        request.job,
        this.toEnvelope(request),
        this.toJobOptions(request.options),
      );

      return { id: String(job.id), queue: request.queue, job: request.job, strategy: this.transport };
    } catch (error) {
      throw toQueueError(error, 'Failed to add job to BullMQ', 'publish', {
        queue: request.queue,
        job: request.job,
      });
    }
  }

  /**
   * Adds many jobs in a single Redis round trip.
   *
   * @param {QueueTypes.PublishRequest[]} requests - Jobs to publish, all on the same queue
   * @returns {Promise<QueueTypes.JobRef[]>} References to the published jobs
   * @throws {QueueError} When the jobs cannot be added
   */
  public override async publishMany(requests: QueueTypes.PublishRequest[]): Promise<QueueTypes.JobRef[]> {
    if (requests.length === 0) {
      return [];
    }

    try {
      const jobs = await this.queueFor(requests[0].queue).addBulk(
        requests.map((request) => ({
          name: request.job,
          data: this.toEnvelope(request),
          opts: this.toJobOptions(request.options),
        })),
      );

      return jobs.map((job, index) => ({
        id: String(job.id),
        queue: requests[index].queue,
        job: requests[index].job,
        strategy: this.transport,
      }));
    } catch (error) {
      throw toQueueError(error, 'Failed to add jobs to BullMQ', 'publishMany', { queue: requests[0].queue });
    }
  }

  /**
   * Starts a BullMQ worker on a queue.
   *
   * A rejected dispatch is rethrown into BullMQ, which then applies the
   * attempts and backoff the job was published with.
   *
   * @param {QueueTypes.ConsumeRequest} request - Queue to consume, its concurrency and the dispatch callback
   * @returns {Promise<QueueTypes.ConsumerHandle>} Handle used to stop the worker again
   * @throws {QueueError} When the worker cannot be started
   */
  public async consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle> {
    const options = this.requireOptions('consume');
    const existing = this.fWorkers.get(request.queue);

    if (existing) {
      await existing.close();
    }

    const worker = new Worker(
      request.queue,
      async (job: Job) => {
        const { payload, headers } = this.fromEnvelope(job.data);

        await request.dispatch({
          id: String(job.id),
          job: job.name,
          payload,
          headers,
          attempt: job.attemptsStarted || job.attemptsMade + 1,
          attempts: job.opts?.attempts ?? 1,
          raw: job,
          updateProgress: (progress) => job.updateProgress(progress),
        });
      },
      {
        ...options.workerOptions,
        connection: options.connection,
        prefix: options.prefix,
        concurrency: request.concurrency,
      },
    );

    worker.on('error', (error) => {
      this.gLogger?.error(`Vercube/BullMQStrategy::Worker of "${request.queue}" failed`, error);
    });

    this.fWorkers.set(request.queue, worker);

    return {
      queue: request.queue,
      stop: async () => {
        this.fWorkers.delete(request.queue);
        await worker.close();
      },
    };
  }

  /**
   * Reads the job counts BullMQ keeps for a queue.
   *
   * @param {string} queue - Queue to read
   * @returns {Promise<QueueTypes.QueueStats>} Counters of that queue
   * @throws {QueueError} When the counters cannot be read
   */
  public override async stats(queue: string): Promise<QueueTypes.QueueStats> {
    try {
      const counts = await this.queueFor(queue).getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

      return {
        waiting: counts.waiting,
        active: counts.active,
        completed: counts.completed,
        failed: counts.failed,
        delayed: counts.delayed,
      };
    } catch (error) {
      throw toQueueError(error, 'Failed to read BullMQ job counts', 'stats', { queue });
    }
  }

  /**
   * Closes every worker and producer this strategy created.
   *
   * @returns {Promise<void>} Resolves once everything is closed
   */
  public async close(): Promise<void> {
    const closing = [
      ...[...this.fWorkers.values()].map((worker) => worker.close()),
      ...[...this.fQueues.values()].map((queue) => queue.close()),
    ];

    this.fWorkers.clear();
    this.fQueues.clear();

    await Promise.all(closing);
  }

  /**
   * Returns the producer of a queue, creating it on first use.
   *
   * @param {string} name - Queue name
   * @returns {Queue} The BullMQ queue
   * @throws {QueueError} When the strategy has not been initialized
   */
  private queueFor(name: string): Queue {
    const options = this.requireOptions('publish');
    let queue = this.fQueues.get(name);

    if (!queue) {
      queue = new Queue(name, {
        ...options.queueOptions,
        connection: options.connection,
        prefix: options.prefix,
        defaultJobOptions: options.defaultJobOptions,
      });

      this.fQueues.set(name, queue);
    }

    return queue;
  }

  /**
   * Translates the module's job options into BullMQ job options.
   *
   * @param {QueueTypes.JobOptions} options - Options of the job being published
   * @returns {JobsOptions} The BullMQ options
   */
  private toJobOptions(options: QueueTypes.JobOptions): JobsOptions {
    const backoff = options.backoff;

    return {
      attempts: options.attempts,
      backoff: typeof backoff === 'number' ? { type: 'fixed', delay: backoff } : backoff,
      delay: options.delay,
      priority: options.priority,
      jobId: options.jobId,
      removeOnComplete: options.removeOnComplete,
      removeOnFail: options.removeOnFail,
    };
  }

  /**
   * Wraps a job so its headers survive the round trip through Redis.
   *
   * @param {QueueTypes.PublishRequest} request - Job being published
   * @returns {BullMQEnvelope} What is stored as the BullMQ job data
   */
  private toEnvelope(request: QueueTypes.PublishRequest): BullMQEnvelope {
    return { payload: request.payload, headers: request.headers };
  }

  /**
   * Reads a job back. Data that is not one of this module's envelopes is treated
   * as the payload itself, so jobs added by other BullMQ producers still work.
   *
   * @param {unknown} data - Data as stored in Redis
   * @returns {BullMQEnvelope} Payload and headers of the job
   */
  private fromEnvelope(data: unknown): BullMQEnvelope {
    if (data !== null && typeof data === 'object' && 'payload' in data && 'headers' in data) {
      const envelope = data as BullMQEnvelope;

      return { payload: envelope.payload, headers: envelope.headers ?? {} };
    }

    return { payload: data, headers: {} };
  }

  /**
   * Returns the options the strategy was initialized with.
   *
   * @param {string} operation - Operation asking for them, reported in the error
   * @returns {BullMQStrategyOptions} The options
   * @throws {QueueError} When the strategy has not been initialized
   */
  private requireOptions(operation: string): BullMQStrategyOptions {
    if (!this.fOptions) {
      throw new QueueError('BullMQ strategy is not initialized', operation, undefined, undefined, false);
    }

    return this.fOptions;
  }
}
