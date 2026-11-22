import { defineErrorCatalog } from '@vercube/di';
import { SchedulerError } from './SchedulerError';

/** What a call site hands to an error that reports a refused call. */
interface Refused {
  /** The scheduler operation that failed, kept on the error as `operation`. */
  operation: string;
  /** Non-sensitive context, kept on the error as `metadata`. */
  metadata?: Record<string, unknown>;
}

/** What a call site hands to an error that wraps one thrown by a store or a queue. */
interface Wrapped {
  /** The value that was thrown, kept on the error as `cause`. */
  cause: unknown;
  /** Non-sensitive context, kept on the error as `metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds an error that running the job again would not get past.
 *
 * @param {string} message - Message of the error
 * @param {Refused} params - Operation and context
 * @returns {SchedulerError} The error
 */
function refused(message: string, params: Refused): SchedulerError {
  return new SchedulerError(message, params.operation, undefined, params.metadata, false);
}

/**
 * Builds an error around what a store or a queue threw. It stays retryable:
 * the backend may answer the next time.
 *
 * @param {string} operation - The scheduler operation that failed
 * @returns {Function} The `create` of a catalog entry
 */
function wrapped(operation: string): (message: string, params: Wrapped) => SchedulerError {
  return (message, params) => new SchedulerError(message, operation, params.cause as Error, params.metadata);
}

/**
 * The errors of the scheduler module.
 */
export const SchedulerErrors = defineErrorCatalog('VERCUBE_SCHEDULER', {
  JOB_NAME_MISSING: {
    message: (_: Refused) => 'A job needs a name',
    why: '`SchedulerManager.add()` was given a job whose `name` is missing, empty or not a string. The name identifies the job in locks, state and logs.',
    fix: 'Pass a non-empty `name` to `SchedulerManager.add()`. A `@Cron()` or `@Every()` method gets its name from the class and the method unless the `name` option says otherwise.',
    create: refused,
  },
  JOB_DUPLICATE: {
    message: ({ name }: Refused & { name: string }) => `Job "${name}" is already registered`,
    why: 'Two jobs were registered under the same name. The `metadata` of the error names both sources. A name is the identity of a job, so it must be unique.',
    fix: 'Give one of them another `name` in the options of `@Cron()` or `@Every()`. Check that the class holding the job is not bound twice.',
    create: refused,
  },
  JOB_HANDLER_MISSING: {
    message: ({ name }: Refused & { name: string }) => `Job "${name}" needs a handler function`,
    why: '`SchedulerManager.add()` was given a job whose `handler` is not a function, so there is nothing to run.',
    fix: 'Pass a function as `handler` to `SchedulerManager.add()`.',
    create: refused,
  },
  JOB_UNKNOWN: {
    message: ({ name }: Refused & { name: string }) => `No job is registered as "${name}"`,
    why: 'A job was asked for by a name that nothing is registered under. The `metadata.registered` field of the error lists the names that exist.',
    fix: 'Use a name from `SchedulerManager.list()`. A job declared with `@Cron()` or `@Every()` exists once its class is bound in the container.',
    create: refused,
  },
  JOB_TIMEOUT: {
    message: ({ name, timeout }: { name: string; timeout: number }) => `Job "${name}" timed out after ${timeout}ms`,
    why: 'The handler ran longer than the `timeout` of the job. The `signal` of its context was aborted with this error, and the run is recorded as failed.',
    fix: 'Raise `timeout` in the options of `@Cron()` or `@Every()`, or make the handler stop when `context.signal` aborts.',
    create: (message, params: { name: string }) => new SchedulerError(message, 'timeout', undefined, { job: params.name }),
  },
  JOB_FAILED_WITHOUT_REASON: {
    message: 'Job failed',
    why: 'The handler of a job rejected with `undefined` or `null`, so there is no original error to report.',
    fix: 'Throw an `Error` in the handler, so the reason shows up in the run record and in the log.',
  },
  LOCK_LOST: {
    message: ({ name }: Wrapped & { name: string }) => `Job "${name}" lost its lock`,
    why: 'The lock of a running cluster job could not be extended: the store did not answer twice in a row, or another replica holds the lock now. The run is aborted so two replicas do not run the same occurrence.',
    fix: 'Check that the scheduler store is reachable from this replica. Raise `lockTtl` in the job options when the handler blocks the event loop for longer than a third of it.',
    create: (message, params: Wrapped & { name: string }) =>
      new SchedulerError(message, 'lock-lost', params.cause as Error, { job: params.name }),
  },
  SHUTTING_DOWN: {
    message: 'The scheduler is shutting down',
    why: 'The scheduler was stopped, and this run was still going after the `shutdownTimeout`. The `signal` of its context was aborted with this error.',
    fix: 'Make the handler stop when `context.signal` aborts, or raise `shutdownTimeout` in the `SchedulerPlugin` options.',
    create: (message) => new SchedulerError(message, 'shutdown'),
  },
  CLOSED: {
    message: 'The scheduler is closed',
    why: '`SchedulerManager.ping()` was called after `SchedulerManager.close()`, which runs when the application closes.',
    fix: 'Call `ping()` only while the application is running. In a test, create a new application with `createTestApp()` instead of reusing a closed one.',
    create: (message) => new SchedulerError(message, 'ping', undefined, undefined, false),
  },
  STORE_MISSING: {
    message: (_: Refused) => 'No scheduler store is mounted',
    why: 'An operation needed the scheduler store, to claim an occurrence or to answer a health check, and none is mounted.',
    fix: 'Mount one in the `SchedulerPlugin` options: `store: { store: MemoryStore }` for a single process, `RedisStore` or `PostgresStore` for several replicas.',
    create: refused,
  },
  STORE_INIT_FAILED: {
    message: ({ store }: Wrapped & { store: string }) => `Failed to initialize store "${store}"`,
    why: 'The `initialize()` method of the mounted store threw something that is not a `SchedulerError`, usually because its backend cannot be reached. The original error is the `cause`.',
    fix: 'Read the `cause`, then correct the `initOptions` of the `store` in the `SchedulerPlugin` options, or make the backend reachable.',
    create: wrapped('initialize'),
  },
  QUEUED_RUN_FAILED: {
    message: ({ message }: Refused & { message: string }) => `${message}`,
    why: 'An occurrence that was handed to a queue ran in a worker and ended as failed or aborted. The message is the one of the failed run. It is thrown again so the queue counts the attempt as failed and applies its own retries.',
    fix: 'Read the message and the log of the run, and correct the handler of the job named in `metadata.job`. The retries of the queue are the `attempts` and `backoff` of the `target` of the job.',
    create: (message, params: Refused) => new SchedulerError(message, params.operation, undefined, params.metadata),
  },
  CLAIM_FAILED: {
    message: ({ occurrenceId }: Wrapped & { occurrenceId: string }) => `Failed to claim "${occurrenceId}"`,
    why: 'The store threw while this replica was claiming an occurrence. Without a claim nobody can tell whether another replica runs it, so it does not run here and is recorded as failed.',
    fix: 'Read the `cause`, and check that the scheduler store is reachable. Run the occurrence by hand with `SchedulerManager.trigger()` when it was missed.',
    create: wrapped('claim'),
  },
  ENQUEUE_FAILED: {
    message: ({ occurrenceId }: Wrapped & { occurrenceId: string }) => `Failed to enqueue "${occurrenceId}"`,
    why: 'The job has a queue `target`, and publishing the occurrence to that queue failed. The original error is the `cause`.',
    fix: 'Read the `cause`. Check that the `queue` and `strategy` of the `target` name a strategy mounted in `QueuePlugin`, and that its broker is reachable.',
    create: wrapped('enqueue'),
  },
  CLUSTER_STORE_MISSING: {
    message: ({ jobs }: Refused & { jobs: string }) =>
      `Cluster jobs ${jobs} need a store to decide which replica runs them. ` +
      "Mount one (RedisStore, PostgresStore, or MemoryStore for a single process), or set scope: 'instance' to run them on every replica.",
    why: "A job with `scope: 'cluster'` runs on one replica per occurrence, and the replicas agree on which one through the scheduler store. No store is mounted.",
    fix: "Mount one in the `SchedulerPlugin` options, for example `store: { store: RedisStore, initOptions: { url } }`. Or set `scope: 'instance'` on the job.",
    create: refused,
  },
  CLUSTER_STORE_LOCAL: {
    message: ({ jobs, store }: Refused & { jobs: string; store: string }) =>
      `Cluster jobs ${jobs} use the "${store}" store, ` +
      'which only coordinates a single process, so every replica would run them.' +
      " Mount a distributed store such as RedisStore or PostgresStore, set scope: 'instance', " +
      'or set allowLocalCluster: true if this really runs as a single process.',
    why: "In production, jobs with `scope: 'cluster'` are refused on a store that lives in one process, because each replica would have its own locks and run every occurrence.",
    fix: 'Mount `RedisStore` or `PostgresStore` as the `store` in the `SchedulerPlugin` options. Set `allowLocalCluster: true` there when the application runs as one process.',
    create: refused,
  },
  CLUSTER_JOB_UNNAMED: {
    message: ({ jobs }: Refused & { jobs: string }) =>
      `Cluster jobs ${jobs} need an explicit name. ` +
      'The name is part of every lock key, and a name derived from the class can change between builds ' +
      "(bundlers rename colliding classes, Jobs becomes Jobs$1), so replicas of two builds would run the same occurrence. Add { name: 'billing.close-day' } to the decorator, or set scope: 'instance'.",
    why: "A job with `scope: 'cluster'` has a name generated from its class and method. Replicas lock on the name, and a generated one is not stable across builds.",
    fix: "Add a `name` to the options of `@Cron()` or `@Every()`, for example `{ name: 'billing.close-day' }`. Or set `scope: 'instance'` on the job.",
    create: refused,
  },
  QUEUE_TARGET_INSTANCE_SCOPE: {
    message: ({ jobs }: Refused & { jobs: string }) =>
      `Jobs ${jobs} target a queue with scope: 'instance', ` +
      'so every replica would enqueue every occurrence. A queue target needs cluster scope.',
    why: "A job with a queue `target` also has `scope: 'instance'`. Every replica would publish the same occurrence to the queue.",
    fix: "Set `scope: 'cluster'` on the job, or remove its `target` to run it inline on every replica.",
    create: refused,
  },
  QUEUE_MANAGER_MISSING: {
    message: ({ jobs }: Refused & { jobs: string }) =>
      `Jobs ${jobs} target a queue, but no QueueManager is bound. ` +
      "Install @vercube/queue and add QueuePlugin, or remove the job's target.",
    why: 'A job has a queue `target`, and the container has no `QueueManager`: `@vercube/queue` is not installed, or `QueuePlugin` is not registered.',
    fix: 'Run `pnpm add @vercube/queue` and register the plugin with `app.addPlugin(QueuePlugin, { strategies })`. Or remove `target` from the job options.',
    create: refused,
  },
  TARGET_INVALID: {
    message: ({ target, name }: Refused & { target: string; name: string }) =>
      `Invalid target ${target} for "${name}", expected 'inline' or { queue: 'name' }`,
    why: 'The `target` of a job says where an occurrence runs. It is neither `inline` nor an object with a non-empty `queue`.',
    fix: "Set `target: 'inline'` or `target: { queue: 'reports' }` in the options of `@Cron()` or `@Every()`, or leave `target` out.",
    create: refused,
  },
  OPTION_INVALID: {
    message: ({ option, value, owner, allowed }: Refused & { option: string; value: string; owner: string; allowed: string }) =>
      `Invalid ${option} ${value} for "${owner}", expected one of ${allowed}`,
    why: 'The `scope`, `overlap` or `misfire` option of a job, or of the scheduler defaults, has a value the scheduler does not know.',
    fix: 'Use one of the values the message lists. `scope` takes `instance` or `cluster`, `overlap` takes `skip` or `allow`, `misfire` takes `skip` or `run-once`.',
    create: refused,
  },
  DURATION_INVALID: {
    message: ({ value, option }: Refused & { value: string; option: string }) =>
      `Invalid duration ${value} for "${option}", use milliseconds or a string such as '30s', '5m', '1h' or '1d'`,
    why: 'An option that takes a duration got a value that is neither a number of milliseconds nor a number followed by a unit.',
    fix: 'Pass milliseconds as a number, or a string such as `30s`, `5m`, `1h` or `1d`, to the option the message names.',
    create: refused,
  },
  LOCK_TTL_TOO_SHORT: {
    message: ({ owner, lockTtl, shortest }: Refused & { owner: string; lockTtl: number; shortest: number }) =>
      `lockTtl of "${owner}" is ${lockTtl}ms, the shortest one allowed is ${shortest}ms`,
    why: 'The lock of a running job is extended three times within `lockTtl`. Below the minimum, a slow store round trip would let the lock expire while the job still runs.',
    fix: 'Raise `lockTtl` in the job options, or in `defaults` of the `SchedulerPlugin` options, to at least the value the message names.',
    create: refused,
  },
  RETRIES_INVALID: {
    message: ({ owner }: Refused & { owner: string }) => `retries of "${owner}" must be a whole number of 0 or more`,
    why: 'The `retries` option counts the extra attempts of a failed run. It is negative, fractional or not a number.',
    fix: 'Set `retries` to an integer such as `0` or `3` in the job options, or in `defaults` of the `SchedulerPlugin` options.',
    create: refused,
  },
  TIMEZONE_UNKNOWN: {
    message: ({ timezone, job }: Refused & { timezone: string; job?: string }) =>
      `Unknown time zone "${timezone}"${job ? ` for job "${job}"` : ''}, use an IANA name such as 'Europe/Warsaw' or 'UTC'`,
    why: 'The `timezone` of a job, or of the scheduler, is a name the runtime does not know. `Intl.DateTimeFormat` rejected it.',
    fix: 'Use an IANA name such as `Europe/Warsaw` or `UTC` for `timezone`, in the options of `@Cron()` or in `defaults` of the `SchedulerPlugin` options.',
    create: refused,
  },
  CRON_INVALID: {
    message: ({ expression, job, reason }: Wrapped & { expression: string; job: string; reason: string }) =>
      `Invalid cron expression "${expression}" for job "${job}": ${reason}`,
    why: 'The expression given to `@Cron()` could not be parsed. The end of the message is what the parser said.',
    fix: "Pass five fields (minute, hour, day of month, month, day of week) or six with seconds first, for example `@Cron('0 3 * * *')`.",
    create: (message, params: Wrapped) => new SchedulerError(message, 'register', params.cause as Error, params.metadata, false),
  },
  INTERVAL_TOO_SHORT: {
    message: ({ job, interval, shortest }: Refused & { job: string; interval: number; shortest: number }) =>
      `Interval of job "${job}" is ${interval}ms, the shortest one allowed is ${shortest}ms`,
    why: 'The interval given to `@Every()` is shorter than the scheduler can keep. Occurrences are identified by their instant, to the second.',
    fix: "Pass an interval of at least the value the message names to `@Every()`, for example `@Every('1s')`.",
    create: refused,
  },
  HTTP_SECRET_MISSING: {
    message: 'The scheduler HTTP trigger needs a secret, such as http: { secret: process.env.CRON_SECRET }',
    why: 'The `http` option of `SchedulerPlugin` mounts an endpoint that runs jobs on request. It is refused without a secret, as anyone who can reach the application could trigger jobs.',
    fix: 'Set `http: { secret: process.env.CRON_SECRET }` in the `SchedulerPlugin` options and define that environment variable, or remove `http`.',
    create: (message) => new SchedulerError(message, 'use', undefined, undefined, false),
  },
  REDIS_STORE_NOT_INITIALIZED: {
    message: 'RedisStore is not initialized',
    why: 'A method of `RedisStore` was called before its `initialize()`, or after `close()`. That happens when the store is created by hand and not mounted.',
    fix: 'Mount it in the `SchedulerPlugin` options: `store: { store: RedisStore, initOptions: { url } }`. The scheduler initializes the store before it uses it.',
    create: (message) => new SchedulerError(message, 'store', undefined, undefined, false),
  },
  POSTGRES_STORE_NOT_INITIALIZED: {
    message: 'PostgresStore is not initialized',
    why: 'A method of `PostgresStore` was called before its `initialize()`, or after `close()`. That happens when the store is created by hand and not mounted.',
    fix: 'Mount it in the `SchedulerPlugin` options: `store: { store: PostgresStore, initOptions: { connectionString } }`. The scheduler initializes the store before it uses it.',
    create: (message) => new SchedulerError(message, 'store', undefined, undefined, false),
  },
  POSTGRES_STORE_PING_NOT_INITIALIZED: {
    message: 'The Postgres store is not initialized',
    why: '`PostgresStore.ping()` was called before `initialize()`, or after `close()`, so there is no pool to query.',
    fix: 'Mount it in the `SchedulerPlugin` options: `store: { store: PostgresStore, initOptions: { connectionString } }`, and ping it through `SchedulerManager.ping()`.',
  },
  CLI_ENTRY_MISSING: {
    message: ({ entry }: { entry: string }) =>
      `No built application at ${entry}. Run "vercube build" first, pass --build, or point --entry at the built entry.`,
    why: 'The scheduler commands load the built application to find its jobs, and the entry file does not exist.',
    fix: 'Run `vercube build` first, or pass `--build` to the command. Pass `--entry` when the build writes its entry somewhere else.',
    create: (message, params: { entry: string }) => new SchedulerError(message, 'cli', undefined, { entry: params.entry }, false),
  },
  CLI_SCHEDULER_MISSING: {
    message: ({ entry }: { entry: string }) => `The application at ${entry} has no scheduler. Is SchedulerPlugin registered?`,
    why: 'The scheduler commands loaded the built application, and it created no `SchedulerManager`.',
    fix: 'Register the plugin with `app.addPlugin(SchedulerPlugin)` in the application, then build it again with `vercube build`.',
    create: (message, params: { entry: string }) => new SchedulerError(message, 'cli', undefined, { entry: params.entry }, false),
  },
  TESTING_NOT_SET_UP: {
    message: 'withManualClock() is not set up yet: pass it to createTestApp({ extensions }) first.',
    why: 'The extension returned by `withManualClock()` was used before an application set it up. It finds the `SchedulerManager` only once `createTestApp()` has run with it.',
    fix: 'Pass the extension first: `const clock = withManualClock(); await createTestApp({ extensions: [clock] })`, and read `clock.scheduler` after that.',
  },
});
