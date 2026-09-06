import { InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { connect } from 'amqplib';
import { QueueError } from '../Errors/QueueError';
import { QueueStrategy } from '../Services/QueueStrategy';
import { toQueueError } from '../Utils/Errors';
import {
  ATTEMPT_HEADER,
  decodePayload,
  encodePayload,
  generateJobId,
  JOB_HEADER,
  normalizeHeaders,
  readNumericHeader,
} from '../Utils/Job';
import type { QueueTypes } from '../Types/QueueTypes';
import type {
  Channel,
  ChannelModel,
  ConsumeMessage,
  Options,
  RecoveringChannelModel,
  RecoveryOptions,
  SocketOptions,
} from 'amqplib';

/** Options the RabbitMQ strategy connects with. */
export interface RabbitMQStrategyOptions {
  /** Broker to connect to, as an `amqp://` URL or as connection fields. */
  url: string | Options.Connect;

  /** Socket options handed to amqplib. */
  socketOptions?: SocketOptions;

  /**
   * Automatic reconnection, on by default. Pass options to tune the backoff,
   * or false to fail fast instead.
   * @default true
   */
  recovery?: RecoveryOptions | boolean;

  /**
   * Options every queue is asserted with.
   * @default { durable: true }
   */
  queueOptions?: Options.AssertQueue;

  /**
   * Options every message is published with.
   * @default { persistent: true }
   */
  publishOptions?: Options.Publish;

  /**
   * Number of unacknowledged messages a consumer may hold. Defaults to the
   * concurrency the consumer was started with.
   */
  prefetch?: number;
}

/** A running consumer of a single queue. */
interface RabbitConsumer {
  channel: Channel;
  tag: string;
  active: number;
  stopping: boolean;

  /** What the consumer was started with, so it can be started again after a recovery. */
  request: QueueTypes.ConsumeRequest;
}

/**
 * RabbitMQ backed queue implementation.
 *
 * Jobs are plain AMQP messages: the job name travels in the message `type`
 * property, the module's bookkeeping in the headers, and the payload as JSON.
 * RabbitMQ has no notion of attempts or delays, so the manager owns them - which
 * also means a job that has run out of attempts is nacked without requeue, and
 * ends up wherever the queue's dead letter exchange points.
 *
 * @example
 * ```ts
 * await queueManager.mount({
 *   strategy: RabbitMQStrategy,
 *   initOptions: { url: 'amqp://localhost' },
 * });
 * ```
 *
 * @example
 * ```ts
 * // a queue that dead-letters what it cannot process
 * await queueManager.mount({
 *   strategy: RabbitMQStrategy,
 *   initOptions: {
 *     url: 'amqp://localhost',
 *     queueOptions: { durable: true, deadLetterExchange: 'failed' },
 *   },
 * });
 * ```
 */
export class RabbitMQStrategy extends QueueStrategy<RabbitMQStrategyOptions> {
  /** Transport this strategy talks to. */
  public readonly transport: string = 'rabbitmq';

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** Options the strategy was initialized with */
  private fOptions: RabbitMQStrategyOptions | null = null;

  /** The connection, recovering on its own unless recovery was turned off */
  private fConnection: ChannelModel | RecoveringChannelModel | null = null;

  /** Channel every publish goes through */
  private fPublishChannel: Channel | null = null;

  /** Running consumers, indexed by queue name */
  private fConsumers: Map<string, RabbitConsumer> = new Map();

  /** Queues already asserted on the current connection */
  private fAsserted: Set<string> = new Set();

  /**
   * RabbitMQ carries priorities and message counts, while attempts and delays
   * are left to the manager.
   *
   * @returns {QueueTypes.Capabilities} What this strategy supports
   */
  public override get capabilities(): QueueTypes.Capabilities {
    return {
      retries: false,
      delay: false,
      priority: true,
      progress: false,
      stats: true,
      peek: false,
    };
  }

  /**
   * Opens the connection to the broker.
   *
   * @param {RabbitMQStrategyOptions} options - Broker to connect to and the defaults to use
   * @returns {Promise<void>} Resolves once the connection is open
   * @throws {QueueError} When no broker is given, or the connection cannot be opened
   */
  public async initialize(options: RabbitMQStrategyOptions): Promise<void> {
    if (!options?.url) {
      throw new QueueError('RabbitMQ needs a broker url', 'initialize', undefined, undefined, false);
    }

    this.fOptions = options;

    const recovery = options.recovery ?? true;

    try {
      this.fConnection = await (recovery
        ? connect(options.url, { ...options.socketOptions, recovery: recovery === true ? {} : recovery })
        : connect(options.url, options.socketOptions));
    } catch (error) {
      throw toQueueError(error, 'Failed to connect to RabbitMQ', 'initialize');
    }

    this.fConnection.on('error', (error: Error) => {
      this.gLogger?.error('Vercube/RabbitMQStrategy::Connection failed', error);
    });

    // A recovered connection starts from an empty topology, so assert everything
    // again. The consumer channels belonged to the dead connection, so they are
    // dropped and started again on the new one, otherwise the process stays up
    // with every consumer silently detached.
    this.fConnection.on('connect', () => {
      this.fAsserted.clear();
      this.fPublishChannel = null;

      const consuming = [...this.fConsumers.entries()];

      this.fConsumers.clear();

      for (const [, consumer] of consuming) {
        void this.resume(consumer.request);
      }
    });
  }

  /**
   * Sends a job to a queue.
   *
   * @param {QueueTypes.PublishRequest} request - Job to publish
   * @returns {Promise<QueueTypes.JobRef>} Reference to the published job
   * @throws {QueueError} When the job cannot be sent
   */
  public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
    const options = this.requireOptions('publish');

    try {
      const channel = await this.publishChannel();

      await this.assertQueue(channel, request.queue);

      const id = request.options.jobId ?? generateJobId();
      const written = channel.sendToQueue(request.queue, encodePayload(request.payload), {
        persistent: true,
        ...options.publishOptions,
        headers: request.headers,
        type: request.job,
        messageId: id,
        priority: request.options.priority,
        correlationId: request.options.key,
      });

      if (!written) {
        // The channel buffer is full, let it flush before returning. A channel
        // that errors or closes instead never emits `drain`, so those settle the
        // wait as well rather than leaving the publisher hanging forever.
        await new Promise<void>((resolve, reject) => {
          let settled = false;

          // Whichever of the three arrives first wins; the listeners are one-shot
          // and the flag keeps the losers from settling an already settled promise.
          const settle = (error?: Error): void => {
            if (settled) {
              return;
            }

            settled = true;

            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          channel.once('drain', () => settle());
          channel.once('error', (channelError: Error) => settle(channelError));
          channel.once('close', () => settle(new Error('The channel closed before the job was flushed')));
        });
      }

      return { id, queue: request.queue, job: request.job, strategy: this.transport };
    } catch (error) {
      throw toQueueError(error, 'Failed to send job to RabbitMQ', 'publish', {
        queue: request.queue,
        job: request.job,
      });
    }
  }

  /**
   * Starts consuming a queue on its own channel, so its prefetch is its own.
   *
   * A job whose dispatch rejects is nacked without requeue: the manager has
   * already decided it is not worth another attempt.
   *
   * @param {QueueTypes.ConsumeRequest} request - Queue to consume, its concurrency and the dispatch callback
   * @returns {Promise<QueueTypes.ConsumerHandle>} Handle used to stop the consumer again
   * @throws {QueueError} When the consumer cannot be started
   */
  public async consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle> {
    try {
      await this.startConsumer(request);
    } catch (error) {
      throw toQueueError(error, 'Failed to consume RabbitMQ queue', 'consume', { queue: request.queue });
    }

    return {
      queue: request.queue,
      stop: () => this.stopConsumer(request.queue),
    };
  }

  /**
   * Opens a channel for a queue and starts delivering its messages.
   *
   * @param {QueueTypes.ConsumeRequest} request - Queue to consume, its concurrency and the dispatch callback
   * @returns {Promise<void>} Resolves once the broker accepted the consumer
   * @throws {Error} When the channel or the consumer cannot be created
   */
  private async startConsumer(request: QueueTypes.ConsumeRequest): Promise<void> {
    const options = this.requireOptions('consume');
    const connection = this.requireConnection('consume');
    const channel = await connection.createChannel();

    await this.assertQueue(channel, request.queue);
    await channel.prefetch(options.prefetch ?? Math.max(1, request.concurrency));

    const reply = await channel.consume(request.queue, (message: ConsumeMessage | null) => {
      if (!message) {
        this.gLogger?.warn(`Vercube/RabbitMQStrategy::Consumer of "${request.queue}" was cancelled by the broker`);

        return;
      }

      void this.handle(request, message);
    });

    this.fConsumers.set(request.queue, { channel, tag: reply.consumerTag, active: 0, stopping: false, request });
  }

  /**
   * Starts a consumer again on a recovered connection.
   *
   * Failing here is reported rather than thrown: nothing is waiting on a
   * recovery, and a queue that cannot be consumed again has to be visible.
   *
   * @param {QueueTypes.ConsumeRequest} request - What the consumer was started with
   * @returns {Promise<void>} Resolves once the consumer is running again, or once the failure was reported
   */
  private async resume(request: QueueTypes.ConsumeRequest): Promise<void> {
    try {
      await this.startConsumer(request);
    } catch (error) {
      this.gLogger?.error(`Vercube/RabbitMQStrategy::Failed to consume "${request.queue}" again after a recovery`, error);
    }
  }

  /**
   * Reads how many messages are waiting on a queue.
   *
   * @param {string} queue - Queue to read
   * @returns {Promise<QueueTypes.QueueStats>} Counters of that queue
   * @throws {QueueError} When the queue cannot be inspected
   */
  public override async stats(queue: string): Promise<QueueTypes.QueueStats> {
    const connection = this.requireConnection('stats');

    // On its own channel: RabbitMQ closes the channel with NOT_FOUND when the
    // queue does not exist, and the publish channel is shared, so asking about a
    // queue nobody created would break the next publish.
    let channel: Channel | null = null;

    try {
      channel = await connection.createChannel();

      const info = await channel.checkQueue(queue);
      const consumer = this.fConsumers.get(queue);

      return { waiting: info.messageCount, active: consumer?.active ?? 0 };
    } catch (error) {
      throw toQueueError(error, 'Failed to inspect RabbitMQ queue', 'stats', { queue });
    } finally {
      await channel?.close().catch(() => undefined);
    }
  }

  /**
   * Stops every consumer and closes the connection.
   *
   * @returns {Promise<void>} Resolves once the connection is closed
   */
  public async close(): Promise<void> {
    const consuming = [...this.fConsumers.keys()];

    for (const queue of consuming) {
      await this.stopConsumer(queue);
    }

    const channel = this.fPublishChannel;
    const connection = this.fConnection;

    this.fPublishChannel = null;
    this.fConnection = null;
    this.fAsserted.clear();

    try {
      await channel?.close();
      await connection?.close();
    } catch (error) {
      this.gLogger?.warn('Vercube/RabbitMQStrategy::Failed to close the connection', error);
    }
  }

  /**
   * Runs a single delivery and acknowledges it according to the outcome.
   *
   * @param {QueueTypes.ConsumeRequest} request - The consumer the message belongs to
   * @param {ConsumeMessage} message - The delivery
   * @returns {Promise<void>} Resolves once the message has been settled
   */
  private async handle(request: QueueTypes.ConsumeRequest, message: ConsumeMessage): Promise<void> {
    const consumer = this.fConsumers.get(request.queue);
    const headers = normalizeHeaders(message.properties.headers);

    if (consumer) {
      consumer.active++;
    }

    try {
      await request.dispatch({
        id: message.properties.messageId ?? generateJobId(),
        job: message.properties.type ?? headers[JOB_HEADER] ?? 'unknown',
        payload: decodePayload(message.content),
        headers,
        attempt: readNumericHeader(headers[ATTEMPT_HEADER], 1),
        raw: message,
      });

      consumer?.channel.ack(message);
    } catch {
      // the manager owns the retry policy, so requeueing here would only loop
      consumer?.channel.nack(message, false, false);
    } finally {
      if (consumer) {
        consumer.active--;
      }
    }
  }

  /**
   * Cancels a consumer, waits for its in-flight messages and closes its channel.
   *
   * @param {string} queue - Queue whose consumer is stopped
   * @returns {Promise<void>} Resolves once the channel is closed
   */
  private async stopConsumer(queue: string): Promise<void> {
    const consumer = this.fConsumers.get(queue);

    if (!consumer || consumer.stopping) {
      return;
    }

    consumer.stopping = true;
    this.fConsumers.delete(queue);

    try {
      await consumer.channel.cancel(consumer.tag);

      while (consumer.active > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      await consumer.channel.close();
    } catch (error) {
      this.gLogger?.warn(`Vercube/RabbitMQStrategy::Failed to stop the consumer of "${queue}"`, error);
    }
  }

  /**
   * Returns the channel every publish goes through, opening it on first use and
   * after a reconnection.
   *
   * @returns {Promise<Channel>} The publish channel
   * @throws {QueueError} When the strategy is not connected
   */
  private async publishChannel(): Promise<Channel> {
    if (!this.fPublishChannel) {
      this.fPublishChannel = await this.requireConnection('publish').createChannel();

      this.fPublishChannel.on('error', (error: Error) => {
        this.gLogger?.error('Vercube/RabbitMQStrategy::Publish channel failed', error);
      });
    }

    return this.fPublishChannel;
  }

  /**
   * Declares a queue once per connection.
   *
   * @param {Channel} channel - Channel to declare it on
   * @param {string} queue - Queue to declare
   * @returns {Promise<void>} Resolves once the queue exists
   */
  private async assertQueue(channel: Channel, queue: string): Promise<void> {
    if (this.fAsserted.has(queue)) {
      return;
    }

    await channel.assertQueue(queue, { durable: true, ...this.fOptions?.queueOptions });
    this.fAsserted.add(queue);
  }

  /**
   * Returns the options the strategy was initialized with.
   *
   * @param {string} operation - Operation asking for them, reported in the error
   * @returns {RabbitMQStrategyOptions} The options
   * @throws {QueueError} When the strategy has not been initialized
   */
  private requireOptions(operation: string): RabbitMQStrategyOptions {
    if (!this.fOptions) {
      throw new QueueError('RabbitMQ strategy is not initialized', operation, undefined, undefined, false);
    }

    return this.fOptions;
  }

  /**
   * Returns the open connection.
   *
   * @param {string} operation - Operation asking for it, reported in the error
   * @returns {ChannelModel | RecoveringChannelModel} The connection
   * @throws {QueueError} When the strategy is not connected
   */
  private requireConnection(operation: string): ChannelModel | RecoveringChannelModel {
    if (!this.fConnection) {
      throw new QueueError('RabbitMQ strategy is not connected', operation, undefined, undefined, false);
    }

    return this.fConnection;
  }
}
