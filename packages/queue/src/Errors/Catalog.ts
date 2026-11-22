import { defineErrorCatalog } from '@vercube/di';
import { QueueError } from './QueueError';

/** What a call site hands to an error that reports a refused call. */
interface Refused {
  /** The queue operation that failed, kept on the error as `operation`. */
  operation: string;
  /** Non-sensitive context, kept on the error as `metadata`. */
  metadata?: Record<string, unknown>;
}

/** What a call site hands to an error that wraps one thrown by a transport. */
interface Wrapped {
  /** The value the transport threw, kept on the error as `cause`. */
  cause: unknown;
  /** Non-sensitive context, kept on the error as `metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds an error the job cannot recover from by being processed again.
 *
 * @param {string} message - Message of the error
 * @param {Refused} params - Operation and context
 * @returns {QueueError} The error
 */
function refused(message: string, params: Refused): QueueError {
  return new QueueError(message, params.operation, undefined, params.metadata, false);
}

/**
 * Builds an error around what a transport threw. It stays retryable: the
 * broker may answer the next time.
 *
 * @param {string} operation - The queue operation that failed
 * @returns {Function} The `create` of a catalog entry
 */
function wrapped(operation: string): (message: string, params: Wrapped) => QueueError {
  return (message, params) => new QueueError(message, operation, params.cause as Error, params.metadata);
}

const MOUNT_FIX =
  'Mount the strategy instead of creating it yourself: list it in the `strategies` option of `QueuePlugin`, or pass it to `QueueManager.mount()`. Both call `initialize()` before the first job.';

/**
 * The errors of the queue module.
 */
export const QueueErrors = defineErrorCatalog('VERCUBE_QUEUE', {
  MANAGER_CLOSED: {
    message: (_: Refused) => 'The queue manager is closed',
    why: '`QueueManager.ping()` was called after `QueueManager.close()`, which runs when the application closes. A closed manager has no strategy left to ask.',
    fix: 'Call `ping()` only while the application is running. In a test, create a new application with `createTestApp()` instead of reusing a closed one.',
    create: refused,
  },
  STRATEGY_NOT_MOUNTED: {
    message: ({ name }: Refused & { name: string }) => `No queue strategy is mounted under "${name}"`,
    why: '`QueueManager.ping()` was asked about a strategy name that nothing is mounted under.',
    fix: 'Mount it in the `strategies` option of `QueuePlugin` (`{ name, strategy, initOptions }`), or pass the `name` of a mounted strategy. A mount without a `name` is called `default`.',
    create: refused,
  },
  STRATEGY_CLOSED: {
    message: ({ name }: Refused & { name: string }) => `The queue strategy "${name}" was closed`,
    why: 'The strategy was unmounted, or the manager was closed, while `QueueManager.ping()` was waiting for it to initialize.',
    fix: 'Do not call `QueueManager.unmount()` or `QueueManager.close()` while the strategy is still in use. A health check that reports this during shutdown can be ignored.',
    create: refused,
  },
  STRATEGY_UNKNOWN: {
    message: ({ name }: Refused & { name: string }) => `No queue strategy is mounted as "${name}"`,
    why: 'A job was published to, or read from, a strategy name that nothing is mounted under. The `metadata.mounted` field of the error lists the names that exist.',
    fix: 'Mount the strategy in the `strategies` option of `QueuePlugin` (`{ name, strategy, initOptions }`), or correct the `strategy` option of the call or of `@Consumer()`. A mount without a `name` is called `default`.',
    create: (message, params: Refused) => new QueueError(message, params.operation, undefined, params.metadata),
  },
  STRATEGY_INIT_FAILED: {
    message: ({ name }: Wrapped & { name: string }) => `Failed to initialize strategy "${name}"`,
    why: 'The `initialize()` method of a mounted strategy threw something that is not a `QueueError`. The original error is the `cause`.',
    fix: 'Read the `cause`, then correct the `initOptions` of that strategy in the `strategies` option of `QueuePlugin`, or make the broker reachable.',
    create: wrapped('initialize'),
  },
  STRATEGY_UNMOUNTED_BEFORE_RETRY: {
    message: ({ strategy }: Refused & { strategy: string }) => `Strategy "${strategy}" is no longer mounted`,
    why: 'A job failed and was due for another attempt, but its strategy was unmounted before the retry could be published. The attempt is reported as failed so the transport keeps the job.',
    fix: 'Call `QueueManager.drain()` before `QueueManager.unmount()`, so running jobs and their retries finish first.',
    create: refused,
  },
  HANDLER_DUPLICATE: {
    message: ({ job, queue }: Refused & { job: string; queue: string }) =>
      `Job "${job}" of queue "${queue}" already has a handler`,
    why: 'Two handlers were registered for the same job of the same queue on the same strategy. The `metadata` of the error names both. A job is handed to one handler only.',
    fix: 'Keep one `@Job()` method per job name in a queue, and one `@AnyJob()` method per queue. Check that the `@Consumer()` class is not bound twice.',
    create: refused,
  },
  HANDLER_MISSING: {
    message: ({ job }: Refused & { job: string }) => `No handler registered for job "${job}"`,
    why: 'A job arrived that no `@Job()` or `@AnyJob()` method handles, and `onUnhandled` is set to `fail`, so it is reported to the transport as a failed job.',
    fix: "Add a `@Job()` method for that job name to the `@Consumer()` of the queue, or an `@AnyJob()` method. Set `onUnhandled: 'ignore'` in the `QueuePlugin` options to drop such jobs instead.",
    create: refused,
  },
  JOB_TIMEOUT: {
    message: ({ job, timeout }: { job: string; timeout: number; metadata: Record<string, unknown> }) =>
      `Job "${job}" timed out after ${timeout}ms`,
    why: 'The handler ran longer than the `timeout` of the job, so the attempt counts as failed. The handler is not interrupted, it is only no longer waited for.',
    fix: 'Raise `timeout` in the options of `@Job()`, or make the handler finish sooner, for example by splitting the work into several jobs.',
    create: (message, params: { metadata: Record<string, unknown> }) =>
      new QueueError(message, 'timeout', undefined, params.metadata),
  },
  VALIDATION_PROVIDER_MISSING: {
    message: (_: Refused) => 'A job declares a schema but no ValidationProvider is bound in the container',
    why: 'A handler has a `schema` option, and the `QueueManager` found no `ValidationProvider` in its container to run it with. `createApp()` binds one, so the manager lives in a container that was built by hand.',
    fix: 'Bind one: `container.bind(ValidationProvider, StandardSchemaValidationProvider)`, both exported by `@vercube/core`. Or remove `schema` from the options of `@Job()`.',
    create: refused,
  },
  PAYLOAD_INVALID: {
    message: ({ job }: Refused & { job: string }) => `Payload of job "${job}" failed validation`,
    why: 'The payload of a job did not pass the `schema` of its handler. The issues are in `metadata.issues` of the error. The job is not retried, as the same payload would fail again.',
    fix: 'Publish a payload that matches the `schema` given to `@Job()`, or correct the schema when the payload is right.',
    create: refused,
  },
  PAYLOAD_NOT_SERIALIZABLE: {
    message: (_: { cause: unknown }) => 'Job payload is not serializable',
    why: 'The transport carries bytes, and `JSON.stringify()` threw on the payload. It holds a circular reference, a `BigInt`, or a `toJSON()` that throws.',
    fix: 'Publish plain JSON data: objects, arrays, strings, numbers, booleans and `null`. Convert a `BigInt` to a string before `QueueManager.add()`.',
    create: (message, params: { cause: unknown }) => new QueueError(message, 'encode', params.cause as Error, undefined, false),
  },
  DELAY_UNSUPPORTED: {
    message: ({ transport }: Refused & { transport: string }) => `The "${transport}" transport cannot delay jobs`,
    why: 'A job was published with a `delay`, on a strategy whose `capabilities.delay` is `false`. Waiting in this process would lose the job on a restart, so it is refused.',
    fix: 'Remove `delay` from the job options, or publish through a strategy that delays jobs itself, such as `BullMQStrategy`.',
    create: refused,
  },
  DELAY_INVALID: {
    message: ({ delay }: Refused & { delay: number }) => `Invalid job delay: ${delay}`,
    why: 'The `delay` of a job published to `MemoryStrategy` is `NaN` or `Infinity`, which is not a time the job could become due.',
    fix: 'Pass `delay` as a finite number of milliseconds in the job options of `QueueManager.add()`.',
    create: refused,
  },
  PUBLISH_FAILED: {
    message: (_: Wrapped) => 'Failed to publish job',
    why: 'The strategy threw something that is not a `QueueError` while `QueueManager.add()` was publishing. The original error is the `cause`.',
    fix: 'Read the `cause`. For a custom strategy, throw a `QueueError` from `publish()` to say what failed.',
    create: wrapped('add'),
  },
  PUBLISH_MANY_FAILED: {
    message: (_: Wrapped) => 'Failed to publish jobs',
    why: 'The strategy threw something that is not a `QueueError` while `QueueManager.addMany()` was publishing. The original error is the `cause`.',
    fix: 'Read the `cause`. For a custom strategy, throw a `QueueError` from `publish()` or `publishMany()` to say what failed.',
    create: wrapped('addMany'),
  },
  BULLMQ_CONNECTION_MISSING: {
    message: 'BullMQ needs a Redis connection',
    why: '`BullMQStrategy` was initialized without a `connection`. BullMQ stores every job in Redis and has no default server.',
    fix: 'Give the mount a connection in the `strategies` option of `QueuePlugin`: `{ strategy: BullMQStrategy, initOptions: { connection: { host, port } } }`.',
    create: (message) => new QueueError(message, 'initialize', undefined, undefined, false),
  },
  BULLMQ_NOT_INITIALIZED: {
    message: (_: Refused) => 'BullMQ strategy is not initialized',
    why: 'A method of `BullMQStrategy` was called before its `initialize()`. That happens when the strategy is created by hand and not mounted.',
    fix: MOUNT_FIX,
    create: refused,
  },
  BULLMQ_PUBLISH_FAILED: {
    message: (_: Wrapped) => 'Failed to add job to BullMQ',
    why: 'BullMQ rejected the job or could not reach Redis. The original error is the `cause`.',
    fix: 'Read the `cause`. Check that Redis is reachable with the `connection` in the `initOptions` of `BullMQStrategy`, and that the job options are ones BullMQ accepts.',
    create: wrapped('publish'),
  },
  BULLMQ_PUBLISH_MANY_FAILED: {
    message: (_: Wrapped) => 'Failed to add jobs to BullMQ',
    why: 'BullMQ rejected the batch or could not reach Redis. The original error is the `cause`. Nothing of the batch is known to be stored.',
    fix: 'Read the `cause`. Check that Redis is reachable with the `connection` in the `initOptions` of `BullMQStrategy`, and that the job options are ones BullMQ accepts.',
    create: wrapped('publishMany'),
  },
  BULLMQ_STATS_FAILED: {
    message: (_: Wrapped) => 'Failed to read BullMQ job counts',
    why: 'BullMQ could not read the job counts of the queue from Redis. The original error is the `cause`.',
    fix: 'Read the `cause`, and check that Redis is reachable with the `connection` in the `initOptions` of `BullMQStrategy`.',
    create: wrapped('stats'),
  },
  BULLMQ_PEEK_FAILED: {
    message: (_: Wrapped) => 'Failed to read the BullMQ queue',
    why: 'BullMQ could not list the jobs of the queue from Redis. The original error is the `cause`.',
    fix: 'Read the `cause`, and check that Redis is reachable with the `connection` in the `initOptions` of `BullMQStrategy`.',
    create: wrapped('peek'),
  },
  KAFKA_BROKERS_MISSING: {
    message: 'Kafka needs at least one broker',
    why: '`KafkaStrategy` was initialized without `client.brokers`, so the client has no cluster to connect to.',
    fix: "Give the mount its brokers in the `strategies` option of `QueuePlugin`: `{ strategy: KafkaStrategy, initOptions: { client: { brokers: ['localhost:9092'] } } }`.",
    create: (message) => new QueueError(message, 'initialize', undefined, undefined, false),
  },
  KAFKA_GROUP_ID_MISSING: {
    message: (_: Refused) => 'Kafka needs a groupId to consume a topic',
    why: 'A consumer was started on a `KafkaStrategy` that has no `groupId`. Kafka tracks what was read per consumer group, so a consumer cannot join without one.',
    fix: 'Add `groupId` to the `initOptions` of `KafkaStrategy`. A process that only publishes can leave it out and set `autoStart: false` in the `QueuePlugin` options.',
    create: refused,
  },
  KAFKA_CLOSED: {
    message: (_: Refused) => 'Kafka strategy was closed',
    why: '`KafkaStrategy.close()` ran while the strategy was still connecting its admin client, so the connection was dropped again.',
    fix: 'Do not ask for `stats()` or `ping()` while the application is closing. A health check that reports this during shutdown can be ignored.',
    create: refused,
  },
  KAFKA_NOT_INITIALIZED: {
    message: (_: Refused) => 'Kafka strategy is not initialized',
    why: 'A method of `KafkaStrategy` was called before its `initialize()` finished, or after `close()`. That happens when the strategy is created by hand and not mounted.',
    fix: MOUNT_FIX,
    create: refused,
  },
  KAFKA_CONNECT_FAILED: {
    message: (_: Wrapped) => 'Failed to connect the Kafka producer',
    why: 'The producer could not connect to the cluster while `KafkaStrategy` was initializing. The original error is the `cause`.',
    fix: 'Read the `cause`. Check `client.brokers` and the `ssl` and `sasl` settings of `client` in the `initOptions` of `KafkaStrategy`, and that the brokers are reachable from this process.',
    create: wrapped('initialize'),
  },
  KAFKA_PUBLISH_FAILED: {
    message: (_: Wrapped) => 'Failed to produce Kafka records',
    why: 'The producer could not send the records to the topic. The original error is the `cause`.',
    fix: 'Read the `cause`. Check that the topic exists or that the cluster creates topics on demand, and that the brokers in `client.brokers` are reachable.',
    create: wrapped('publish'),
  },
  KAFKA_CONSUME_FAILED: {
    message: (_: Wrapped) => 'Failed to consume the Kafka topic',
    why: 'The consumer could not connect, subscribe to the topic or start reading. The original error is the `cause`.',
    fix: 'Read the `cause`. Check that the topic exists and that the `groupId` in the `initOptions` of `KafkaStrategy` may read it.',
    create: wrapped('consume'),
  },
  KAFKA_STATS_FAILED: {
    message: (_: Wrapped) => 'Failed to read Kafka offsets',
    why: 'The admin client could not read the offsets of the topic or of the consumer group. The original error is the `cause`.',
    fix: 'Read the `cause`. Check that the topic exists and that the client is allowed to describe it and the consumer group.',
    create: wrapped('stats'),
  },
  RABBITMQ_URL_MISSING: {
    message: 'RabbitMQ needs a broker url',
    why: '`RabbitMQStrategy` was initialized without a `url`, so there is no broker to connect to.',
    fix: "Give the mount its broker in the `strategies` option of `QueuePlugin`: `{ strategy: RabbitMQStrategy, initOptions: { url: 'amqp://localhost' } }`.",
    create: (message) => new QueueError(message, 'initialize', undefined, undefined, false),
  },
  RABBITMQ_NOT_INITIALIZED: {
    message: (_: Refused) => 'RabbitMQ strategy is not initialized',
    why: 'A method of `RabbitMQStrategy` was called before its `initialize()`. That happens when the strategy is created by hand and not mounted.',
    fix: MOUNT_FIX,
    create: refused,
  },
  RABBITMQ_NOT_CONNECTED: {
    message: (_: Refused) => 'RabbitMQ strategy is not connected',
    why: '`RabbitMQStrategy` has no open connection: `initialize()` did not finish or failed, or the strategy was closed.',
    fix: 'Mount the strategy in the `strategies` option of `QueuePlugin` and wait for the application to start before using it. Do not use the strategy after `QueueManager.close()`.',
    create: refused,
  },
  RABBITMQ_CHANNEL_CLOSED: {
    message: 'The channel closed before the job was flushed',
    why: 'The publish channel was under backpressure, and it closed before the broker drained it. The job may not have reached the broker.',
    fix: 'Publish the job again. When it happens often, look for the reason the broker closes the channel in the RabbitMQ log.',
  },
  RABBITMQ_CONNECT_FAILED: {
    message: (_: Wrapped) => 'Failed to connect to RabbitMQ',
    why: 'The connection to the broker could not be opened while `RabbitMQStrategy` was initializing. The original error is the `cause`.',
    fix: 'Read the `cause`. Check the `url` and `socketOptions` in the `initOptions` of `RabbitMQStrategy`, and that the broker is reachable from this process.',
    create: wrapped('initialize'),
  },
  RABBITMQ_PUBLISH_FAILED: {
    message: (_: Wrapped) => 'Failed to send job to RabbitMQ',
    why: 'The job could not be written to the queue: the queue could not be asserted, or the channel failed. The original error is the `cause`.',
    fix: 'Read the `cause`. A queue that already exists with other arguments must match the `queueOptions` in the `initOptions` of `RabbitMQStrategy`.',
    create: wrapped('publish'),
  },
  RABBITMQ_CONSUME_FAILED: {
    message: (_: Wrapped) => 'Failed to consume RabbitMQ queue',
    why: 'The consumer channel could not be opened, or the queue could not be asserted or subscribed to. The original error is the `cause`.',
    fix: 'Read the `cause`. A queue that already exists with other arguments must match the `queueOptions` in the `initOptions` of `RabbitMQStrategy`.',
    create: wrapped('consume'),
  },
  RABBITMQ_STATS_FAILED: {
    message: (_: Wrapped) => 'Failed to inspect RabbitMQ queue',
    why: 'The broker did not answer the check of the queue, usually because the queue does not exist yet. The original error is the `cause`.',
    fix: 'Read the `cause`. Ask for `QueueManager.stats()` of a queue that a job was published to or that a `@Consumer()` reads.',
    create: wrapped('stats'),
  },
  TESTING_NOT_SET_UP: {
    message: 'withMemoryQueue() is not set up yet: pass it to createTestApp({ extensions }) first.',
    why: 'The extension returned by `withMemoryQueue()` was used before an application set it up. It finds the `QueueManager` only once `createTestApp()` has run with it.',
    fix: 'Pass the extension first: `const queue = withMemoryQueue(); await createTestApp({ extensions: [queue] })`, and use `queue` after that.',
  },
});
