/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { SchedulerStore } from '../Services/SchedulerStore';
import type { IOC } from '@vercube/di';
import type { Logger } from '@vercube/logger';

export namespace SchedulerTypes {
  /**
   * Type registry of the jobs an application declares.
   *
   * It is empty by default, which keeps every job name a plain string. Augment it
   * to make `trigger()`, `pause()` and friends autocomplete the declared names.
   *
   * @example
   * ```ts
   * declare module '@vercube/scheduler' {
   *   namespace SchedulerTypes {
   *     interface Registry {
   *       'billing.close-day': true;
   *     }
   *   }
   * }
   * ```
   */
  export interface Registry {}

  /**
   * Name of a job. Resolves to the keys of {@link Registry} for autocompletion,
   * while still accepting any other string.
   */
  export type JobName = Extract<keyof Registry, string> | (string & {});

  /**
   * A length of time: a number of milliseconds, or a string such as `'30s'`,
   * `'5m'`, `'1h'`, `'1d'` or `'1h30m'`.
   */
  export type Duration = string | number;

  /**
   * Who runs an occurrence. `cluster` runs it on exactly one replica, `instance`
   * runs it on every replica.
   */
  export type Scope = 'instance' | 'cluster';

  /** What happens when an occurrence is due while the previous run is still going. */
  export type Overlap = 'skip' | 'allow';

  /** What happens to an occurrence that was missed. */
  export type Misfire = 'skip' | 'run-once';

  /**
   * Where the work of an occurrence runs. `inline` runs it on the replica that
   * claimed it. A queue target only enqueues it, through `@vercube/queue`, and
   * a worker consuming that queue runs it, with the queue's retries and backoff.
   */
  export type Target = 'inline' | QueueTarget;

  /** A queue the work of an occurrence is enqueued on. */
  export interface QueueTarget {
    /** Queue to enqueue on. */
    queue: string;

    /**
     * Mount name of the queue strategy.
     * @default 'default'
     */
    strategy?: string;

    /**
     * Total attempts the worker may take, the first one included.
     * @default 1
     */
    attempts?: number;

    /**
     * Delay between attempts, a number of milliseconds or an exponential backoff.
     * @default 0
     */
    backoff?: number | { type: 'fixed' | 'exponential'; delay: number };
  }

  /** Payload of the job a queue target enqueues. */
  export interface QueuePayload {
    /** Name of the scheduled job. */
    name: string;

    /** The occurrence, as an ISO instant. */
    scheduledAt: string;

    /** Id of the occurrence. */
    occurrenceId: string;
  }

  /** What started a run. */
  export type TriggerSource = 'timer' | 'misfire' | 'manual' | 'external' | 'queue';

  /** How a fired occurrence ended. */
  export type RunOutcome =
    | 'completed'
    | 'failed'
    | 'skipped-claimed'
    | 'skipped-overlap'
    | 'skipped-paused'
    | 'aborted'
    | 'enqueued';

  /** Options shared by `@Cron()`, `@Every()` and {@link JobDefinition}. */
  export interface JobOptions {
    /**
     * Stable id of the job. It is part of every lock key, so it must not change
     * between deploys.
     * @default `${ClassName}.${methodName}`
     */
    name?: string;

    /**
     * Who runs an occurrence.
     * @default plugin `defaults.scope`, itself `'cluster'`
     */
    scope?: Scope;

    /**
     * What happens when the previous run of this job is still going. For a
     * cluster job this is enforced across the whole cluster.
     * @default 'skip'
     */
    overlap?: Overlap;

    /**
     * What happens to an occurrence missed while no replica was up, or fired too late.
     * @default 'skip'
     */
    misfire?: Misfire;

    /**
     * How late a timer may fire and still count as on time.
     * @default '1m'
     */
    misfireGrace?: Duration;

    /**
     * Hard limit per run. Aborts `ctx.signal` with reason `timeout` and marks the run failed.
     * @default none
     */
    timeout?: Duration;

    /**
     * Lifetime of the overlap lock of a cluster run. A heartbeat extends it every third of it.
     * @default '30s'
     */
    lockTtl?: Duration;

    /**
     * Random delay, up to this long, waited before claiming an occurrence. Spreads
     * the load of many replicas without changing which occurrence it is.
     * @default 0
     */
    jitter?: Duration;

    /**
     * How many times a failed run is repeated right away, within the same
     * occurrence and lock. Use a queue for retries with backoff.
     * @default 0
     */
    retries?: number;

    /**
     * Where the work runs. A queue target needs `@vercube/queue` with its plugin,
     * and cluster scope.
     * @default 'inline'
     */
    target?: Target;

    /**
     * Fired only by external triggers (CLI, HTTP, `trigger()`), never by an in-process timer.
     * @default false
     */
    external?: boolean;

    /**
     * Registered but not scheduled until `resume()` is called.
     * @default false
     */
    paused?: boolean;
  }

  /** Options of `@Cron()`. */
  export interface CronOptions extends JobOptions {
    /**
     * IANA time zone the expression is read in.
     * @default plugin `defaults.timezone`, itself `'UTC'`
     */
    timezone?: string;
  }

  /** Options of `@Every()`. */
  export interface EveryOptions extends JobOptions {
    /**
     * Shifts the grid occurrences are aligned to. Every occurrence lands on
     * `k * interval + offset` since the Unix epoch.
     * @default 0
     */
    offset?: Duration;
  }

  /** When a job runs: a cron expression or a fixed interval. */
  export type ScheduleDefinition = { cron: string; timezone?: string } | { every: Duration; offset?: Duration };

  /** Function doing the work of a job. Its return value is ignored, throwing fails the run. */
  export type Handler = (context: JobContext) => unknown;

  /** A job, as registered with `SchedulerManager.add()`. */
  export interface JobDefinition extends Omit<JobOptions, 'name'> {
    /** Stable id of the job, part of every lock key. */
    name: string;

    /** When the job runs. */
    schedule: ScheduleDefinition;

    /** Work to do. */
    handler: Handler;

    /** Where the job was declared, shown in logs and in the devtools. */
    source?: string;
  }

  /** What a handler receives. */
  export interface JobContext {
    /** Name of the job. */
    name: string;

    /**
     * Unique id of this occurrence, `${name}@${scheduledAt.toISOString()}`.
     * Identical on every replica, so it makes a good idempotency key.
     */
    occurrenceId: string;

    /** When the run was scheduled. Identical on every replica. */
    scheduledAt: Date;

    /** When this replica actually started it. */
    startedAt: Date;

    /** What started the run. */
    trigger: TriggerSource;

    /** Starts at 1 and grows with every in-place retry. */
    attempt: number;

    /**
     * Aborted on timeout, lost lock or shutdown. Its `reason` is a
     * `SchedulerError` whose operation is `timeout`, `lock-lost` or `shutdown`.
     */
    signal: AbortSignal;

    /** Id of the replica running the job. */
    instanceId: string;

    /** Logger carrying the job and occurrence, when `@vercube/logger` is bound. */
    logger: Logger | null;
  }

  /** Result of firing an occurrence. */
  export interface RunResult {
    /** Name of the job. */
    name: string;

    /** Id of the occurrence. */
    occurrenceId: string;

    /** When the occurrence was scheduled. */
    scheduledAt: Date;

    /** How it ended. */
    outcome: RunOutcome;

    /** Attempts the run took, 0 when it was skipped. */
    attempts: number;

    /** How long the run took, in milliseconds. */
    durationMs: number;

    /** Why the run failed or was aborted. */
    error?: { name: string; message: string; operation?: string };
  }

  /** An entry of the event buffer and of every `subscribe()` listener. */
  export interface RunEvent extends Omit<RunResult, 'outcome'> {
    /** How the occurrence ended, or `missed` when the misfire policy dropped it. */
    outcome: RunOutcome | 'missed';

    /** What started the run. */
    trigger: TriggerSource;

    /** Replica that handled it. */
    instanceId: string;

    /** When the event was recorded, epoch milliseconds. */
    at: number;
  }

  /** Called with every event this manager records. */
  export type RunListener = (event: RunEvent) => void;

  /** What the store remembers of the last run of a job, across the cluster. */
  export interface JobState {
    /** Occurrence of the last run, epoch milliseconds. */
    lastScheduledAt: number;

    /** When the last run started, epoch milliseconds. */
    lastStartedAt: number;

    /** When the last run finished, absent while it runs. */
    lastFinishedAt?: number;

    /** How the last run ended, `running` while it runs. */
    lastOutcome: RunOutcome | 'running';

    /** Replica that ran it. */
    lastInstance: string;

    /** Message of the last error, capped at 1 KB. */
    lastError?: string;
  }

  /** A registered job, as reported by `list()` and `inspect()`. */
  export interface JobDescription {
    /** Name of the job. */
    name: string;

    /** Where the job was declared. */
    source: string;

    /** `cron` or `every`. */
    kind: 'cron' | 'every';

    /** The cron expression, or the interval as `every 5m`. */
    schedule: string;

    /** Time zone of a cron job. */
    timezone?: string;

    /** Effective scope. */
    scope: Scope;

    /** Effective overlap policy. */
    overlap: Overlap;

    /** Effective misfire policy. */
    misfire: Misfire;

    /** Where the work runs, `inline` or the queue it is enqueued on. */
    target: Target;

    /** Whether only external triggers fire it. */
    external: boolean;

    /** Whether it is paused on this replica. */
    paused: boolean;

    /** How many runs of it this replica has in flight. */
    running: number;

    /** Next occurrence, null when there is none. */
    nextRun: Date | null;

    /** Last run this replica recorded. */
    lastRun?: RunEvent;
  }

  /** Capabilities of a store. */
  export interface StoreCapabilities {
    /** Whether several processes see the same claims. */
    distributed: boolean;
  }

  /** State of the mounted store, for the devtools. */
  export type StoreStatus = 'idle' | 'ready' | 'error';

  /** Everything the module holds, for the devtools. */
  export interface Snapshot {
    /** Whether the timers are armed. */
    started: boolean;

    /** Id of this replica. */
    instanceId: string;

    /** The mounted store, null when there is none. */
    store: { name: string; distributed: boolean; status: StoreStatus; error?: string } | null;

    /** Registered jobs. */
    jobs: JobDescription[];

    /** Recent events, newest first. */
    events: RunEvent[];
  }

  /**
   * Source of time and timers. The manager never calls `Date.now()` or
   * `setTimeout()` directly, so a test can drive it with a manual clock.
   */
  export interface Clock {
    /** Current time, epoch milliseconds. */
    now(): number;

    /**
     * Calls `fn` after `ms` milliseconds. Whatever `fn` returns is awaited by a
     * manual clock, so advancing time also waits for the work it started.
     */
    setTimeout(fn: () => unknown, ms: number): unknown;

    /** Cancels a timer created by {@link Clock.setTimeout}. */
    clearTimeout(handle: unknown): void;
  }

  /**
   * Mount definition of a store. `initOptions` is required when the store
   * declares initialization options.
   *
   * `store` is usually a class, resolved through the container. An instance is
   * used as is, which lets several managers share one store.
   *
   * @typeParam T - Store being mounted.
   */
  export type Mount<T extends SchedulerStore<unknown>> = {
    /** Store class, or a ready instance. */
    store: IOC.Newable<T> | T;
  } & (undefined extends InitOptionsOf<T> ? { initOptions?: InitOptionsOf<T> } : { initOptions: InitOptionsOf<T> });

  /**
   * Options a store is initialized with, read off the type-only marker
   * `SchedulerStore` carries.
   *
   * @typeParam T - Store to read the options of.
   */
  export type InitOptionsOf<T> = T extends { __initOptions: infer U } ? U : never;

  /** A store mount with its options type erased, as accepted by the plugin. */
  export interface AnyMount {
    /** Store class, or a ready instance. */
    store: IOC.Newable<SchedulerStore<any>> | SchedulerStore<any>;

    /** Options passed to the store on first use. */
    initOptions?: unknown;
  }

  /** Job options applied to every job that does not set them. */
  export interface Defaults extends Omit<JobOptions, 'name' | 'paused' | 'external' | 'target'> {
    /**
     * Time zone of cron jobs.
     * @default 'UTC'
     */
    timezone?: string;
  }

  /** Manager-wide settings. */
  export interface Options {
    /** Job options applied to every job that does not set them. */
    defaults?: Defaults;

    /**
     * Arm the timers once the container is initialized. Set to false in
     * processes that should register jobs without running them, such as web-only pods.
     * @default true
     */
    autoStart?: boolean;

    /**
     * Allow cluster jobs on a store that is not distributed in production.
     * Only for deployments that really run a single process.
     * @default false
     */
    allowLocalCluster?: boolean;

    /**
     * Id of this replica, reported in the state and the devtools.
     * @default `${HOSTNAME}-${pid}-${random}`
     */
    instanceId?: string;

    /**
     * How long `stop()` waits for in-flight runs on a signal before aborting them.
     * @default '25s'
     */
    shutdownTimeout?: Duration;

    /**
     * Stop gracefully on these process signals, `true` meaning `SIGTERM` and `SIGINT`.
     * @default false
     */
    handleSignals?: boolean | string[];

    /**
     * How many events are kept for inspection.
     * @default 50
     */
    maxEvents?: number;

    /**
     * Source of time and timers, for tests. See `ManualClock` from `@vercube/scheduler/testing`.
     * @default the system clock
     */
    clock?: Clock;
  }

  /** Options of the HTTP trigger. */
  export interface HttpOptions {
    /**
     * Path the trigger is mounted at, jobs run at `<path>/run/<name>`.
     * @default '/_scheduler'
     */
    path?: string;

    /** Secret every request has to send as `Authorization: Bearer <secret>`. Required. */
    secret: string;
  }

  /** Options accepted by the scheduler plugin. */
  export interface PluginOptions extends Options {
    /** Store holding the claims of cluster jobs. */
    store?: AnyMount;

    /**
     * Mounts an HTTP endpoint external schedulers call to run a job, such as
     * Vercel Cron. Off unless set, and refused without a secret.
     */
    http?: HttpOptions;
  }

  /** A mounted store together with the options it is initialized with. */
  export interface MountedStore<T = unknown> {
    /** The store instance. */
    store: SchedulerStore<T>;

    /** Options passed to `initialize()` on first use. */
    initOptions?: T;

    /** Resolves once the store has been initialized, absent before the first use. */
    ready?: Promise<void>;

    /** Error the last initialization attempt failed with. */
    error?: Error;
  }
}
