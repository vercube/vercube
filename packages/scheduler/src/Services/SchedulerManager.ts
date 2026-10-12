import { Container, Destroy, Init, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { SchedulerError } from '../Errors/SchedulerError';
import { MAX_TIMEOUT, SystemClock } from '../Utils/Clock';
import { parseDuration } from '../Utils/Duration';
import { asError, toSchedulerError } from '../Utils/Errors';
import { hasGeneratedName } from '../Utils/Metadata';
import { createInstanceId, isProduction, randomHex } from '../Utils/Runtime';
import { assertTimezone, cronSchedule, everySchedule } from '../Utils/Schedule';
import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { Schedule } from '../Utils/Schedule';
import type { SchedulerStore } from './SchedulerStore';

/** Job options once every duration is read and every default applied. */
interface ResolvedOptions {
  scope: SchedulerTypes.Scope;
  overlap: SchedulerTypes.Overlap;
  misfire: SchedulerTypes.Misfire;
  misfireGrace: number;
  timeout: number;
  lockTtl: number;
  jitter: number;
  retries: number;
  timezone: string;
}

/** A registered job and what this replica tracks about it. */
interface Registration {
  /** Name of the job. */
  name: string;

  /** Where it was declared. */
  source: string;

  /** Work to do. */
  handler: SchedulerTypes.Handler;

  /** When it runs, as declared. */
  definition: SchedulerTypes.ScheduleDefinition;

  /** Options the job set itself, already parsed. */
  own: Partial<ResolvedOptions>;

  /** Whether only external triggers fire it. */
  external: boolean;

  /** Whether it is paused on this replica. */
  paused: boolean;

  /** Whether the name was derived from the class and method rather than given. */
  generatedName: boolean;

  /** Queue the work is enqueued on, null to run it inline. */
  target: ParsedTarget | null;

  /** Consumer registered with the queue for a queue target. */
  consumer?: QueueRegistration;

  /** Computed schedule, rebuilt when the default time zone changes. */
  schedule?: Schedule;

  /** Pending timer. */
  timer?: unknown;

  /** Latest occurrence fired here, so it is never fired twice. */
  lastFired: number | null;

  /** Runs of this job in flight here. */
  running: number;
}

/** What the scheduler needs from the `QueueManager` of `@vercube/queue`. */
interface QueueManagerLike {
  add(request: {
    queue: string;
    job: string;
    payload: SchedulerTypes.QueuePayload;
    strategy?: string;
    options?: { jobId?: string };
  }): Promise<unknown>;
  registerConsumer(registration: QueueRegistration): void;
  unregisterConsumer(registration: Pick<QueueRegistration, 'strategy' | 'queue' | 'job'>): void;
}

/** A consumer registration, as `QueueManager.registerConsumer()` takes it. */
interface QueueRegistration {
  strategy: string;
  queue: string;
  job: string;
  handler: (payload: SchedulerTypes.QueuePayload, context: { attempt: number }) => Promise<void>;
  options: Pick<SchedulerTypes.QueueTarget, 'attempts' | 'backoff'>;
  source: string;
}

/** A queue target with its defaults applied. */
type ParsedTarget = Required<Pick<SchedulerTypes.QueueTarget, 'queue' | 'strategy'>> &
  Pick<SchedulerTypes.QueueTarget, 'attempts' | 'backoff'>;

/** A claim held in the store for the duration of a run. */
interface Lock {
  store: SchedulerStore<unknown>;
  key: string;
  owner: string;
}

/** Job options before anything is configured. */
const DEFAULT_OPTIONS: ResolvedOptions = {
  scope: 'cluster',
  overlap: 'skip',
  misfire: 'skip',
  misfireGrace: 60_000,
  timeout: 0,
  lockTtl: 30_000,
  jitter: 0,
  retries: 0,
  timezone: 'UTC',
};

/** Signals handled when `handleSignals` is `true`. */
const DEFAULT_SIGNALS = ['SIGTERM', 'SIGINT'];

/** How far back the startup catch-up looks for a missed occurrence. */
const CATCH_UP_WINDOW = 24 * 60 * 60_000;

/** How long an aborted handler is given to settle before the run moves on without it. */
const SETTLE_GRACE = 1000;

/** How much longer than the misfire grace and the lock an occurrence claim lives. */
const OCCURRENCE_MARGIN = 5 * 60_000;

/** Shortest lock lifetime, so heartbeats never hammer the store. */
const MIN_LOCK_TTL = 1000;

/** Longest error message kept in the store. */
const MAX_ERROR_LENGTH = 1024;

/**
 * Central entry point of the scheduler module.
 *
 * Every replica computes the same occurrences from the same code. Whether one
 * replica or all of them run an occurrence is decided by the job's scope: an
 * `instance` job runs everywhere, a `cluster` job runs on whichever replica
 * claims the occurrence in the mounted store first.
 *
 * The manager owns the timers, the run pipeline (claims, overlap, heartbeats,
 * timeouts, retries, misfires) and the graceful shutdown.
 *
 * @example
 * ```ts
 * container.bind(SchedulerManager);
 *
 * const scheduler = container.get(SchedulerManager);
 * await scheduler.mount({ store: MemoryStore });
 *
 * scheduler.add({
 *   name: 'reports.nightly',
 *   schedule: { cron: '0 3 * * *', timezone: 'Europe/Warsaw' },
 *   handler: async (ctx) => reports.generate(ctx.scheduledAt),
 * });
 * ```
 */
export class SchedulerManager {
  /** Container instance */
  @Inject(Container)
  protected gContainer!: Container;

  /** Logger instance */
  @InjectOptional(Logger)
  protected gLogger!: Logger | null;

  /** Registered jobs, indexed by name */
  protected fJobs: Map<string, Registration> = new Map();

  /** The mounted store */
  protected fStore: SchedulerTypes.MountedStore<any> | null = null;

  /** Job defaults set through `configure()`, already parsed */
  protected fDefaults: Partial<ResolvedOptions> = {};

  /** Manager-wide settings */
  protected fOptions: {
    autoStart: boolean;
    allowLocalCluster: boolean;
    shutdownTimeout: number;
    handleSignals: boolean | string[];
    maxEvents: number;
  } = {
    autoStart: true,
    allowLocalCluster: false,
    shutdownTimeout: 25_000,
    handleSignals: false,
    maxEvents: 50,
  };

  /** Source of time and timers */
  protected fClock: SchedulerTypes.Clock = SystemClock;

  /** Id of this replica, created on first use */
  protected fInstanceId: string | null = null;

  /** Whether the timers are armed */
  protected fStarted: boolean = false;

  /** Counts `stop()` calls, so a `start()` waiting on I/O notices one happened meanwhile */
  protected fStops: number = 0;

  /** Shutdown in progress */
  protected fStopping: Promise<void> | null = null;

  /** Work in flight: runs, and occurrences on their way to one */
  protected fInflight: Set<Promise<unknown>> = new Set();

  /** Abort controllers of the runs in flight */
  protected fRuns: Set<AbortController> = new Set();

  /** Recent events, newest first */
  protected fEvents: SchedulerTypes.RunEvent[] = [];

  /** Last event of every job */
  protected fLastRuns: Map<string, SchedulerTypes.RunEvent> = new Map();

  /** Listeners following the runs */
  protected fListeners: Set<SchedulerTypes.RunListener> = new Set();

  /** Installed process signal listeners, removed on close */
  protected fSignalCleanup: (() => void) | null = null;

  /** Queue manager of `@vercube/queue`, resolved when a job targets a queue */
  protected fQueue: QueueManagerLike | null = null;

  /** Whether the local-store warning was already logged */
  protected fWarnedLocal: boolean = false;

  /**
   * Whether the timers are armed.
   *
   * @returns {boolean} True between {@link SchedulerManager.start} and {@link SchedulerManager.stop}
   */
  public get started(): boolean {
    return this.fStarted;
  }

  /**
   * Id of this replica, as written into the store and the devtools.
   *
   * @returns {string} The `instanceId` option, or one built from the host name, the pid and a random suffix
   */
  public get instanceId(): string {
    this.fInstanceId ??= createInstanceId();

    return this.fInstanceId;
  }

  /**
   * The mounted store.
   *
   * @returns {SchedulerStore<unknown> | undefined} The store, or undefined when none is mounted
   */
  public get store(): SchedulerStore<unknown> | undefined {
    return this.fStore?.store;
  }

  /**
   * Sets manager-wide settings. Calling it repeatedly merges into the existing
   * ones, and options set on a job always win over `defaults`.
   *
   * @param {SchedulerTypes.Options} options - Settings to apply
   * @returns {void}
   * @throws {SchedulerError} When a default is invalid
   */
  public configure(options: SchedulerTypes.Options): void {
    const { defaults, clock, instanceId, shutdownTimeout, ...rest } = options;

    if (defaults) {
      if (defaults.timezone !== undefined) {
        assertTimezone(defaults.timezone);
      }

      Object.assign(
        this.fDefaults,
        this.parseOptions(defaults, 'defaults'),
        defaults.timezone ? { timezone: defaults.timezone } : {},
      );
    }

    if (clock) {
      this.fClock = clock;
    }

    if (instanceId) {
      this.fInstanceId = instanceId;
    }

    if (shutdownTimeout !== undefined) {
      this.fOptions.shutdownTimeout = parseDuration(shutdownTimeout, 'shutdownTimeout');
    }

    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) {
        (this.fOptions as Record<string, unknown>)[key] = value;
      }
    }
  }

  /**
   * Mounts the store holding the claims of cluster jobs. It connects on first use.
   *
   * @template T - Store being mounted
   * @param {SchedulerTypes.Mount<T>} mount - Store class or instance, and its init options
   * @returns {Promise<void>} Resolves once the store is mounted
   */
  public async mount<T extends SchedulerStore<unknown>>(mount: SchedulerTypes.Mount<T>): Promise<void> {
    const store = typeof mount.store === 'function' ? this.gContainer.resolve(mount.store) : mount.store;

    this.fStore = { store: store as SchedulerStore<unknown>, initOptions: mount.initOptions };

    if (this.fStarted) {
      await this.ensureReady(this.fStore).catch(() => undefined);
    }
  }

  /**
   * Registers a job. The decorators call this, and so can application code
   * creating jobs at runtime. Jobs added this way live in this process only.
   *
   * @param {SchedulerTypes.JobDefinition} definition - Name, schedule, handler and options of the job
   * @returns {void}
   * @throws {SchedulerError} When the name is taken, or the schedule or an option is invalid
   *
   * @example
   * ```ts
   * scheduler.add({
   *   name: `tenant.${tenant.id}.sync`,
   *   schedule: { every: '15m' },
   *   handler: () => sync(tenant),
   * });
   * ```
   */
  public add(definition: SchedulerTypes.JobDefinition): void {
    const { name, schedule, handler, source, external, paused, target, ...options } = definition;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new SchedulerError('A job needs a name', 'register', undefined, { source }, false);
    }

    const existing = this.fJobs.get(name);

    if (existing) {
      throw new SchedulerError(
        `Job "${name}" is already registered`,
        'register',
        undefined,
        { registered: existing.source, duplicate: source },
        false,
      );
    }

    if (typeof handler !== 'function') {
      throw new SchedulerError(`Job "${name}" needs a handler function`, 'register', undefined, { source }, false);
    }

    const registration: Registration = {
      name,
      source: source ?? name,
      handler,
      definition: schedule,
      own: this.parseOptions(options, name),
      external: external ?? false,
      paused: paused ?? false,
      generatedName: hasGeneratedName(definition),
      target: this.parseTarget(target, name),
      lastFired: null,
      running: 0,
    };

    // built right away, so a bad expression or time zone fails at boot
    this.scheduleOf(registration);

    if (this.fStarted) {
      this.assertRunnable([registration]);
    }

    this.fJobs.set(name, registration);

    if (registration.target && this.fStarted && !this.fQueue) {
      // added at runtime: the queue is resolved in the background, enqueueing waits for it
      void this.track(
        this.connectQueue().catch((error) => this.gLogger?.error(`Vercube/SchedulerManager::${(error as Error).message}`)),
      );
    }

    this.registerConsumer(registration);
    this.arm(registration);
  }

  /**
   * Removes a job. Runs already in flight finish on their own.
   *
   * @param {SchedulerTypes.JobName} name - Job to remove
   * @returns {void}
   */
  public remove(name: SchedulerTypes.JobName): void {
    const registration = this.fJobs.get(name);

    if (!registration) {
      return;
    }

    this.disarm(registration);
    this.unregisterConsumer(registration);
    this.fJobs.delete(name);
  }

  /**
   * Stops scheduling a job on this replica. Other replicas are not affected.
   *
   * @param {SchedulerTypes.JobName} name - Job to pause
   * @returns {void}
   * @throws {SchedulerError} When no job has that name
   */
  public pause(name: SchedulerTypes.JobName): void {
    const registration = this.require(name, 'pause');

    registration.paused = true;
    this.disarm(registration);
  }

  /**
   * Schedules a paused job again on this replica.
   *
   * @param {SchedulerTypes.JobName} name - Job to resume
   * @returns {void}
   * @throws {SchedulerError} When no job has that name
   */
  public resume(name: SchedulerTypes.JobName): void {
    const registration = this.require(name, 'resume');

    registration.paused = false;
    this.arm(registration);
  }

  /**
   * Arms the timer of every job and catches up on the occurrences cluster jobs
   * missed while no replica was up. Safe to call more than once.
   *
   * @returns {Promise<void>} Resolves once the timers are armed
   * @throws {SchedulerError} When cluster jobs have no store, or a store that is
   * not distributed in production
   */
  public async start(): Promise<void> {
    if (this.fStarted) {
      return;
    }

    const stops = this.fStops;

    this.assertRunnable([...this.fJobs.values()]);

    if ([...this.fJobs.values()].some((registration) => registration.target)) {
      await this.connectQueue();

      // stopped while the queue was resolved
      if (this.fStops !== stops) {
        return;
      }
    }

    this.fStarted = true;
    this.installSignals();

    if (this.fStore) {
      try {
        await this.ensureReady(this.fStore);
      } catch {
        // ensureReady already logged it, claims retry the connection on every run
      }
    }

    // stopped while the store was connecting
    if (this.fStops !== stops) {
      return;
    }

    for (const registration of this.fJobs.values()) {
      this.arm(registration);
    }

    for (const registration of this.fJobs.values()) {
      void this.track(this.catchUp(registration));
    }
  }

  /**
   * Stops gracefully: no new run starts, runs in flight are awaited, and once
   * the timeout is reached they are aborted with reason `shutdown`. Overlap locks
   * this replica holds are released, occurrence claims stay so no other replica
   * runs those occurrences again. Safe to call more than once.
   *
   * @param {object} [options] - How long to wait
   * @param {number} [options.timeout] - Milliseconds to wait before aborting, defaults to `shutdownTimeout`
   * @returns {Promise<void>} Resolves once nothing runs any more
   */
  public stop(options: { timeout?: number } = {}): Promise<void> {
    this.fStarted = false;
    this.fStops++;

    for (const registration of this.fJobs.values()) {
      this.disarm(registration);
    }

    this.fStopping ??= this.drainOrAbort(options.timeout ?? this.fOptions.shutdownTimeout).finally(() => {
      this.fStopping = null;
    });

    return this.fStopping;
  }

  /**
   * Stops, removes the signal listeners and closes the store.
   *
   * @returns {Promise<void>} Resolves once everything is closed
   */
  public async close(): Promise<void> {
    await this.stop();

    this.fSignalCleanup?.();
    this.fSignalCleanup = null;

    for (const registration of this.fJobs.values()) {
      this.unregisterConsumer(registration);
    }

    const mounted = this.fStore;

    if (!mounted?.ready) {
      return;
    }

    try {
      await mounted.store.close();
    } catch (error) {
      this.gLogger?.error(`Vercube/SchedulerManager::Failed to close store "${mounted.store.name}"`, error);
    }

    mounted.ready = undefined;
  }

  /**
   * Waits for every run in flight, including the ones started in the background
   * by timers and by the startup catch-up.
   *
   * @returns {Promise<void>} Resolves once nothing runs any more
   */
  public async drain(): Promise<void> {
    while (this.fInflight.size > 0) {
      await Promise.allSettled(this.fInflight);
    }
  }

  /**
   * Runs a job now, through the same pipeline as a timer: scope, overlap and
   * claims all apply, and a paused job is skipped.
   *
   * Without `scheduledAt` the run gets an occurrence of its own, so it never
   * collides with a timer occurrence. With it, it claims that occurrence, which
   * is how an external trigger makes sure it runs once across the cluster.
   *
   * @param {SchedulerTypes.JobName} name - Job to run
   * @param {object} [options] - How to run it
   * @param {Date} [options.scheduledAt] - Occurrence to claim
   * @param {SchedulerTypes.TriggerSource} [options.source] - What triggered it, defaults to `manual`
   * @param {boolean} [options.force] - Skip the occurrence claim, overlap still applies
   * @returns {Promise<SchedulerTypes.RunResult>} How the run ended
   * @throws {SchedulerError} When no job has that name, or a cluster job has no store
   *
   * @example
   * ```ts
   * const result = await scheduler.trigger('billing.close-day');
   *
   * if (result.outcome === 'failed') {
   *   console.error(result.error?.message);
   * }
   * ```
   */
  public trigger(
    name: SchedulerTypes.JobName,
    options: { scheduledAt?: Date; source?: SchedulerTypes.TriggerSource; force?: boolean } = {},
  ): Promise<SchedulerTypes.RunResult> {
    const registration = this.require(name, 'trigger');

    if (this.optionsOf(registration).scope === 'cluster' && !this.fStore) {
      throw this.missingStoreError([registration.name], 'trigger');
    }

    const scheduledAt = options.scheduledAt?.getTime();

    return this.track(
      this.fire(registration, scheduledAt ?? this.fClock.now(), options.source ?? 'manual', {
        force: options.force ?? false,
        manual: scheduledAt === undefined,
      }),
    );
  }

  /**
   * Describes every registered job.
   *
   * @returns {SchedulerTypes.JobDescription[]} The jobs, in registration order
   */
  public list(): SchedulerTypes.JobDescription[] {
    return [...this.fJobs.values()].map((registration) => this.describe(registration));
  }

  /**
   * Computes the next occurrences of a job.
   *
   * @param {SchedulerTypes.JobName} name - Job to look at
   * @param {number} [count] - How many occurrences, defaults to 5
   * @param {Date} [from] - Instant to start after, defaults to now
   * @returns {Date[]} The occurrences, earliest first
   * @throws {SchedulerError} When no job has that name
   */
  public nextRuns(name: SchedulerTypes.JobName, count: number = 5, from?: Date): Date[] {
    const schedule = this.scheduleOf(this.require(name, 'nextRuns'));
    const runs: Date[] = [];
    let cursor = from?.getTime() ?? this.fClock.now();

    while (runs.length < count) {
      const next = schedule.next(cursor);

      if (next === null) {
        break;
      }

      runs.push(new Date(next));
      cursor = next;
    }

    return runs;
  }

  /**
   * Reads the last run of jobs from the store, which includes runs done by
   * other replicas.
   *
   * @param {string[]} [names] - Jobs to read, defaults to every registered job
   * @returns {Promise<Record<string, SchedulerTypes.JobState | null>>} The state of each job, null when unknown
   */
  public async getStates(names?: string[]): Promise<Record<string, SchedulerTypes.JobState | null>> {
    const states: Record<string, SchedulerTypes.JobState | null> = {};
    const wanted = names ?? [...this.fJobs.keys()];

    if (!this.fStore) {
      return Object.fromEntries(wanted.map((name) => [name, null]));
    }

    await this.ensureReady(this.fStore);

    for (const name of wanted) {
      states[name] = await this.fStore.store.getState(name);
    }

    return states;
  }

  /**
   * Follows every event this manager records: runs, skips and missed occurrences.
   * A listener that throws is reported and kept.
   *
   * @param {SchedulerTypes.RunListener} listener - Called once per event
   * @returns {() => void} Removes the listener again
   */
  public subscribe(listener: SchedulerTypes.RunListener): () => void {
    this.fListeners.add(listener);

    return () => {
      this.fListeners.delete(listener);
    };
  }

  /**
   * Describes what the module currently holds. Used by the devtools.
   *
   * @returns {SchedulerTypes.Snapshot} The current state of the scheduler
   */
  public inspect(): SchedulerTypes.Snapshot {
    const mounted = this.fStore;

    return {
      started: this.fStarted,
      instanceId: this.instanceId,
      store: mounted
        ? {
            name: mounted.store.name,
            distributed: mounted.store.capabilities.distributed,
            status: this.storeStatus(mounted),
            error: mounted.error?.message,
          }
        : null,
      jobs: this.list(),
      events: this.fEvents.map((event) => ({ ...event })),
    };
  }

  /**
   * Reports what the mounted store is doing, for the devtools.
   *
   * @param {SchedulerTypes.MountedStore} mounted - The mounted store
   * @returns {SchedulerTypes.StoreStatus} Its status
   */
  protected storeStatus(mounted: SchedulerTypes.MountedStore<any>): SchedulerTypes.StoreStatus {
    if (mounted.error) {
      return 'error';
    }

    return mounted.ready ? 'ready' : 'idle';
  }

  /**
   * Arms the timer of a job for its next occurrence.
   *
   * @param {Registration} registration - Job to arm
   * @returns {void}
   */
  protected arm(registration: Registration): void {
    this.disarm(registration);

    if (!this.fStarted || registration.paused || registration.external) {
      return;
    }

    // never earlier than the last occurrence fired, so a clock stepping back
    // cannot fire the same occurrence twice
    const from = Math.max(this.fClock.now(), registration.lastFired ?? Number.NEGATIVE_INFINITY);
    const next = this.scheduleOf(registration).next(from);

    if (next !== null) {
      this.wait(registration, next);
    }
  }

  /**
   * Sets the timer of a job, in chunks when the occurrence is further away than
   * a single timer can wait.
   *
   * @param {Registration} registration - Job to wait for
   * @param {number} occurrence - Occurrence to wake up at
   * @returns {void}
   */
  protected wait(registration: Registration, occurrence: number): void {
    const delay = Math.min(Math.max(0, occurrence - this.fClock.now()), MAX_TIMEOUT);

    registration.timer = this.fClock.setTimeout(() => this.wake(registration, occurrence), delay);
  }

  /**
   * Cancels the timer of a job.
   *
   * @param {Registration} registration - Job to disarm
   * @returns {void}
   */
  protected disarm(registration: Registration): void {
    if (registration.timer !== undefined) {
      this.fClock.clearTimeout(registration.timer);
      registration.timer = undefined;
    }
  }

  /**
   * Handles a timer going off: re-arms the job from its schedule, so drift never
   * accumulates, then runs the occurrence or applies the misfire policy when the
   * timer fired too late.
   *
   * @param {Registration} registration - Job whose timer went off
   * @param {number} occurrence - Occurrence the timer was set for
   * @returns {Promise<unknown> | undefined} The run it started, if any
   */
  protected wake(registration: Registration, occurrence: number): Promise<unknown> | undefined {
    registration.timer = undefined;

    if (!this.fStarted || this.fJobs.get(registration.name) !== registration) {
      return undefined;
    }

    const now = this.fClock.now();

    // a chunk of a long wait
    if (now < occurrence) {
      this.wait(registration, occurrence);

      return undefined;
    }

    // a timer that slept through several occurrences only considers the latest
    const latest = Math.max(occurrence, this.scheduleOf(registration).previous(now) ?? occurrence);

    registration.lastFired = latest;
    this.arm(registration);

    if (now - latest <= this.optionsOf(registration).misfireGrace) {
      return this.track(this.fire(registration, latest, 'timer'));
    }

    return this.track(this.misfire(registration, latest));
  }

  /**
   * Applies the misfire policy to an occurrence that was missed.
   *
   * @param {Registration} registration - Job that missed it
   * @param {number} occurrence - The missed occurrence
   * @returns {Promise<SchedulerTypes.RunResult | undefined>} The run, when the policy runs it
   */
  protected async misfire(registration: Registration, occurrence: number): Promise<SchedulerTypes.RunResult | undefined> {
    if (this.optionsOf(registration).misfire === 'run-once') {
      return this.fire(registration, occurrence, 'misfire');
    }

    this.gLogger?.warn(`Vercube/SchedulerManager::Job "${registration.name}" missed ${new Date(occurrence).toISOString()}`);
    this.record(
      {
        name: registration.name,
        occurrenceId: this.occurrenceId(registration.name, occurrence),
        scheduledAt: new Date(occurrence),
        outcome: 'missed',
        attempts: 0,
        durationMs: 0,
      },
      'misfire',
    );

    return undefined;
  }

  /**
   * Runs the latest occurrence a cluster job missed while no replica was up,
   * when its misfire policy is `run-once`. Never a backlog, and through the
   * normal claim, so replicas starting together run it once.
   *
   * @param {Registration} registration - Job to catch up on
   * @returns {Promise<SchedulerTypes.RunResult | undefined>} The run, when there was one to catch up on
   */
  protected async catchUp(registration: Registration): Promise<SchedulerTypes.RunResult | undefined> {
    const options = this.optionsOf(registration);

    if (options.scope !== 'cluster' || options.misfire !== 'run-once' || registration.paused || registration.external) {
      return undefined;
    }

    const now = this.fClock.now();
    const latest = this.scheduleOf(registration).previous(now);

    if (latest === null || latest < now - CATCH_UP_WINDOW || latest <= (registration.lastFired ?? Number.NEGATIVE_INFINITY)) {
      return undefined;
    }

    let state: SchedulerTypes.JobState | null;

    try {
      await this.ensureReady(this.fStore!);
      state = await this.fStore!.store.getState(registration.name);
    } catch (error) {
      this.gLogger?.error(`Vercube/SchedulerManager::Failed to read the state of "${registration.name}"`, error);

      return undefined;
    }

    // a job that never ran has nothing to catch up on
    if (!state || latest <= state.lastScheduledAt || latest <= (registration.lastFired ?? Number.NEGATIVE_INFINITY)) {
      return undefined;
    }

    registration.lastFired = latest;

    return this.fire(registration, latest, 'misfire');
  }

  /**
   * Fires an occurrence through the run pipeline: pause, jitter, claims and
   * overlap, then the run itself.
   *
   * @param {Registration} registration - Job to fire
   * @param {number} scheduledAt - The occurrence
   * @param {SchedulerTypes.TriggerSource} source - What fired it
   * @param {object} [options] - How to fire it
   * @param {boolean} [options.force] - Skip the occurrence claim
   * @param {boolean} [options.manual] - Give the run an occurrence of its own
   * @returns {Promise<SchedulerTypes.RunResult>} How it ended
   */
  protected async fire(
    registration: Registration,
    scheduledAt: number,
    source: SchedulerTypes.TriggerSource,
    { force = false, manual = false }: { force?: boolean; manual?: boolean } = {},
  ): Promise<SchedulerTypes.RunResult> {
    const options = this.optionsOf(registration);
    const occurrenceId = manual
      ? `${registration.name}@manual:${scheduledAt}`
      : this.occurrenceId(registration.name, scheduledAt);
    const result = {
      name: registration.name,
      occurrenceId,
      scheduledAt: new Date(scheduledAt),
      attempts: 0,
      durationMs: 0,
    };

    if (registration.paused) {
      return this.record({ ...result, outcome: 'skipped-paused' }, source);
    }

    if (options.jitter > 0 && (source === 'timer' || source === 'misfire')) {
      await this.sleep(Math.floor(Math.random() * options.jitter));

      // stopped while waiting, the occurrence is left to the other replicas
      if (!this.fStarted) {
        return { ...result, outcome: 'aborted' };
      }
    }

    if (options.scope === 'instance') {
      if (options.overlap === 'skip' && registration.running > 0) {
        return this.record({ ...result, outcome: 'skipped-overlap' }, source);
      }

      return this.execute(registration, options, result, source, null);
    }

    const owner = `${this.instanceId}:${randomHex(4)}`;
    let lock: Lock | null = null;
    let store: SchedulerStore<unknown>;

    try {
      store = await this.readyStore('claim');

      const occurrenceKey = manual ? `occ:${registration.name}:manual:${scheduledAt}` : `occ:${registration.name}:${scheduledAt}`;
      const occurrenceTtl = Math.max(options.misfireGrace, options.lockTtl) + OCCURRENCE_MARGIN;

      // never released: a replica whose clock is behind must not run the
      // occurrence again after the winner already finished it
      if (!force && !(await store.claim(occurrenceKey, owner, occurrenceTtl))) {
        return this.record({ ...result, outcome: 'skipped-claimed' }, source);
      }

      // a queue target enforces overlap where the work runs, on the worker
      if (registration.target) {
        return this.enqueue(registration, store, result, source);
      }

      if (options.overlap === 'skip') {
        lock = { store, key: `active:${registration.name}`, owner };

        if (!(await store.claim(lock.key, owner, options.lockTtl))) {
          return this.record({ ...result, outcome: 'skipped-overlap' }, source);
        }
      }
    } catch (error) {
      // without a claim nobody can tell whether another replica runs it, so it does not run here
      const failure = toSchedulerError(error, `Failed to claim "${occurrenceId}"`, 'claim', { job: registration.name });

      this.gLogger?.error(`Vercube/SchedulerManager::Failed to claim "${occurrenceId}"`, error);

      return this.record({ ...result, outcome: 'failed', error: this.describeError(failure) }, source);
    }

    return this.execute(registration, options, result, source, lock, store);
  }

  /**
   * Runs the handler of an occurrence: timeout, heartbeat, retries, and the
   * state and event recorded afterwards.
   *
   * @param {Registration} registration - Job to run
   * @param {ResolvedOptions} options - Effective options of the job
   * @param {object} base - Name, occurrence and schedule of the run
   * @param {SchedulerTypes.TriggerSource} source - What fired it
   * @param {Lock | null} lock - Overlap lock held for the run, kept alive by a heartbeat
   * @param {SchedulerStore<unknown>} [store] - Store to record the state in, for cluster runs
   * @param {number} [firstAttempt] - Number of the first attempt, which a queue counts itself
   * @returns {Promise<SchedulerTypes.RunResult>} How the run ended
   */
  protected async execute(
    registration: Registration,
    options: ResolvedOptions,
    base: Omit<SchedulerTypes.RunResult, 'outcome'>,
    source: SchedulerTypes.TriggerSource,
    lock: Lock | null,
    store?: SchedulerStore<unknown>,
    firstAttempt: number = 1,
  ): Promise<SchedulerTypes.RunResult> {
    const controller = new AbortController();
    const startedAt = this.fClock.now();
    const scheduledAt = base.scheduledAt.getTime();
    const heartbeat = lock ? this.startHeartbeat(lock, options.lockTtl, controller, registration.name) : null;
    const timeout =
      options.timeout > 0
        ? this.fClock.setTimeout(() => {
            controller.abort(
              new SchedulerError(`Job "${registration.name}" timed out after ${options.timeout}ms`, 'timeout', undefined, {
                job: registration.name,
              }),
            );
          }, options.timeout)
        : undefined;

    registration.running++;
    this.fRuns.add(controller);

    await this.saveState(store, registration.name, {
      lastScheduledAt: scheduledAt,
      lastStartedAt: startedAt,
      lastOutcome: 'running',
      lastInstance: this.instanceId,
    });

    let outcome: SchedulerTypes.RunOutcome = 'completed';
    let failure: Error | undefined;
    let attempt = 0;

    try {
      for (attempt = firstAttempt; ; attempt++) {
        try {
          await this.runHandler(
            registration,
            this.createContext(registration, base, startedAt, source, attempt, controller.signal),
          );
          outcome = 'completed';
          failure = undefined;
          break;
        } catch (error) {
          failure = asError(error);

          if (controller.signal.aborted) {
            const reason = controller.signal.reason as SchedulerError;

            // a handler failing on its own after the abort reports its own error
            outcome = failure === reason && reason.operation !== 'timeout' ? 'aborted' : 'failed';
            break;
          }

          outcome = 'failed';

          if (attempt - firstAttempt >= options.retries) {
            break;
          }

          this.gLogger?.warn(`Vercube/SchedulerManager::Job "${registration.name}" failed attempt ${attempt}, retrying`, failure);
        }
      }
    } finally {
      heartbeat?.stop();

      if (timeout !== undefined) {
        this.fClock.clearTimeout(timeout);
      }

      registration.running--;
      this.fRuns.delete(controller);

      if (lock) {
        await lock.store.release(lock.key, lock.owner).catch((error) => {
          this.gLogger?.warn(`Vercube/SchedulerManager::Failed to release the lock of "${registration.name}"`, error);
        });
      }
    }

    const finishedAt = this.fClock.now();

    await this.saveState(store, registration.name, {
      lastScheduledAt: scheduledAt,
      lastStartedAt: startedAt,
      lastFinishedAt: finishedAt,
      lastOutcome: outcome,
      lastInstance: this.instanceId,
      ...(failure ? { lastError: failure.message.slice(0, MAX_ERROR_LENGTH) } : {}),
    });

    if (failure) {
      this.gLogger?.error(`Vercube/SchedulerManager::Job "${registration.name}" ${outcome}`, failure);
    }

    return this.record(
      {
        ...base,
        outcome,
        attempts: attempt,
        durationMs: finishedAt - startedAt,
        ...(failure ? { error: this.describeError(failure) } : {}),
      },
      source,
    );
  }

  /**
   * Runs a handler once. When the run is aborted, the handler is given a short
   * grace to settle and then left behind: a promise cannot be killed, so a
   * handler ignoring its signal keeps running unobserved.
   *
   * @param {Registration} registration - Job to run
   * @param {SchedulerTypes.JobContext} context - Context of this attempt
   * @returns {Promise<void>} Resolves once the handler returned
   * @throws {Error} What the handler threw, or the abort reason
   */
  protected async runHandler(registration: Registration, context: SchedulerTypes.JobContext): Promise<void> {
    const { signal } = context;

    // aborted before this attempt, while the state was saved or between two
    // attempts: the signal never fires 'abort' again, so it is checked here
    if (signal.aborted) {
      throw signal.reason;
    }

    const run = Promise.resolve().then(() => registration.handler(context));
    const settled = run.then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error: error ?? new Error('Job failed') }),
    );

    let onAbort: (() => void) | undefined;
    const aborted = new Promise<'aborted'>((resolve) => {
      onAbort = () => resolve('aborted');
      signal.addEventListener('abort', onAbort, { once: true });
    });

    const first = await Promise.race([settled, aborted]);

    signal.removeEventListener('abort', onAbort!);

    if (first !== 'aborted') {
      if (first.error !== undefined) {
        throw first.error;
      }

      return;
    }

    const late = await this.within(settled, SETTLE_GRACE);

    if (late?.error !== undefined && late.error !== signal.reason) {
      throw late.error;
    }

    throw signal.reason;
  }

  /**
   * Keeps the overlap lock of a run alive, extending it every third of its
   * lifetime. A lock that cannot be extended any more aborts the run with
   * reason `lock-lost`: another replica may take over, so this one must stop.
   *
   * @param {Lock} lock - Lock to keep alive
   * @param {number} ttl - Lifetime of the lock
   * @param {AbortController} controller - Controller of the run
   * @param {string} name - Name of the job
   * @returns {{ stop: () => void }} Stops the heartbeat
   */
  protected startHeartbeat(lock: Lock, ttl: number, controller: AbortController, name: string): { stop: () => void } {
    let stopped = false;
    let failures = 0;
    let timer: unknown;

    const lost = (cause?: Error): void => {
      this.gLogger?.warn(`Vercube/SchedulerManager::Job "${name}" lost its lock, aborting the run`, cause);
      controller.abort(new SchedulerError(`Job "${name}" lost its lock`, 'lock-lost', cause, { job: name }));
    };

    const beat = async (): Promise<void> => {
      let extended: boolean;

      try {
        extended = await lock.store.extend(lock.key, lock.owner, ttl);
        failures = 0;
      } catch (error) {
        // one failure may be a blip, the next beat still has a third of the lifetime left
        if (++failures < 2) {
          if (!stopped) {
            schedule();
          }

          return;
        }

        if (!stopped) {
          lost(asError(error));
        }

        return;
      }

      if (stopped) {
        return;
      }

      if (!extended) {
        lost();

        return;
      }

      schedule();
    };

    const schedule = (): void => {
      timer = this.fClock.setTimeout(beat, Math.max(1, Math.floor(ttl / 3)));
    };

    schedule();

    return {
      stop: () => {
        stopped = true;
        this.fClock.clearTimeout(timer);
      },
    };
  }

  /**
   * Waits for the runs in flight, aborting them with reason `shutdown` once the
   * timeout is reached.
   *
   * @param {number} timeout - Milliseconds to wait before aborting
   * @returns {Promise<void>} Resolves once nothing runs any more
   */
  protected async drainOrAbort(timeout: number): Promise<void> {
    if (this.fInflight.size === 0) {
      return;
    }

    const drained = await this.within(
      this.drain().then(() => true),
      timeout,
    );

    if (drained) {
      return;
    }

    this.gLogger?.warn(`Vercube/SchedulerManager::Aborting ${this.fRuns.size} run(s) still going after ${timeout}ms`);

    for (const controller of this.fRuns) {
      controller.abort(new SchedulerError('The scheduler is shutting down', 'shutdown'));
    }

    await this.drain();
  }

  /**
   * Checks that the given jobs can run: cluster jobs need an explicit name, a
   * store, and in production a distributed one. Failing here is the point, a cluster job
   * silently running on every replica is worse than a crash at boot.
   *
   * @param {Registration[]} registrations - Jobs to check
   * @returns {void}
   * @throws {SchedulerError} When a cluster job cannot be coordinated
   */
  protected assertRunnable(registrations: Registration[]): void {
    const localQueued = registrations
      .filter((job) => job.target && this.optionsOf(job).scope === 'instance')
      .map((job) => job.name);

    if (localQueued.length > 0) {
      throw new SchedulerError(
        `Jobs ${localQueued.map((name) => `"${name}"`).join(', ')} target a queue with scope: 'instance', ` +
          'so every replica would enqueue every occurrence. A queue target needs cluster scope.',
        'start',
        undefined,
        { jobs: localQueued },
        false,
      );
    }

    const clusterJobs = registrations.filter((registration) => this.optionsOf(registration).scope === 'cluster');
    const cluster = clusterJobs.map((job) => job.name);
    const unnamed = clusterJobs.filter((job) => job.generatedName).map((job) => job.name);

    if (cluster.length === 0) {
      return;
    }

    if (unnamed.length > 0) {
      throw new SchedulerError(
        `Cluster jobs ${unnamed.map((name) => `"${name}"`).join(', ')} need an explicit name. ` +
          'The name is part of every lock key, and a name derived from the class can change between builds ' +
          "(bundlers rename colliding classes, Jobs becomes Jobs$1), so replicas of two builds would run the same occurrence. Add { name: 'billing.close-day' } to the decorator, or set scope: 'instance'.",
        'start',
        undefined,
        { jobs: unnamed },
        false,
      );
    }

    if (!this.fStore) {
      throw this.missingStoreError(cluster, 'start');
    }

    if (this.fStore.store.capabilities.distributed || this.fOptions.allowLocalCluster) {
      return;
    }

    const message =
      `Cluster jobs ${cluster.map((name) => `"${name}"`).join(', ')} use the "${this.fStore.store.name}" store, ` +
      'which only coordinates a single process, so every replica would run them.';

    if (isProduction()) {
      throw new SchedulerError(
        `${message} Mount a distributed store such as RedisStore or PostgresStore, set scope: 'instance', ` +
          'or set allowLocalCluster: true if this really runs as a single process.',
        'start',
        undefined,
        { jobs: cluster },
        false,
      );
    }

    if (!this.fWarnedLocal) {
      this.fWarnedLocal = true;
      this.warn(`${message} Fine for development, refused in production.`);
    }
  }

  /**
   * Enqueues an occurrence a queue target claimed. The work itself runs on
   * whichever worker consumes the queue, see {@link SchedulerManager.consume}.
   *
   * The occurrence was claimed first anyway: only some transports deduplicate
   * on the job id, BullMQ does, RabbitMQ and Kafka do not.
   *
   * @param {Registration} registration - Job to enqueue
   * @param {SchedulerStore<unknown>} store - Store to record the state in
   * @param {object} base - Name, occurrence and schedule of the run
   * @param {SchedulerTypes.TriggerSource} source - What fired it
   * @returns {Promise<SchedulerTypes.RunResult>} `enqueued`, or `failed` when the queue refused the job
   */
  protected async enqueue(
    registration: Registration,
    store: SchedulerStore<unknown>,
    base: Omit<SchedulerTypes.RunResult, 'outcome'>,
    source: SchedulerTypes.TriggerSource,
  ): Promise<SchedulerTypes.RunResult> {
    const target = registration.target!;
    const startedAt = this.fClock.now();
    const scheduledAt = base.scheduledAt.getTime();

    try {
      await this.connectQueue();

      await this.fQueue!.add({
        queue: target.queue,
        strategy: target.strategy,
        job: registration.name,
        payload: { name: registration.name, scheduledAt: base.scheduledAt.toISOString(), occurrenceId: base.occurrenceId },
        // BullMQ refuses ids containing a colon, which every ISO instant has
        options: { jobId: base.occurrenceId.replaceAll(':', '_') },
      });
    } catch (error) {
      const failure = toSchedulerError(error, `Failed to enqueue "${base.occurrenceId}"`, 'enqueue', { job: registration.name });

      this.gLogger?.error(`Vercube/SchedulerManager::Failed to enqueue "${base.occurrenceId}"`, error);
      await this.saveState(store, registration.name, {
        lastScheduledAt: scheduledAt,
        lastStartedAt: startedAt,
        lastFinishedAt: this.fClock.now(),
        lastOutcome: 'failed',
        lastInstance: this.instanceId,
        lastError: failure.message.slice(0, MAX_ERROR_LENGTH),
      });

      return this.record({ ...base, outcome: 'failed', error: this.describeError(failure) }, source);
    }

    await this.saveState(store, registration.name, {
      lastScheduledAt: scheduledAt,
      lastStartedAt: startedAt,
      lastFinishedAt: this.fClock.now(),
      lastOutcome: 'enqueued',
      lastInstance: this.instanceId,
    });

    return this.record({ ...base, outcome: 'enqueued', durationMs: this.fClock.now() - startedAt }, source);
  }

  /**
   * Runs an occurrence a worker took off the queue. Overlap is enforced here,
   * across every worker, with the same lock an inline run takes. A failed or
   * aborted run is rethrown, so the queue applies its own retries and backoff.
   *
   * @param {Registration} registration - Job to run
   * @param {SchedulerTypes.QueuePayload} payload - What the scheduler enqueued
   * @param {number} attempt - Attempt number the queue counts
   * @returns {Promise<void>} Resolves once the run completed or was skipped
   * @throws {SchedulerError} When the run failed or was aborted
   */
  protected async consume(registration: Registration, payload: SchedulerTypes.QueuePayload, attempt: number): Promise<void> {
    const options = this.optionsOf(registration);
    const base = {
      name: registration.name,
      occurrenceId: payload.occurrenceId,
      scheduledAt: new Date(payload.scheduledAt),
      attempts: 0,
      durationMs: 0,
    };
    const store = await this.readyStore('consume');
    let lock: Lock | null = null;

    if (options.overlap === 'skip') {
      lock = { store, key: `active:${registration.name}`, owner: `${this.instanceId}:${randomHex(4)}` };

      if (!(await store.claim(lock.key, lock.owner, options.lockTtl))) {
        this.record({ ...base, outcome: 'skipped-overlap' }, 'queue');

        return;
      }
    }

    // the queue retries with backoff, in-place retries would multiply its attempts
    const result = await this.execute(registration, { ...options, retries: 0 }, base, 'queue', lock, store, attempt);

    if (result.outcome === 'failed' || result.outcome === 'aborted') {
      throw new SchedulerError(
        result.error?.message ?? `Job "${registration.name}" ${result.outcome}`,
        result.error?.operation ?? 'run',
        undefined,
        {
          job: registration.name,
          occurrenceId: payload.occurrenceId,
        },
      );
    }
  }

  /**
   * Resolves the `QueueManager` of `@vercube/queue`. The package is an optional
   * peer, so it is imported only here, and only a job targeting a queue makes
   * its absence an error.
   *
   * @returns {Promise<void>} Resolves once the queue is known, or known to be absent
   * @throws {SchedulerError} When a job targets a queue and no queue manager is bound
   */
  protected async connectQueue(): Promise<void> {
    if (!this.fQueue) {
      let manager: QueueManagerLike | null = null;

      try {
        const { QueueManager } = await import('@vercube/queue');

        manager = this.gContainer.getOptional(QueueManager) as QueueManagerLike | null;
      } catch {
        // not installed, which is fine until a job targets a queue
      }

      this.fQueue = manager;
    }

    const targeted = [...this.fJobs.values()].filter((registration) => registration.target);

    if (!this.fQueue && targeted.length > 0) {
      throw this.missingQueueError(targeted.map((registration) => registration.name));
    }

    for (const registration of targeted) {
      this.registerConsumer(registration);
    }
  }

  /**
   * Registers the queue consumer that runs a queue target's occurrences, once
   * the queue manager is known.
   *
   * @param {Registration} registration - Job to register a consumer for
   * @returns {void}
   */
  protected registerConsumer(registration: Registration): void {
    if (!registration.target || !this.fQueue || registration.consumer) {
      return;
    }

    registration.consumer = {
      strategy: registration.target.strategy,
      queue: registration.target.queue,
      job: registration.name,
      handler: (payload, context) => this.track(this.consume(registration, payload, context.attempt)),
      options: {
        ...(registration.target.attempts === undefined ? {} : { attempts: registration.target.attempts }),
        ...(registration.target.backoff === undefined ? {} : { backoff: registration.target.backoff }),
      },
      source: registration.source,
    };

    this.fQueue.registerConsumer(registration.consumer);
  }

  /**
   * Removes the queue consumer of a job, if it has one.
   *
   * @param {Registration} registration - Job whose consumer is removed
   * @returns {void}
   */
  protected unregisterConsumer(registration: Registration): void {
    if (registration.consumer) {
      this.fQueue?.unregisterConsumer(registration.consumer);
      registration.consumer = undefined;
    }
  }

  /**
   * Builds the error of queue targets without a queue manager.
   *
   * @param {string[]} jobs - Names of the jobs targeting a queue
   * @returns {SchedulerError} The error to throw
   */
  protected missingQueueError(jobs: string[]): SchedulerError {
    return new SchedulerError(
      `Jobs ${jobs.map((name) => `"${name}"`).join(', ')} target a queue, but no QueueManager is bound. ` +
        "Install @vercube/queue and add QueuePlugin, or remove the job's target.",
      'start',
      undefined,
      { jobs },
      false,
    );
  }

  /**
   * Reads the target of a job.
   *
   * @param {SchedulerTypes.Target | undefined} target - Target as the user wrote it
   * @param {string} name - Name of the job, reported in the error
   * @returns {ParsedTarget | null} The queue to enqueue on, null to run inline
   * @throws {SchedulerError} When the target is neither `inline` nor a queue
   */
  protected parseTarget(target: SchedulerTypes.Target | undefined, name: string): ParsedTarget | null {
    if (target === undefined || target === 'inline') {
      return null;
    }

    if (typeof target === 'object' && target !== null && typeof target.queue === 'string' && target.queue !== '') {
      return { ...target, strategy: target.strategy ?? 'default' };
    }

    throw new SchedulerError(
      `Invalid target ${JSON.stringify(target)} for "${name}", expected 'inline' or { queue: 'name' }`,
      'register',
      undefined,
      { job: name },
      false,
    );
  }

  /**
   * Builds the error of cluster jobs without a store.
   *
   * @param {string[]} jobs - Names of the cluster jobs
   * @param {string} operation - Operation that needed the store
   * @returns {SchedulerError} The error to throw
   */
  protected missingStoreError(jobs: string[], operation: string): SchedulerError {
    return new SchedulerError(
      `Cluster jobs ${jobs.map((name) => `"${name}"`).join(', ')} need a store to decide which replica runs them. ` +
        "Mount one (RedisStore, PostgresStore, or MemoryStore for a single process), or set scope: 'instance' to run them on every replica.",
      operation,
      undefined,
      { jobs },
      false,
    );
  }

  /**
   * Builds the context a handler receives.
   *
   * @param {Registration} registration - Job being run
   * @param {object} base - Name, occurrence and schedule of the run
   * @param {number} startedAt - When the run started
   * @param {SchedulerTypes.TriggerSource} source - What fired it
   * @param {number} attempt - Attempt number
   * @param {AbortSignal} signal - Signal of the run
   * @returns {SchedulerTypes.JobContext} The context
   */
  protected createContext(
    registration: Registration,
    base: Omit<SchedulerTypes.RunResult, 'outcome'>,
    startedAt: number,
    source: SchedulerTypes.TriggerSource,
    attempt: number,
    signal: AbortSignal,
  ): SchedulerTypes.JobContext {
    const logger = this.gLogger;

    return {
      name: registration.name,
      occurrenceId: base.occurrenceId,
      scheduledAt: new Date(base.scheduledAt),
      startedAt: new Date(startedAt),
      trigger: source,
      attempt,
      signal,
      instanceId: this.instanceId,
      logger:
        typeof logger?.child === 'function'
          ? logger.child({ job: registration.name, occurrenceId: base.occurrenceId, attempt })
          : logger,
    };
  }

  /**
   * Records an event: into the buffer, the last-run index and every listener.
   *
   * @param {Omit<SchedulerTypes.RunEvent, 'trigger' | 'instanceId' | 'at'>} result - What happened
   * @param {SchedulerTypes.TriggerSource} source - What fired the occurrence
   * @returns {T} The result, for chaining
   */
  protected record<T extends Omit<SchedulerTypes.RunEvent, 'trigger' | 'instanceId' | 'at'>>(
    result: T,
    source: SchedulerTypes.TriggerSource,
  ): T {
    const event: SchedulerTypes.RunEvent = { ...result, trigger: source, instanceId: this.instanceId, at: this.fClock.now() };

    this.fLastRuns.set(event.name, event);

    for (const listener of this.fListeners) {
      try {
        listener(event);
      } catch (error) {
        this.gLogger?.error('Vercube/SchedulerManager::Run listener threw', error);
      }
    }

    if (this.fOptions.maxEvents > 0) {
      this.fEvents.unshift(event);

      if (this.fEvents.length > this.fOptions.maxEvents) {
        this.fEvents.length = this.fOptions.maxEvents;
      }
    }

    return result;
  }

  /**
   * Describes an error for results and events.
   *
   * @param {Error} error - The error
   * @returns {{ name: string; message: string; operation?: string }} Its name, message and scheduler operation
   */
  protected describeError(error: Error): { name: string; message: string; operation?: string } {
    return {
      name: error.name || 'Error',
      message: error.message,
      ...(error instanceof SchedulerError ? { operation: error.operation } : {}),
    };
  }

  /**
   * Describes a job for `list()` and the devtools.
   *
   * @param {Registration} registration - Job to describe
   * @returns {SchedulerTypes.JobDescription} The description
   */
  protected describe(registration: Registration): SchedulerTypes.JobDescription {
    const options = this.optionsOf(registration);
    const schedule = this.scheduleOf(registration);
    const lastRun = this.fLastRuns.get(registration.name);
    const next =
      registration.paused || registration.external
        ? null
        : schedule.next(Math.max(this.fClock.now(), registration.lastFired ?? Number.NEGATIVE_INFINITY));

    return {
      name: registration.name,
      source: registration.source,
      kind: schedule.kind,
      schedule: schedule.description,
      ...(schedule.timezone ? { timezone: schedule.timezone } : {}),
      scope: options.scope,
      overlap: options.overlap,
      misfire: options.misfire,
      target: registration.target ? { ...registration.target } : 'inline',
      external: registration.external,
      paused: registration.paused,
      running: registration.running,
      nextRun: next === null ? null : new Date(next),
      ...(lastRun ? { lastRun: { ...lastRun } } : {}),
    };
  }

  /**
   * Effective options of a job: its own, then the configured defaults, then the built-in ones.
   *
   * @param {Registration} registration - Job to read
   * @returns {ResolvedOptions} The options
   */
  protected optionsOf(registration: Registration): ResolvedOptions {
    return { ...DEFAULT_OPTIONS, ...this.fDefaults, ...registration.own };
  }

  /**
   * Schedule of a job, rebuilt when the time zone it depends on changed.
   *
   * @param {Registration} registration - Job to read
   * @returns {Schedule} The schedule
   * @throws {SchedulerError} When the schedule is invalid
   */
  protected scheduleOf(registration: Registration): Schedule {
    const { definition } = registration;

    if ('cron' in definition) {
      const timezone = definition.timezone ?? this.optionsOf(registration).timezone;

      if (registration.schedule?.timezone !== timezone) {
        registration.schedule = cronSchedule(definition.cron, timezone, registration.name);
      }
    } else {
      registration.schedule ??= everySchedule(
        parseDuration(definition.every, `${registration.name}.every`),
        parseDuration(definition.offset ?? 0, `${registration.name}.offset`),
        registration.name,
      );
    }

    return registration.schedule;
  }

  /**
   * Reads and validates job options.
   *
   * @param {SchedulerTypes.Defaults} options - Options as the user wrote them
   * @param {string} owner - Job or `defaults`, reported in errors
   * @returns {Partial<ResolvedOptions>} The options that were set, parsed
   * @throws {SchedulerError} When an option is invalid
   */
  protected parseOptions(options: Omit<SchedulerTypes.Defaults, 'timezone'>, owner: string): Partial<ResolvedOptions> {
    const parsed: Partial<ResolvedOptions> = {};
    const choose = <T extends string>(key: 'scope' | 'overlap' | 'misfire', allowed: T[]): void => {
      const value = options[key];

      if (value === undefined) {
        return;
      }

      if (!allowed.includes(value as T)) {
        throw new SchedulerError(
          `Invalid ${key} ${JSON.stringify(value)} for "${owner}", expected one of ${allowed.join(', ')}`,
          'configure',
          undefined,
          { option: key },
          false,
        );
      }

      (parsed as Record<string, unknown>)[key] = value;
    };

    choose('scope', ['instance', 'cluster']);
    choose('overlap', ['skip', 'allow']);
    choose('misfire', ['skip', 'run-once']);

    for (const key of ['misfireGrace', 'timeout', 'lockTtl', 'jitter'] as const) {
      if (options[key] !== undefined) {
        parsed[key] = parseDuration(options[key], `${owner}.${key}`);
      }
    }

    if (parsed.lockTtl !== undefined && parsed.lockTtl < MIN_LOCK_TTL) {
      throw new SchedulerError(
        `lockTtl of "${owner}" is ${parsed.lockTtl}ms, the shortest one allowed is ${MIN_LOCK_TTL}ms`,
        'configure',
        undefined,
        { option: 'lockTtl' },
        false,
      );
    }

    if (options.retries !== undefined) {
      if (!Number.isInteger(options.retries) || options.retries < 0) {
        throw new SchedulerError(`retries of "${owner}" must be a whole number of 0 or more`, 'configure', undefined, {}, false);
      }

      parsed.retries = options.retries;
    }

    return parsed;
  }

  /**
   * Looks a job up by name.
   *
   * @param {string} name - Name of the job
   * @param {string} operation - Operation asking, reported in the error
   * @returns {Registration} The job
   * @throws {SchedulerError} When no job has that name
   */
  protected require(name: string, operation: string): Registration {
    const registration = this.fJobs.get(name);

    if (!registration) {
      throw new SchedulerError(
        `No job is registered as "${name}"`,
        operation,
        undefined,
        { registered: [...this.fJobs.keys()] },
        false,
      );
    }

    return registration;
  }

  /**
   * Id of an occurrence.
   *
   * @param {string} name - Name of the job
   * @param {number} scheduledAt - The occurrence
   * @returns {string} `${name}@${ISO instant}`
   */
  protected occurrenceId(name: string, scheduledAt: number): string {
    return `${name}@${new Date(scheduledAt).toISOString()}`;
  }

  /**
   * Returns the mounted store, connected.
   *
   * @param {string} operation - Operation asking, reported in the error
   * @returns {Promise<SchedulerStore<unknown>>} The ready store
   * @throws {SchedulerError} When no store is mounted, or it cannot connect
   */
  protected async readyStore(operation: string): Promise<SchedulerStore<unknown>> {
    if (!this.fStore) {
      throw new SchedulerError('No scheduler store is mounted', operation, undefined, undefined, false);
    }

    await this.ensureReady(this.fStore);

    return this.fStore.store;
  }

  /**
   * Initializes the store once, reusing the same promise for every later call.
   *
   * @param {SchedulerTypes.MountedStore} mounted - Store to initialize
   * @returns {Promise<void>} Resolves once the store is ready
   * @throws {SchedulerError} When the store cannot be initialized
   */
  protected ensureReady(mounted: SchedulerTypes.MountedStore<any>): Promise<void> {
    // an async wrapper turns a store throwing synchronously into a rejection
    mounted.ready ??= (async () => {
      mounted.store.useClock(this.fClock);
      await mounted.store.initialize(mounted.initOptions);
    })().then(
      () => {
        mounted.error = undefined;
      },
      (error: Error) => {
        mounted.ready = undefined;
        mounted.error = error;
        this.gLogger?.error(`Vercube/SchedulerManager::Failed to initialize store "${mounted.store.name}"`, error);

        throw toSchedulerError(error, `Failed to initialize store "${mounted.store.name}"`, 'initialize');
      },
    );

    return mounted.ready;
  }

  /**
   * Writes the state of a job, logging rather than failing: the state only
   * feeds the startup catch-up and the devtools.
   *
   * @param {SchedulerStore<unknown> | undefined} store - Store to write to, absent for instance jobs
   * @param {string} name - Name of the job
   * @param {SchedulerTypes.JobState} state - State to write
   * @returns {Promise<void>} Resolves once written or given up on
   */
  protected async saveState(
    store: SchedulerStore<unknown> | undefined,
    name: string,
    state: SchedulerTypes.JobState,
  ): Promise<void> {
    if (!store) {
      return;
    }

    try {
      await store.setState(name, state);
    } catch (error) {
      this.gLogger?.warn(`Vercube/SchedulerManager::Failed to save the state of "${name}"`, error);
    }
  }

  /**
   * Keeps a piece of background work in the in-flight set until it settles.
   *
   * @param {Promise<T>} work - The work
   * @returns {Promise<T>} The same work
   */
  protected track<T>(work: Promise<T>): Promise<T> {
    const tracked = work.catch((error) => {
      this.gLogger?.error('Vercube/SchedulerManager::Run failed unexpectedly', error);
    });

    this.fInflight.add(tracked);
    void tracked.finally(() => this.fInflight.delete(tracked));

    return work;
  }

  /**
   * Waits on the manager's clock.
   *
   * @param {number} ms - How long to wait
   * @returns {Promise<void>} Resolves once the time has passed
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.fClock.setTimeout(resolve, ms);
    });
  }

  /**
   * Waits for a promise, at most for a while on the manager's clock.
   *
   * @param {Promise<T>} promise - Promise to wait for
   * @param {number} ms - Longest wait
   * @returns {Promise<T | undefined>} The value, or undefined when the time ran out first
   */
  protected async within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    let timer: unknown;

    try {
      return await Promise.race([
        promise,
        new Promise<undefined>((resolve) => {
          timer = this.fClock.setTimeout(() => resolve(undefined), ms);
        }),
      ]);
    } finally {
      this.fClock.clearTimeout(timer);
    }
  }

  /**
   * Installs the process signal listeners `handleSignals` asks for: Node and Bun
   * through `process.once()`, Deno through `Deno.addSignalListener()`.
   *
   * The process is never exited from here, other listeners such as the HTTP
   * server may still need time.
   *
   * @returns {void}
   */
  protected installSignals(): void {
    const option = this.fOptions.handleSignals;

    if (!option || this.fSignalCleanup) {
      return;
    }

    const signals = option === true ? DEFAULT_SIGNALS : option;
    const handler = (): void => {
      void this.stop().catch((error) => this.gLogger?.error('Vercube/SchedulerManager::Failed to stop', error));
    };

    const runtime = globalThis as {
      process?: { once?: (signal: string, fn: () => void) => void; off?: (signal: string, fn: () => void) => void };
      Deno?: {
        addSignalListener?: (signal: string, fn: () => void) => void;
        removeSignalListener?: (signal: string, fn: () => void) => void;
      };
    };

    const deno = runtime.Deno;

    if (typeof deno?.addSignalListener === 'function') {
      for (const signal of signals) {
        deno.addSignalListener(signal, handler);
      }

      this.fSignalCleanup = () => {
        for (const signal of signals) {
          deno.removeSignalListener?.(signal, handler);
        }
      };

      return;
    }

    const process = runtime.process;

    if (typeof process?.once === 'function') {
      for (const signal of signals) {
        process.once(signal, handler);
      }

      this.fSignalCleanup = () => {
        for (const signal of signals) {
          process.off?.(signal, handler);
        }
      };
    }
  }

  /**
   * Reports a misconfiguration that does not stop the scheduler.
   *
   * @param {string} message - What is wrong
   * @returns {void}
   */
  protected warn(message: string): void {
    const text = `Vercube/SchedulerManager::${message}`;

    if (this.gLogger) {
      this.gLogger.warn(text);

      return;
    }

    console.warn(text);
  }

  /**
   * Starts the scheduler once the container is initialized, so every job
   * registered by a decorator is known before the first timer is armed.
   *
   * @returns {void}
   */
  @Init()
  protected init(): void {
    // decorators register their jobs while the container is being flushed,
    // a microtask lands right after that
    queueMicrotask(() => {
      // read here rather than above: the plugin configures the manager after
      // the container built it, so `autoStart: false` is not known yet there
      if (!this.fOptions.autoStart) {
        return;
      }

      void this.start().catch((error) => {
        this.gLogger?.error('Vercube/SchedulerManager::Failed to start', error);

        // a cluster job without a usable store must stop the boot, not just log
        if (error instanceof SchedulerError && error.operation === 'start') {
          throw error;
        }
      });
    });
  }

  /**
   * Stops and closes the store when the container is torn down.
   *
   * @returns {void}
   */
  @Destroy()
  protected destroy(): void {
    void this.close().catch((error) => this.gLogger?.error('Vercube/SchedulerManager::Failed to close', error));
  }
}
