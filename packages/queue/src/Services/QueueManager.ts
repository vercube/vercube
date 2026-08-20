import { ValidationProvider } from '@vercube/core';
import { Container, Destroy, Init, Inject, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { QueueError } from '../Errors/QueueError';
import { toQueueError } from '../Utils/Errors';
import {
  ATTEMPT_HEADER,
  ATTEMPTS_HEADER,
  delay,
  JOB_HEADER,
  readNumericHeader,
  resolveBackoff,
  WILDCARD_JOB,
} from '../Utils/Job';
import { previewPayload, redactHeaders } from '../Utils/Redact';
import type { QueueTypes } from '../Types/QueueTypes';
import type { QueueStrategy } from './QueueStrategy';

/** Name a strategy is mounted under when none is given. */
const DEFAULT_STRATEGY = 'default';

/** Manager-wide settings before anything is configured. */
const DEFAULTS: Required<QueueTypes.Defaults> = {
  autoStart: true,
  concurrency: 1,
  onUnhandled: 'ignore',
  maxEvents: 50,
  capturePayloads: false,
  maxPayloadBytes: 4096,
};

/**
 * Central entry point of the queue module.
 *
 * The manager owns the mounted strategies, the handlers registered by the
 * decorators and everything that has to behave the same across transports:
 * routing a job to its handler, validating payloads, retries, timeouts,
 * lifecycle hooks and the counters the devtools read.
 *
 * @example
 * ```ts
 * container.bind(QueueManager);
 *
 * const queue = container.get(QueueManager);
 * await queue.mount({ strategy: MemoryStrategy });
 *
 * await queue.add({ queue: 'emails', job: 'welcome', payload: { userId: '1' } });
 * ```
 */
export class QueueManager {
  /** Container instance */
  @Inject(Container)
  protected gContainer!: Container;

  /** Logger instance */
  @InjectOptional(Logger)
  protected gLogger!: Logger | null;

  /** Validation provider, needed only by handlers declaring a schema */
  @InjectOptional(ValidationProvider)
  protected gValidation!: ValidationProvider | null;

  /** Mounted strategies, indexed by mount name */
  protected fStrategies: Map<string, QueueTypes.MountedStrategy<any>> = new Map();

  /** Registered handlers, indexed by strategy, queue and job name */
  protected fRegistrations: Map<string, QueueTypes.Registration> = new Map();

  /** Registered lifecycle hooks */
  protected fHooks: { completed: QueueTypes.HookRegistration[]; failed: QueueTypes.HookRegistration[] } = {
    completed: [],
    failed: [],
  };

  /** Running consumers, indexed by strategy and queue */
  protected fConsumers: Map<string, QueueTypes.ConsumerHandle> = new Map();

  /** Per-queue counters, indexed by strategy and queue */
  protected fMetrics: Map<string, QueueTypes.QueueMetrics> = new Map();

  /** Recently processed jobs, newest first */
  protected fEvents: QueueTypes.JobEvent[] = [];

  /** Manager-wide settings */
  protected fDefaults: Required<QueueTypes.Defaults> = { ...DEFAULTS };

  /** Whether consumers should be running */
  protected fStarted: boolean = false;

  /** Serializes start, stop and mount work so consumers are never started twice */
  protected fTail: Promise<void> = Promise.resolve();

  /** Retries waiting for their backoff to elapse */
  protected fPendingRetries: Set<Promise<void>> = new Set();

  /** Listeners following the jobs this manager processes */
  protected fListeners: Set<QueueTypes.JobListener> = new Set();

  /**
   * Whether consumers have been started.
   *
   * @returns {boolean} True once {@link QueueManager.start} ran
   */
  public get started(): boolean {
    return this.fStarted;
  }

  /**
   * Currently configured settings.
   *
   * @returns {Required<QueueTypes.Defaults>} A copy of the active settings
   */
  public get defaults(): Required<QueueTypes.Defaults> {
    return { ...this.fDefaults };
  }

  /**
   * Sets manager-wide settings. Calling it repeatedly merges into the existing
   * ones, and settings passed per job or per handler always win.
   *
   * @param {QueueTypes.Defaults} defaults - Settings to apply
   * @returns {void}
   */
  public configure(defaults: QueueTypes.Defaults): void {
    for (const [key, value] of Object.entries(defaults)) {
      if (value !== undefined) {
        (this.fDefaults as Record<string, unknown>)[key] = value;
      }
    }
  }

  /**
   * Mounts a strategy under a name. Every other call refers to it by that name,
   * so a single application can talk to several brokers at once.
   *
   * The strategy is resolved through the container, connects on first use, and
   * starts consuming right away when the manager is already running.
   *
   * @template T - Strategy being mounted
   * @param {QueueTypes.Mount<T>} params - Mount name, strategy class and its init options
   * @returns {Promise<void>} Resolves once the strategy is mounted
   */
  public async mount<T extends QueueStrategy<unknown>>({ name, strategy, initOptions }: QueueTypes.Mount<T>): Promise<void> {
    const mountName = name ?? DEFAULT_STRATEGY;

    this.fStrategies.set(mountName, {
      name: mountName,
      strategy: this.gContainer.resolve(strategy) as QueueStrategy<unknown>,
      initOptions,
    });

    if (this.fStarted) {
      await this.enqueue(() => this.startMount(mountName));
    }
  }

  /**
   * Stops and closes a mounted strategy, and forgets it.
   * Handlers registered for it stay registered, so mounting it again resumes them.
   *
   * @param {string} [name] - Mount name, defaults to `default`
   * @returns {Promise<void>} Resolves once the strategy is closed
   */
  public async unmount(name: string = DEFAULT_STRATEGY): Promise<void> {
    const mount = this.fStrategies.get(name);

    if (!mount) {
      return;
    }

    this.fStrategies.delete(name);

    await this.enqueue(async () => {
      await this.stopConsumers(name);
      await this.closeStrategy(mount);
    });
  }

  /**
   * Returns a mounted strategy, for the rare case a transport-specific API is needed.
   *
   * @param {string} [name] - Mount name, defaults to `default`
   * @returns {QueueStrategy<unknown> | undefined} The strategy, or undefined when nothing is mounted under that name
   */
  public getStrategy(name: string = DEFAULT_STRATEGY): QueueStrategy<unknown> | undefined {
    return this.fStrategies.get(name)?.strategy;
  }

  /**
   * Adds a single job to a queue.
   *
   * @template TQueue - Queue the job is added to
   * @template TJob - Name of the job
   * @param {QueueTypes.AddRequest<TQueue, TJob>} request - Queue, job name, payload and per-job options
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job
   * @throws {QueueError} When no strategy is mounted under the requested name, or the job cannot be published
   */
  public async add<TQueue extends QueueTypes.QueueName, TJob extends QueueTypes.JobName<TQueue>>(
    request: QueueTypes.AddRequest<TQueue, TJob>,
  ): Promise<QueueTypes.JobRef> {
    const mount = await this.resolveMount(request.strategy, 'add');
    const queue = request.queue as string;
    const job = request.job as string;

    try {
      const ref = await mount.strategy.publish(this.createPublishRequest(queue, job, request.payload, request.options));

      this.metricsFor(mount.name, queue).published++;

      return ref;
    } catch (error) {
      throw toQueueError(error, 'Failed to publish job', 'add', { strategy: mount.name, queue, job });
    }
  }

  /**
   * Adds many jobs of the same kind to a queue, using the transport's batch API
   * when it has one.
   *
   * @template TQueue - Queue the jobs are added to
   * @template TJob - Name of the jobs
   * @param {QueueTypes.AddManyRequest<TQueue, TJob>} request - Queue, job name, payloads and per-job options
   * @returns {Promise<QueueTypes.JobRef[]>} References to the published jobs, in the same order
   * @throws {QueueError} When no strategy is mounted under the requested name, or the jobs cannot be published
   */
  public async addMany<TQueue extends QueueTypes.QueueName, TJob extends QueueTypes.JobName<TQueue>>(
    request: QueueTypes.AddManyRequest<TQueue, TJob>,
  ): Promise<QueueTypes.JobRef[]> {
    if (request.payloads.length === 0) {
      return [];
    }

    const mount = await this.resolveMount(request.strategy, 'addMany');
    const queue = request.queue as string;
    const job = request.job as string;

    try {
      const refs = await mount.strategy.publishMany(
        request.payloads.map((payload) => this.createPublishRequest(queue, job, payload, request.options)),
      );

      this.metricsFor(mount.name, queue).published += refs.length;

      return refs;
    } catch (error) {
      throw toQueueError(error, 'Failed to publish jobs', 'addMany', { strategy: mount.name, queue, job });
    }
  }

  /**
   * Registers a handler for a single job, or for every job the queue has no
   * other handler for when registered under `*`. The decorators call this, and so
   * can application code building its consumers dynamically.
   *
   * When the manager is already running, the queue starts being consumed right away.
   *
   * @param {QueueTypes.Registration} registration - Queue, job name, handler and its options
   * @returns {void}
   * @throws {QueueError} When a handler for the same job is already registered
   */
  public registerConsumer(registration: QueueTypes.Registration): void {
    const key = this.consumerKey(registration.strategy, registration.queue, registration.job);
    const existing = this.fRegistrations.get(key);

    if (existing) {
      throw new QueueError(
        `Job "${registration.job}" of queue "${registration.queue}" already has a handler`,
        'register',
        undefined,
        { registered: existing.source, duplicate: registration.source },
        false,
      );
    }

    this.fRegistrations.set(key, registration);
    this.metricsFor(registration.strategy, registration.queue);

    if (this.fStarted) {
      void this.enqueue(() => this.startQueue(registration.strategy, registration.queue));
    }
  }

  /**
   * Registers a lifecycle hook for a queue.
   *
   * @param {'completed' | 'failed'} event - Event to listen for
   * @param {QueueTypes.HookRegistration} registration - Queue, optional job filter and the hook itself
   * @returns {void}
   */
  public registerHook(event: 'completed' | 'failed', registration: QueueTypes.HookRegistration): void {
    this.fHooks[event].push(registration);
  }

  /**
   * Removes a registered handler. The queue stops being consumed once its last
   * handler is gone.
   *
   * @param {Pick<QueueTypes.Registration, 'strategy' | 'queue' | 'job'>} registration - Handler to remove
   * @returns {void}
   */
  public unregisterConsumer(registration: Pick<QueueTypes.Registration, 'strategy' | 'queue' | 'job'>): void {
    const removed = this.fRegistrations.delete(this.consumerKey(registration.strategy, registration.queue, registration.job));

    if (!removed) {
      return;
    }

    const remaining = [...this.fRegistrations.values()].some(
      (entry) => entry.strategy === registration.strategy && entry.queue === registration.queue,
    );

    if (!remaining) {
      void this.enqueue(() => this.stopQueue(registration.strategy, registration.queue));
    }
  }

  /**
   * Removes a registered lifecycle hook.
   *
   * @param {'completed' | 'failed'} event - Event the hook listens for
   * @param {QueueTypes.HookRegistration} registration - The very registration that was registered
   * @returns {void}
   */
  public unregisterHook(event: 'completed' | 'failed', registration: QueueTypes.HookRegistration): void {
    this.fHooks[event] = this.fHooks[event].filter((entry) => entry !== registration);
  }

  /**
   * Connects every mounted strategy and starts consuming every queue that has
   * a handler. Safe to call more than once, queues already running are left alone.
   *
   * @returns {Promise<void>} Resolves once every consumer is running
   */
  public async start(): Promise<void> {
    this.fStarted = true;

    return this.enqueue(async () => {
      const mounted = [...this.fStrategies.keys()];

      for (const name of mounted) {
        await this.startMount(name);
      }
    });
  }

  /**
   * Stops every consumer while keeping the connections open, so the application
   * can still publish. In-flight jobs are awaited.
   *
   * @returns {Promise<void>} Resolves once every consumer is stopped
   */
  public async stop(): Promise<void> {
    this.fStarted = false;

    return this.enqueue(async () => {
      const mounted = [...this.fStrategies.keys()];

      for (const name of mounted) {
        await this.stopConsumers(name);
      }
    });
  }

  /**
   * Stops every consumer and closes every connection.
   *
   * @returns {Promise<void>} Resolves once everything is closed
   */
  public async close(): Promise<void> {
    this.fStarted = false;

    return this.enqueue(async () => {
      for (const [name, mount] of this.fStrategies) {
        await this.stopConsumers(name);
        await this.closeStrategy(mount);
      }
    });
  }

  /**
   * Waits for the work the manager scheduled in the background: starting or
   * stopping consumers, and retries waiting for their backoff to elapse.
   *
   * @returns {Promise<void>} Resolves once nothing is pending
   */
  public async drain(): Promise<void> {
    await this.fTail;

    while (this.fPendingRetries.size > 0) {
      await Promise.all(this.fPendingRetries);
    }
  }

  /**
   * Reads live counters of a queue straight from the transport.
   *
   * @param {object} params - Queue to read and the strategy to read it from
   * @param {string} params.queue - Queue to read
   * @param {string} [params.strategy] - Mount name, defaults to `default`
   * @returns {Promise<QueueTypes.QueueStats>} The counters the transport reports, empty when it reports none
   */
  public async stats({ queue, strategy }: { queue: string; strategy?: string }): Promise<QueueTypes.QueueStats> {
    const mount = this.fStrategies.get(strategy ?? DEFAULT_STRATEGY);

    if (!mount?.strategy.stats) {
      return {};
    }

    try {
      return await mount.strategy.stats(queue);
    } catch (error) {
      this.gLogger?.warn('Vercube/QueueManager::stats', error);

      return {};
    }
  }

  /**
   * Follows every job this manager finishes, as it finishes it.
   *
   * The listener is called with the same event that goes into the inspection
   * buffer, right after the job settled, so a listener sees a queue live instead
   * of polling it. A listener that throws is reported and kept.
   *
   * @param {QueueTypes.JobListener} listener - Called once per processed job
   * @returns {() => void} Removes the listener again
   */
  public subscribe(listener: QueueTypes.JobListener): () => void {
    this.fListeners.add(listener);

    return () => {
      this.fListeners.delete(listener);
    };
  }

  /**
   * Describes what the module currently holds: mounted strategies, registered
   * handlers, per-queue counters and the last processed jobs. Used by the devtools.
   *
   * @returns {QueueTypes.Snapshot} The current state of the queue module
   */
  public inspect(): QueueTypes.Snapshot {
    const strategies: QueueTypes.StrategyInfo[] = [...this.fStrategies.values()].map((mount) => ({
      name: mount.name,
      transport: mount.strategy.transport,
      driver: mount.strategy.constructor?.name ?? 'unknown',
      status: this.statusOf(mount),
      capabilities: mount.strategy.capabilities,
      error: mount.error?.message,
    }));

    const consumers: QueueTypes.ConsumerInfo[] = [...this.fRegistrations.values()].map((registration) => ({
      strategy: registration.strategy,
      queue: registration.queue,
      job: registration.job,
      source: registration.source,
      attempts: registration.options.attempts ?? 1,
      timeout: registration.options.timeout,
      validated: Boolean(registration.options.schema),
      running: this.fConsumers.has(this.queueKey(registration.strategy, registration.queue)),
    }));

    return {
      started: this.fStarted,
      strategies,
      consumers,
      metrics: [...this.fMetrics.values()].map((metrics) => ({ ...metrics })),
      events: this.fEvents.map((event) => ({ ...event })),
    };
  }

  /**
   * Processes a single job: routes it to its handler, validates the payload,
   * enforces the timeout, runs the lifecycle hooks and applies the retry policy.
   *
   * The handler registered for the job name wins, and a handler registered under
   * `*` picks up whatever is left.
   *
   * Rejecting tells the strategy the job failed for good, so it can dead-letter it.
   *
   * @param {string} strategy - Mount name the job came from
   * @param {string} queue - Queue the job came from
   * @param {QueueTypes.IncomingJob} incoming - The job as received from the transport
   * @returns {Promise<void>} Resolves when the job may be acknowledged
   * @throws {Error} When the job failed and the transport has to deal with it
   */
  protected async process(strategy: string, queue: string, incoming: QueueTypes.IncomingJob): Promise<void> {
    const metrics = this.metricsFor(strategy, queue);
    const registration =
      this.fRegistrations.get(this.consumerKey(strategy, queue, incoming.job)) ??
      this.fRegistrations.get(this.consumerKey(strategy, queue, WILDCARD_JOB));

    if (!registration) {
      metrics.unhandled++;
      this.record(
        {
          strategy,
          queue,
          job: incoming.job,
          id: incoming.id,
          attempt: incoming.attempt,
          status: 'unhandled',
          duration: 0,
          error: {
            name: 'QueueError',
            message: `No handler is registered for job "${incoming.job}"`,
            operation: 'process',
            retryable: false,
          },
        },
        incoming.payload,
        incoming.headers,
      );
      this.gLogger?.warn(`Vercube/QueueManager::No handler for job "${incoming.job}" on queue "${queue}"`);

      if (this.fDefaults.onUnhandled === 'fail') {
        throw new QueueError(`No handler registered for job "${incoming.job}"`, 'process', undefined, { strategy, queue }, false);
      }

      return;
    }

    const attempts =
      incoming.attempts ?? readNumericHeader(incoming.headers[ATTEMPTS_HEADER], registration.options.attempts ?? 1);
    const context = this.createContext(strategy, queue, incoming, attempts);
    const started = performance.now();

    metrics.active++;

    try {
      context.payload = await this.validate(registration, incoming.payload, context.job);

      await this.runHandler(registration, context);

      metrics.processed++;
      this.record({
        strategy,
        queue,
        job: context.job,
        id: context.id,
        attempt: context.attempt,
        status: 'completed',
        duration: performance.now() - started,
        source: registration.source,
      });

      await this.runHooks('completed', registration, context);
    } catch (error) {
      await this.handleFailure(error as Error, registration, context, performance.now() - started);
    } finally {
      metrics.active--;
    }
  }

  /**
   * Applies the failure policy of a job: hooks first, then either a retry the
   * manager schedules itself, or a rejection handing the job back to the transport.
   *
   * @param {Error} error - Error the attempt failed with
   * @param {QueueTypes.Registration} registration - Handler that failed
   * @param {QueueTypes.JobContext} context - Context of the failed attempt
   * @param {number} duration - How long the attempt took, in milliseconds
   * @returns {Promise<void>} Resolves once a retry has been scheduled
   * @throws {Error} The original error, when the transport has to deal with the failure
   */
  protected async handleFailure(
    error: Error,
    registration: QueueTypes.Registration,
    context: QueueTypes.JobContext,
    duration: number,
  ): Promise<void> {
    const metrics = this.metricsFor(registration.strategy, registration.queue);

    metrics.failed++;
    metrics.lastError = error.message;

    await this.runHooks('failed', registration, context, error);

    const mount = this.fStrategies.get(registration.strategy);
    const retryable = !(error instanceof QueueError) || error.retryable;
    const canRetry = retryable && context.attempt < context.attempts;

    // transports retrying on their own only need to learn that the attempt failed
    if (mount?.strategy.capabilities.retries || !canRetry) {
      this.record(
        {
          strategy: registration.strategy,
          queue: registration.queue,
          job: context.job,
          id: context.id,
          attempt: context.attempt,
          status: 'failed',
          duration,
          error: this.describeFailure(error),
          source: registration.source,
        },
        context.payload,
        context.headers,
      );

      throw error;
    }

    metrics.retried++;
    this.record(
      {
        strategy: registration.strategy,
        queue: registration.queue,
        job: context.job,
        id: context.id,
        attempt: context.attempt,
        status: 'retried',
        duration,
        error: this.describeFailure(error),
        source: registration.source,
      },
      context.payload,
      context.headers,
    );

    this.scheduleRetry(registration, context, error);
  }

  /**
   * Publishes the job again for its next attempt, waiting for the backoff first.
   *
   * The wait is handed to the transport when it can delay jobs, and kept on a
   * timer otherwise, so the handler slot is released immediately either way.
   *
   * @param {QueueTypes.Registration} registration - Handler that failed
   * @param {QueueTypes.JobContext} context - Context of the failed attempt
   * @param {Error} error - Error the attempt failed with, reported when the retry cannot be published
   * @returns {void}
   */
  protected scheduleRetry(registration: QueueTypes.Registration, context: QueueTypes.JobContext, error: Error): void {
    const mount = this.fStrategies.get(registration.strategy);
    const wait = resolveBackoff(registration.options.backoff, context.attempt);
    const native = mount?.strategy.capabilities.delay ?? false;

    const headers = {
      ...context.headers,
      [ATTEMPT_HEADER]: String(context.attempt + 1),
      [ATTEMPTS_HEADER]: String(context.attempts),
    };

    const republish = async (): Promise<void> => {
      try {
        await mount?.strategy.publish({
          queue: registration.queue,
          job: context.job,
          payload: context.payload,
          headers,
          options: native ? { delay: wait } : {},
        });
      } catch (publishError) {
        this.gLogger?.error('Vercube/QueueManager::Failed to schedule retry', publishError, error);
      }
    };

    const pending = (native || wait === 0 ? Promise.resolve() : delay(wait)).then(republish);

    this.fPendingRetries.add(pending);
    void pending.finally(() => this.fPendingRetries.delete(pending));
  }

  /**
   * Runs a handler, failing the attempt when it outlives its timeout.
   * A timed out handler is not interrupted, it is only stopped being waited for.
   *
   * @param {QueueTypes.Registration} registration - Handler to run
   * @param {QueueTypes.JobContext} context - Context of the attempt
   * @returns {Promise<void>} Resolves once the handler returned
   * @throws {QueueError} When the handler outlives its timeout
   */
  protected async runHandler(registration: QueueTypes.Registration, context: QueueTypes.JobContext): Promise<void> {
    const run = Promise.resolve(registration.handler(context.payload, context));
    const timeout = registration.options.timeout;

    if (!timeout || timeout <= 0) {
      return run;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        run,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new QueueError(`Job "${registration.job}" timed out after ${timeout}ms`, 'timeout', undefined, {
                queue: registration.queue,
                id: context.id,
              }),
            );
          }, timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validates a payload against the handler's schema, when it declares one.
   *
   * @param {QueueTypes.Registration} registration - Handler the payload is meant for
   * @param {unknown} payload - Payload as received from the transport
   * @param {string} job - Name of the job being processed, which a wildcard handler does not know upfront
   * @returns {Promise<unknown>} The validated payload, as returned by the schema
   * @throws {QueueError} When the payload does not match the schema, or no validation provider is bound
   */
  protected async validate(registration: QueueTypes.Registration, payload: unknown, job: string): Promise<unknown> {
    const schema = registration.options.schema;

    if (!schema) {
      return payload;
    }

    if (!this.gValidation) {
      throw new QueueError(
        'A job declares a schema but no ValidationProvider is bound in the container',
        'validate',
        undefined,
        { queue: registration.queue, job },
        false,
      );
    }

    const result = await this.gValidation.validate(schema, payload);

    if (result.issues) {
      throw new QueueError(
        `Payload of job "${job}" failed validation`,
        'validate',
        undefined,
        { queue: registration.queue, issues: result.issues },
        false,
      );
    }

    return result.value;
  }

  /**
   * Runs the hooks registered for a queue. A hook filtered by job name runs for
   * that job only, unless the filter is `*`. A throwing hook is logged and never
   * changes the outcome of the job.
   *
   * @param {'completed' | 'failed'} event - Event being reported
   * @param {QueueTypes.Registration} registration - Handler the event belongs to
   * @param {QueueTypes.JobContext} context - Context of the attempt
   * @param {Error} [error] - Error of the attempt, for the `failed` event
   * @returns {Promise<void>} Resolves once every hook settled
   */
  protected async runHooks(
    event: 'completed' | 'failed',
    registration: QueueTypes.Registration,
    context: QueueTypes.JobContext,
    error?: Error,
  ): Promise<void> {
    for (const hook of this.fHooks[event]) {
      if (hook.strategy !== registration.strategy || hook.queue !== registration.queue) {
        continue;
      }

      if (hook.job && hook.job !== WILDCARD_JOB && hook.job !== context.job) {
        continue;
      }

      try {
        await (event === 'failed'
          ? (hook.hook as QueueTypes.FailedHook)(error!, context)
          : (hook.hook as QueueTypes.CompletedHook)(context));
      } catch (hookError) {
        this.gLogger?.error(`Vercube/QueueManager::Hook ${hook.source} threw`, hookError);
      }
    }
  }

  /**
   * Connects a mounted strategy and starts consuming every queue it has handlers for.
   * Failures are logged and leave the other mounts untouched.
   *
   * @param {string} name - Mount name
   * @returns {Promise<void>} Resolves once the mount is running
   */
  protected async startMount(name: string): Promise<void> {
    const mount = this.fStrategies.get(name);

    if (!mount) {
      return;
    }

    try {
      await this.ensureReady(mount);
    } catch {
      // ensureReady already stored and logged the failure
      return;
    }

    const queues = new Set(
      [...this.fRegistrations.values()].filter((entry) => entry.strategy === name).map((entry) => entry.queue),
    );

    for (const queue of queues) {
      await this.startQueue(name, queue);
    }
  }

  /**
   * Starts consuming a single queue, unless it is already being consumed.
   *
   * @param {string} strategy - Mount name
   * @param {string} queue - Queue to consume
   * @returns {Promise<void>} Resolves once the consumer is running
   */
  protected async startQueue(strategy: string, queue: string): Promise<void> {
    const key = this.queueKey(strategy, queue);
    const mount = this.fStrategies.get(strategy);

    if (!mount || this.fConsumers.has(key) || !this.fStarted) {
      return;
    }

    const registrations = [...this.fRegistrations.values()].filter(
      (entry) => entry.strategy === strategy && entry.queue === queue,
    );

    if (registrations.length === 0) {
      return;
    }

    try {
      await this.ensureReady(mount);

      const handle = await mount.strategy.consume({
        queue,
        concurrency: Math.max(this.fDefaults.concurrency, ...registrations.map((entry) => entry.concurrency ?? 0)),
        dispatch: (job) => this.process(strategy, queue, job),
      });

      this.fConsumers.set(key, handle);
    } catch (error) {
      this.gLogger?.error(`Vercube/QueueManager::Failed to consume queue "${queue}"`, error);
    }
  }

  /**
   * Stops every consumer of a mount.
   *
   * @param {string} strategy - Mount name
   * @returns {Promise<void>} Resolves once every consumer is stopped
   */
  protected async stopConsumers(strategy: string): Promise<void> {
    const running = [...this.fConsumers];

    for (const [key, handle] of running) {
      if (key === this.queueKey(strategy, handle.queue)) {
        await this.stopQueue(strategy, handle.queue);
      }
    }
  }

  /**
   * Stops the consumer of a single queue, waiting for its in-flight jobs.
   *
   * @param {string} strategy - Mount name
   * @param {string} queue - Queue whose consumer is stopped
   * @returns {Promise<void>} Resolves once the consumer is stopped
   */
  protected async stopQueue(strategy: string, queue: string): Promise<void> {
    const key = this.queueKey(strategy, queue);
    const handle = this.fConsumers.get(key);

    if (!handle) {
      return;
    }

    try {
      await handle.stop();
    } catch (error) {
      this.gLogger?.error(`Vercube/QueueManager::Failed to stop consumer of "${queue}"`, error);
    }

    this.fConsumers.delete(key);
  }

  /**
   * Closes a strategy, keeping a failure from breaking a shutdown sequence.
   *
   * @param {QueueTypes.MountedStrategy} mount - Mount to close
   * @returns {Promise<void>} Resolves once the strategy is closed
   */
  protected async closeStrategy(mount: QueueTypes.MountedStrategy<any>): Promise<void> {
    if (!mount.ready) {
      return;
    }

    try {
      await mount.strategy.close();
    } catch (error) {
      this.gLogger?.error(`Vercube/QueueManager::Failed to close strategy "${mount.name}"`, error);
    }

    mount.ready = undefined;
  }

  /**
   * Initializes a strategy once, reusing the same promise for every later call.
   *
   * @param {QueueTypes.MountedStrategy} mount - Mount to initialize
   * @returns {Promise<void>} Resolves once the strategy is ready
   * @throws {QueueError} When the strategy cannot be initialized
   */
  protected async ensureReady(mount: QueueTypes.MountedStrategy<any>): Promise<void> {
    // an async wrapper turns a strategy throwing synchronously into a rejection
    mount.ready ??= (async () => mount.strategy.initialize(mount.initOptions))().then(
      () => {
        mount.error = undefined;
      },
      (error: Error) => {
        mount.ready = undefined;
        mount.error = error;
        this.gLogger?.error(`Vercube/QueueManager::Failed to initialize strategy "${mount.name}"`, error);

        throw toQueueError(error, `Failed to initialize strategy "${mount.name}"`, 'initialize', { strategy: mount.name });
      },
    );

    return mount.ready;
  }

  /**
   * Resolves a mount by name and makes sure it is connected.
   *
   * @param {string} [name] - Mount name, defaults to `default`
   * @param {string} operation - Operation asking for the mount, reported in the error
   * @returns {Promise<QueueTypes.MountedStrategy>} The ready mount
   * @throws {QueueError} When nothing is mounted under that name, or it cannot connect
   */
  protected async resolveMount(name: string | undefined, operation: string): Promise<QueueTypes.MountedStrategy<any>> {
    const mountName = name ?? DEFAULT_STRATEGY;
    const mount = this.fStrategies.get(mountName);

    if (!mount) {
      throw new QueueError(`No queue strategy is mounted as "${mountName}"`, operation, undefined, {
        mounted: [...this.fStrategies.keys()],
      });
    }

    await this.ensureReady(mount);

    return mount;
  }

  /**
   * Builds the transport-facing shape of a job, adding the headers the module
   * needs to route and retry it.
   *
   * @param {string} queue - Queue the job goes to
   * @param {string} job - Name of the job
   * @param {unknown} payload - Payload of the job
   * @param {QueueTypes.JobOptions} [options] - Per-job options
   * @returns {QueueTypes.PublishRequest} The job as a strategy expects it
   */
  protected createPublishRequest(
    queue: string,
    job: string,
    payload: unknown,
    options: QueueTypes.JobOptions = {},
  ): QueueTypes.PublishRequest {
    const headers: Record<string, string> = {
      ...options.headers,
      [JOB_HEADER]: job,
      [ATTEMPT_HEADER]: '1',
    };

    if (options.attempts && options.attempts > 1) {
      headers[ATTEMPTS_HEADER] = String(options.attempts);
    }

    return { queue, job, payload, headers, options };
  }

  /**
   * Builds the context a handler and its hooks receive.
   *
   * @param {string} strategy - Mount name the job came from
   * @param {string} queue - Queue the job came from
   * @param {QueueTypes.IncomingJob} incoming - The job as received from the transport
   * @param {number} attempts - Total attempts this job may take
   * @returns {QueueTypes.JobContext} The context of this attempt
   */
  protected createContext(
    strategy: string,
    queue: string,
    incoming: QueueTypes.IncomingJob,
    attempts: number,
  ): QueueTypes.JobContext {
    const logger = this.gLogger;

    return {
      id: incoming.id,
      job: incoming.job,
      queue,
      strategy,
      attempt: incoming.attempt,
      attempts,
      payload: incoming.payload,
      headers: incoming.headers,
      raw: incoming.raw,
      logger:
        typeof logger?.child === 'function'
          ? logger.child({ queue, job: incoming.job, jobId: incoming.id, attempt: incoming.attempt })
          : logger,
      updateProgress: async (progress) => {
        await incoming.updateProgress?.(progress);
      },
    };
  }

  /**
   * Returns the counters of a queue, creating them on first use.
   *
   * @param {string} strategy - Mount name
   * @param {string} queue - Queue name
   * @returns {QueueTypes.QueueMetrics} The mutable counters of that queue
   */
  protected metricsFor(strategy: string, queue: string): QueueTypes.QueueMetrics {
    const key = this.queueKey(strategy, queue);
    let metrics = this.fMetrics.get(key);

    if (!metrics) {
      metrics = { strategy, queue, published: 0, processed: 0, failed: 0, retried: 0, unhandled: 0, active: 0 };
      this.fMetrics.set(key, metrics);
    }

    return metrics;
  }

  /**
   * Appends a processed job to the inspection buffer, dropping the oldest entry
   * once the buffer is full.
   *
   * The payload and headers of a failure are kept only while `capturePayloads`
   * is on, and never for a job that completed: that is where the volume is, and
   * a job that worked has nothing to diagnose.
   *
   * @param {Omit<QueueTypes.JobEvent, 'at'>} event - The processed job
   * @param {unknown} [payload] - Payload of the attempt, kept when capturing is on
   * @param {Record<string, string>} [headers] - Headers of the attempt, kept when capturing is on
   * @returns {void}
   */
  protected record(event: Omit<QueueTypes.JobEvent, 'at'>, payload?: unknown, headers?: Record<string, string>): void {
    const captured =
      this.fDefaults.capturePayloads && event.status !== 'completed'
        ? {
            payload: previewPayload(payload, this.fDefaults.maxPayloadBytes),
            headers: headers ? redactHeaders(headers) : undefined,
          }
        : {};

    const recorded: QueueTypes.JobEvent = { ...event, ...captured, at: Date.now() };

    // listeners are told even when no buffer is kept, so a live view keeps working
    for (const listener of this.fListeners) {
      try {
        listener(recorded);
      } catch (error) {
        this.gLogger?.error('Vercube/QueueManager::Job listener threw', error);
      }
    }

    if (this.fDefaults.maxEvents <= 0) {
      return;
    }

    this.fEvents.unshift(recorded);

    if (this.fEvents.length > this.fDefaults.maxEvents) {
      this.fEvents.length = this.fDefaults.maxEvents;
    }
  }

  /**
   * Describes an error for the inspection buffer: its name, message and a capped
   * stack, plus what this module knows about it when it raised the error itself.
   *
   * @param {Error} error - Error the attempt failed with
   * @returns {QueueTypes.JobFailure} The failure, ready to be inspected
   */
  protected describeFailure(error: Error): QueueTypes.JobFailure {
    const failure: QueueTypes.JobFailure = {
      name: error.name || 'Error',
      message: error.message,
      stack: error.stack?.slice(0, this.fDefaults.maxPayloadBytes),
    };

    if (error instanceof QueueError) {
      failure.operation = error.operation;
      failure.retryable = error.retryable;
    }

    return failure;
  }

  /**
   * Reports the state of a mount for the devtools.
   *
   * @param {QueueTypes.MountedStrategy} mount - Mount to describe
   * @returns {QueueTypes.StrategyStatus} What the mount is currently doing
   */
  protected statusOf(mount: QueueTypes.MountedStrategy<any>): QueueTypes.StrategyStatus {
    if (mount.error) {
      return 'error';
    }

    return mount.ready ? 'ready' : 'idle';
  }

  /**
   * Runs a piece of lifecycle work after everything scheduled before it, so
   * consumers are never started or stopped concurrently.
   *
   * @param {() => Promise<void>} task - Work to run
   * @returns {Promise<void>} Resolves once this task ran
   */
  protected enqueue(task: () => Promise<void>): Promise<void> {
    const tail = this.fTail.then(task, task);

    this.fTail = tail.catch(() => undefined);

    return tail;
  }

  /**
   * Key a handler is registered under.
   *
   * @param {string} strategy - Mount name
   * @param {string} queue - Queue name
   * @param {string} job - Job name
   * @returns {string} The registration key
   */
  protected consumerKey(strategy: string, queue: string, job: string): string {
    return `${strategy}::${queue}::${job}`;
  }

  /**
   * Key a queue is tracked under.
   *
   * @param {string} strategy - Mount name
   * @param {string} queue - Queue name
   * @returns {string} The queue key
   */
  protected queueKey(strategy: string, queue: string): string {
    return `${strategy}::${queue}`;
  }

  /**
   * Starts the consumers once the container is initialized, so every handler
   * registered by a decorator is known before the first job is received.
   *
   * @returns {void}
   */
  @Init()
  protected init(): void {
    if (!this.fDefaults.autoStart) {
      return;
    }

    // decorators register their handlers while the container is being flushed,
    // a microtask lands right after that
    queueMicrotask(() => {
      void this.start().catch((error) => this.gLogger?.error('Vercube/QueueManager::Failed to start', error));
    });
  }

  /**
   * Closes every connection when the container is torn down.
   *
   * @returns {void}
   */
  @Destroy()
  protected destroy(): void {
    void this.close().catch((error) => this.gLogger?.error('Vercube/QueueManager::Failed to close', error));
  }
}
