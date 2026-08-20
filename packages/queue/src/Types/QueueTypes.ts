/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { QueueStrategy } from '../Services/QueueStrategy';
import type { MaybePromise, ValidationTypes } from '@vercube/core';
import type { IOC } from '@vercube/di';

export namespace QueueTypes {
  /**
   * Type registry mapping queue names to the jobs they accept.
   *
   * It is empty by default, which keeps every queue and job name a plain string.
   * Augment it to make `QueueManager.add()` fully type checked - registered queues
   * then only accept their own job names with matching payloads, while unregistered
   * queues keep working as before.
   *
   * @example
   * ```ts
   * declare module '@vercube/queue' {
   *   namespace QueueTypes {
   *     interface Registry {
   *       emails: {
   *         welcome: { userId: string };
   *         digest: { userId: string; period: 'daily' | 'weekly' };
   *       };
   *     }
   *   }
   * }
   * ```
   */
  export interface Registry {}

  /**
   * Name of a queue. Resolves to the keys of {@link Registry} for autocompletion,
   * while still accepting any other string.
   */
  export type QueueName = Extract<keyof Registry, string> | (string & {});

  /**
   * Job names allowed on a given queue. Restricted to the jobs declared in
   * {@link Registry} for registered queues, any string otherwise.
   *
   * @typeParam TQueue - Queue the job belongs to.
   */
  export type JobName<TQueue> = TQueue extends keyof Registry ? Extract<keyof Registry[TQueue], string> : string;

  /**
   * Payload type of a job. Taken from {@link Registry} for registered queues,
   * `unknown` otherwise.
   *
   * @typeParam TQueue - Queue the job belongs to.
   * @typeParam TJob - Name of the job.
   */
  export type JobPayload<TQueue, TJob> = TQueue extends keyof Registry
    ? TJob extends keyof Registry[TQueue]
      ? Registry[TQueue][TJob]
      : never
    : unknown;

  /**
   * Delay applied between two attempts of the same job.
   * A plain number is a fixed delay in milliseconds.
   */
  export type Backoff = number | { type: 'fixed' | 'exponential'; delay: number };

  /**
   * Per-job options accepted when adding a job to a queue.
   * Options a strategy cannot honour natively are either emulated by the
   * {@link QueueManager} or reported through {@link Capabilities}.
   */
  export interface JobOptions {
    /**
     * Total number of attempts, the first one included.
     * @default 1
     */
    attempts?: number;

    /**
     * Delay between attempts. A number is treated as a fixed delay in milliseconds,
     * `exponential` doubles the delay on every attempt.
     * @default 0
     */
    backoff?: Backoff;

    /** Milliseconds to wait before the job becomes available for processing. */
    delay?: number;

    /** Job priority, lower values are processed first. */
    priority?: number;

    /** Explicit job id, used by strategies that deduplicate on it. */
    jobId?: string;

    /** Routing or partition key, used by Kafka and RabbitMQ to keep related jobs ordered. */
    key?: string;

    /** Extra transport headers travelling with the job. */
    headers?: Record<string, string>;

    /** Whether completed jobs are kept, or how many of them, for strategies that store history. */
    removeOnComplete?: boolean | number;

    /** Whether failed jobs are kept, or how many of them, for strategies that store history. */
    removeOnFail?: boolean | number;
  }

  /**
   * Mount definition of a strategy, as accepted by {@link QueueManager.mount}.
   * `initOptions` is required when the strategy declares initialization options.
   *
   * @typeParam T - Strategy being mounted.
   */
  export type Mount<T extends QueueStrategy<unknown>> = {
    /**
     * Name the strategy is mounted under, referenced by the `strategy` option
     * of every other call.
     * @default 'default'
     */
    name?: string;

    /** Strategy class, resolved through the container so it can use `@Inject`. */
    strategy: IOC.Newable<T>;
  } & (T extends QueueStrategy<undefined>
    ? { initOptions?: unknown }
    : T extends QueueStrategy<infer U>
      ? { initOptions: U }
      : never);

  /** A mounted strategy together with the options it is initialized with. */
  export interface MountedStrategy<T = unknown> {
    /** Name the strategy is mounted under. */
    name: string;

    /** The resolved strategy instance. */
    strategy: QueueStrategy<T>;

    /** Options passed to `initialize()` on first use. */
    initOptions?: T;

    /** Resolves once the strategy has been initialized, absent before the first use. */
    ready?: Promise<void>;

    /** Error the last initialization attempt failed with. */
    error?: Error;
  }

  /**
   * Request to add a single job to a queue.
   *
   * @typeParam TQueue - Queue the job is added to.
   * @typeParam TJob - Name of the job.
   */
  export interface AddRequest<TQueue = QueueName, TJob = JobName<TQueue>> {
    /**
     * Mounted strategy to publish through.
     * @default 'default'
     */
    strategy?: string;

    /** Queue the job is added to. */
    queue: TQueue;

    /** Name of the job, used to pick the handler on the consumer side. */
    job: TJob;

    /** Payload handed to the handler. Must survive JSON serialization. */
    payload: JobPayload<TQueue, TJob>;

    /** Per-job options such as retries, delay or priority. */
    options?: JobOptions;
  }

  /**
   * Request to add many jobs of the same kind to a queue in one round trip.
   *
   * @typeParam TQueue - Queue the jobs are added to.
   * @typeParam TJob - Name of the jobs.
   */
  export interface AddManyRequest<TQueue = QueueName, TJob = JobName<TQueue>> extends Omit<AddRequest<TQueue, TJob>, 'payload'> {
    /** Payloads to publish, one job per entry. */
    payloads: JobPayload<TQueue, TJob>[];
  }

  /** Identifies a job that has been published. */
  export interface JobRef {
    /** Id assigned by the strategy, or generated when the transport has none. */
    id: string;

    /** Queue the job was published to. */
    queue: string;

    /** Name of the job. */
    job: string;

    /** Name of the strategy the job was published through. */
    strategy: string;
  }

  /** A job as handed to a strategy for publishing. */
  export interface PublishRequest {
    /** Queue to publish to. */
    queue: string;

    /** Name of the job. */
    job: string;

    /** Payload to publish. */
    payload: unknown;

    /** Transport headers, already including the queue module's own bookkeeping. */
    headers: Record<string, string>;

    /** Per-job options. */
    options: JobOptions;
  }

  /** A job as received from a strategy, before any handler runs. */
  export interface IncomingJob {
    /** Id of the job, unique within the queue. */
    id: string;

    /** Name of the job, resolved from the transport. */
    job: string;

    /** Raw payload, already deserialized. */
    payload: unknown;

    /** Transport headers received with the job. */
    headers: Record<string, string>;

    /**
     * Attempt number, starting at 1.
     */
    attempt: number;

    /** Total attempts the transport itself will make, when it owns retries. */
    attempts?: number;

    /** Strategy-native job or message, for advanced use. */
    raw?: unknown;

    /** Reports handler progress back to the transport, when it supports it. */
    updateProgress?: (progress: number | Record<string, unknown>) => MaybePromise<void>;
  }

  /** Everything a handler learns about the job it is processing. */
  export interface JobContext<T = unknown> {
    /** Id of the job. */
    id: string;

    /** Name of the job. */
    job: string;

    /** Queue the job came from. */
    queue: string;

    /** Name of the strategy the job came from. */
    strategy: string;

    /** Attempt number, starting at 1. */
    attempt: number;

    /** Total number of attempts this job may take. */
    attempts: number;

    /** Validated payload, identical to the first handler argument. */
    payload: T;

    /** Transport headers received with the job. */
    headers: Record<string, string>;

    /** Strategy-native job or message, for advanced use. */
    raw?: unknown;

    /** Logger scoped to this job, when a logger is bound in the container. */
    logger: LoggerLike | null;

    /**
     * Reports progress back to the transport. A no-op for transports that
     * do not track job progress.
     *
     * @param progress - Percentage or arbitrary progress payload.
     * @returns Resolves once the progress has been reported.
     */
    updateProgress: (progress: number | Record<string, unknown>) => Promise<void>;
  }

  /**
   * Minimal logger contract used inside a {@link JobContext}, so job code does not
   * have to import the logger package.
   */
  export interface LoggerLike {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  }

  /**
   * A job handler.
   *
   * Throwing marks the job as failed and hands it to the retry policy, returning
   * marks it as completed.
   *
   * @typeParam T - Payload type of the job.
   */
  export type Handler<T = any> = (payload: T, context: JobContext<T>) => MaybePromise<void>;

  /** Called after a job completed successfully. */
  export type CompletedHook = (context: JobContext) => MaybePromise<void>;

  /** Called after a job threw, once per failed attempt. */
  export type FailedHook = (error: Error, context: JobContext) => MaybePromise<void>;

  /** Consumer-side options of a single job handler. */
  export interface HandlerOptions {
    /**
     * Total attempts to apply when the published job does not carry its own
     * `attempts` option.
     * @default 1
     */
    attempts?: number;

    /** Delay between attempts, used with {@link HandlerOptions.attempts}. */
    backoff?: Backoff;

    /** Milliseconds after which a running handler is considered failed. */
    timeout?: number;

    /** Standard Schema validating the payload before the handler runs. */
    schema?: ValidationTypes.Schema;
  }

  /** Options shared by every handler of a consumer class. */
  export interface ConsumerOptions extends HandlerOptions {
    /** Queue the consumer reads from. */
    queue: QueueName;

    /**
     * Mounted strategy to consume from.
     * @default 'default'
     */
    strategy?: string;

    /**
     * How many jobs of this queue may run in parallel.
     * @default 1
     */
    concurrency?: number;
  }

  /** A registered job handler, as kept by the {@link QueueManager}. */
  export interface Registration {
    /** Name of the strategy the handler consumes from. */
    strategy: string;

    /** Queue the handler consumes from. */
    queue: string;

    /** Name of the job the handler processes. */
    job: string;

    /** The handler itself, already bound to its instance. */
    handler: Handler;

    /** Consumer-side options of the handler. */
    options: HandlerOptions;

    /** How many jobs of this queue the handler's consumer may run in parallel. */
    concurrency?: number;

    /** Display name of the handler, in the `Class.method` form. */
    source: string;
  }

  /** A registered lifecycle hook, as kept by the {@link QueueManager}. */
  export interface HookRegistration {
    /** Name of the strategy the hook listens on. */
    strategy: string;

    /** Queue the hook listens on. */
    queue: string;

    /** Job the hook is limited to, or undefined for every job of the queue. */
    job?: string;

    /** The hook itself, already bound to its instance. */
    hook: CompletedHook | FailedHook;

    /** Display name of the hook, in the `Class.method` form. */
    source: string;
  }

  /** What a queue a strategy talks to can actually do. */
  export interface Capabilities {
    /** The transport retries failed jobs on its own. */
    retries: boolean;

    /** The transport can delay a job before it becomes available. */
    delay: boolean;

    /** The transport honours job priority. */
    priority: boolean;

    /** The transport tracks job progress. */
    progress: boolean;

    /** The strategy can report queue statistics. */
    stats: boolean;
  }

  /** Request handed to a strategy when a queue starts being consumed. */
  export interface ConsumeRequest {
    /** Queue to consume. */
    queue: string;

    /** How many jobs may be processed in parallel. */
    concurrency: number;

    /**
     * Processes a single job. Rejecting means the job failed, and the strategy
     * should apply its own failure semantics.
     */
    dispatch: (job: IncomingJob) => Promise<void>;
  }

  /** Handle over a running consumer, used to stop it again. */
  export interface ConsumerHandle {
    /** Queue being consumed. */
    queue: string;

    /**
     * Stops the consumer, waiting for in-flight jobs to settle.
     *
     * @returns Resolves once the consumer is stopped.
     */
    stop: () => Promise<void>;
  }

  /** Live counters of a single queue. */
  export interface QueueStats {
    /** Jobs waiting to be processed, when the transport can tell. */
    waiting?: number;

    /** Jobs currently being processed. */
    active?: number;

    /** Jobs that completed successfully. */
    completed?: number;

    /** Jobs that exhausted their attempts. */
    failed?: number;

    /** Jobs waiting for their delay to elapse. */
    delayed?: number;
  }

  /** Counters the manager keeps per queue, independent of the transport. */
  export interface QueueMetrics {
    /** Name of the strategy. */
    strategy: string;

    /** Name of the queue. */
    queue: string;

    /** Jobs published through this manager. */
    published: number;

    /** Jobs whose handler completed successfully. */
    processed: number;

    /** Attempts that ended with an error. */
    failed: number;

    /** Attempts scheduled again after a failure. */
    retried: number;

    /** Jobs received with no handler registered for their name. */
    unhandled: number;

    /** Handlers currently running. */
    active: number;

    /** Message of the last error seen on this queue. */
    lastError?: string;
  }

  /** Outcome of a single processing attempt. */
  export type JobStatus = 'completed' | 'failed' | 'retried' | 'unhandled';

  /** A processed job, as kept in the manager's ring buffer. */
  export interface JobEvent {
    /** Epoch milliseconds the attempt finished at. */
    at: number;

    /** Name of the strategy. */
    strategy: string;

    /** Name of the queue. */
    queue: string;

    /** Name of the job. */
    job: string;

    /** Id of the job. */
    id: string;

    /** Attempt number. */
    attempt: number;

    /** Outcome of the attempt. */
    status: JobStatus;

    /** Wall clock duration of the handler, in milliseconds. */
    duration: number;

    /** Error message, for failed attempts. */
    error?: string;
  }

  /** State of a mounted strategy. */
  export type StrategyStatus = 'idle' | 'ready' | 'error' | 'closed';

  /** A mounted strategy, as reported by {@link QueueManager.inspect}. */
  export interface StrategyInfo {
    /** Name the strategy is mounted under. */
    name: string;

    /** Transport the strategy talks to, for example `bullmq`. */
    transport: string;

    /** Class name of the strategy. */
    driver: string;

    /** Current state of the strategy. */
    status: StrategyStatus;

    /** What the transport supports. */
    capabilities: Capabilities;

    /** Message of the error the strategy failed with. */
    error?: string;
  }

  /** A registered handler, as reported by {@link QueueManager.inspect}. */
  export interface ConsumerInfo {
    /** Name of the strategy. */
    strategy: string;

    /** Queue the handler consumes from. */
    queue: string;

    /** Name of the job. */
    job: string;

    /** Display name of the handler, in the `Class.method` form. */
    source: string;

    /** Attempts applied when the job carries none. */
    attempts: number;

    /** Handler timeout in milliseconds, when one is set. */
    timeout?: number;

    /** Whether the payload is validated before the handler runs. */
    validated: boolean;

    /** Whether the queue is currently being consumed. */
    running: boolean;
  }

  /** Full picture of the queue module at a point in time. */
  export interface Snapshot {
    /** Whether consumers have been started. */
    started: boolean;

    /** Mounted strategies. */
    strategies: StrategyInfo[];

    /** Registered handlers. */
    consumers: ConsumerInfo[];

    /** Per-queue counters. */
    metrics: QueueMetrics[];

    /** Recently processed jobs, newest first. */
    events: JobEvent[];
  }

  /** Manager-wide settings. */
  export interface Defaults {
    /**
     * Start consumers automatically once the container is initialized.
     * Set to false in producer-only processes.
     * @default true
     */
    autoStart?: boolean;

    /**
     * Default number of jobs processed in parallel per queue.
     * @default 1
     */
    concurrency?: number;

    /**
     * What to do with a job no handler is registered for. `ignore` drops it,
     * `fail` reports it as a failed job so the transport can retry or dead-letter it.
     * @default 'ignore'
     */
    onUnhandled?: 'ignore' | 'fail';

    /**
     * How many processed jobs are kept for inspection.
     * @default 50
     */
    maxEvents?: number;
  }
}
