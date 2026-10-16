import { InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Kafka } from 'kafkajs';
import { QueueError } from '../Errors/QueueError';
import { QueueStrategy } from '../Services/QueueStrategy';
import { toQueueError } from '../Utils/Errors';
import { ATTEMPT_HEADER, decodePayload, encodePayload, JOB_HEADER, normalizeHeaders, readNumericHeader } from '../Utils/Job';
import type { QueueTypes } from '../Types/QueueTypes';
import type {
  Admin,
  Consumer,
  ConsumerConfig,
  KafkaConfig,
  KafkaMessage,
  Producer,
  ProducerConfig,
  ProducerRecord,
} from 'kafkajs';

/** Options the Kafka strategy connects with. */
export interface KafkaStrategyOptions {
  /** Client configuration: brokers, client id, ssl, sasl and the rest. */
  client: KafkaConfig;

  /** Consumer group every consumer of this strategy joins. Required to consume. */
  groupId?: string;

  /** Extra producer configuration. */
  producer?: ProducerConfig;

  /** Extra consumer configuration, the group id excluded. */
  consumer?: Omit<ConsumerConfig, 'groupId'>;

  /** Send options applied to every produced record. */
  send?: Omit<ProducerRecord, 'topic' | 'messages'>;

  /**
   * Start from the earliest offset when the group has none committed yet.
   * @default false
   */
  fromBeginning?: boolean;

  /**
   * What to do with a job the manager gave up on. `skip` logs it and commits the
   * offset, so the partition keeps moving, while `crash` lets the error reach
   * kafkajs, which stops the consumer.
   * @default 'skip'
   */
  onFailure?: 'skip' | 'crash';
}

/**
 * Kafka backed queue implementation.
 *
 * A queue is a topic, the job name travels in the `x-job` header and the payload
 * is JSON. Kafka is a log rather than a job broker: it has no attempts, delays,
 * priorities or per-message acknowledgements, so those are handled by the manager
 * and a job it gives up on only moves the offset forward.
 *
 * Ordering is per partition, so use the `key` job option to keep related jobs on
 * the same partition.
 *
 * A mount runs a single member of the consumer group, subscribed to every
 * consumed topic. Members of one group subscribed to different topics would be
 * handed partitions of topics they never subscribed to, and kafkajs drops those.
 *
 * @example
 * ```ts
 * await queueManager.mount({
 *   strategy: KafkaStrategy,
 *   initOptions: {
 *     client: { clientId: 'orders', brokers: ['localhost:9092'] },
 *     groupId: 'orders-workers',
 *   },
 * });
 * ```
 */
export class KafkaStrategy extends QueueStrategy<KafkaStrategyOptions> {
  /** Transport this strategy talks to. */
  public readonly transport: string = 'kafka';

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** Options the strategy was initialized with */
  private fOptions: KafkaStrategyOptions | null = null;

  /** The Kafka client */
  private fKafka: Kafka | null = null;

  /** The connected producer */
  private fProducer: Producer | null = null;

  /** Admin client, opened only when counters are read */
  private fAdmin: Admin | null = null;

  /** Consumed topics and where their records go, indexed by topic */
  private fRoutes: Map<string, QueueTypes.ConsumeRequest> = new Map();

  /** The group member consuming every routed topic */
  private fConsumer: Consumer | null = null;

  /** Serializes consumer restarts, never rejects */
  private fRestart: Promise<void> = Promise.resolve();

  /**
   * Kafka is a log: only the offsets it keeps can be reported, everything else
   * about the job model is left to the manager.
   *
   * @returns {QueueTypes.Capabilities} What this strategy supports
   */
  public override get capabilities(): QueueTypes.Capabilities {
    return {
      retries: false,
      delay: false,
      priority: false,
      progress: false,
      stats: true,
      peek: false,
    };
  }

  /**
   * Creates the client and connects the producer, so a broken configuration is
   * reported at boot instead of on the first job.
   *
   * @param {KafkaStrategyOptions} options - Client configuration and consumer group
   * @returns {Promise<void>} Resolves once the producer is connected
   * @throws {QueueError} When no brokers are given, or the producer cannot connect
   */
  public async initialize(options: KafkaStrategyOptions): Promise<void> {
    if (!options?.client?.brokers) {
      throw new QueueError('Kafka needs at least one broker', 'initialize', undefined, undefined, false);
    }

    this.fOptions = options;
    this.fKafka = new Kafka(options.client);

    try {
      this.fProducer = this.fKafka.producer(options.producer);
      await this.fProducer.connect();
    } catch (error) {
      this.fProducer = null;

      throw toQueueError(error, 'Failed to connect the Kafka producer', 'initialize');
    }
  }

  /**
   * Produces a single record.
   *
   * @param {QueueTypes.PublishRequest} request - Job to publish
   * @returns {Promise<QueueTypes.JobRef>} Reference to the produced record
   * @throws {QueueError} When the record cannot be produced
   */
  public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
    const [ref] = await this.publishMany([request]);

    return ref;
  }

  /**
   * Produces many records of the same topic in a single request.
   *
   * @param {QueueTypes.PublishRequest[]} requests - Jobs to publish, all on the same topic
   * @returns {Promise<QueueTypes.JobRef[]>} References to the produced records
   * @throws {QueueError} When the records cannot be produced
   */
  public override async publishMany(requests: QueueTypes.PublishRequest[]): Promise<QueueTypes.JobRef[]> {
    if (requests.length === 0) {
      return [];
    }

    const producer = this.requireProducer('publish');
    const topic = requests[0].queue;

    try {
      const metadata = await producer.send({
        ...this.fOptions?.send,
        topic,
        messages: requests.map((request) => ({
          key: request.options.key ?? request.options.jobId ?? null,
          value: encodePayload(request.payload),
          headers: request.headers,
        })),
      });

      // ids are read off the first acknowledged partition, so a batch that ends up
      // spread over several partitions gets best-effort ids
      const partition = metadata[0]?.partition ?? 0;
      const baseOffset = Number(metadata[0]?.baseOffset ?? 0);

      return requests.map((request, index) => ({
        id: `${topic}-${partition}-${baseOffset + index}`,
        queue: topic,
        job: request.job,
        strategy: this.transport,
      }));
    } catch (error) {
      throw toQueueError(error, 'Failed to produce Kafka records', 'publish', { queue: topic });
    }
  }

  /**
   * Routes a topic to the consumer of the configured group. The consumer is
   * restarted subscribed to every routed topic, since kafkajs cannot add a
   * subscription to a running consumer.
   *
   * @param {QueueTypes.ConsumeRequest} request - Topic to consume, its concurrency and the dispatch callback
   * @returns {Promise<QueueTypes.ConsumerHandle>} Handle used to stop consuming the topic again
   * @throws {QueueError} When no consumer group is configured, or the consumer cannot start
   */
  public async consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle> {
    const options = this.requireOptions('consume');
    this.requireClient('consume');

    if (!options.groupId) {
      throw new QueueError('Kafka needs a groupId to consume a topic', 'consume', undefined, { queue: request.queue }, false);
    }

    // a second call for the same topic replaces the first one's route
    this.fRoutes.set(request.queue, request);

    try {
      await this.restart();
    } catch (error) {
      if (this.fRoutes.get(request.queue) === request) {
        this.fRoutes.delete(request.queue);
      }

      // the topics that were consumed before keep going without this one
      await this.restart().catch((restartError: unknown) =>
        this.gLogger?.error('Vercube/KafkaStrategy::Failed to restart the consumer', restartError),
      );

      throw toQueueError(error, 'Failed to consume the Kafka topic', 'consume', { queue: request.queue });
    }

    return {
      queue: request.queue,
      stop: async () => {
        // only this request's route, never the one that replaced it
        if (this.fRoutes.get(request.queue) !== request) {
          return;
        }

        this.fRoutes.delete(request.queue);
        await this.restart();
      },
    };
  }

  /**
   * Reports how far the consumer group is behind the end of the topic.
   *
   * @param {string} queue - Topic to read
   * @returns {Promise<QueueTypes.QueueStats>} How many records are still to be read
   * @throws {QueueError} When the offsets cannot be read
   */
  public override async stats(queue: string): Promise<QueueTypes.QueueStats> {
    const options = this.requireOptions('stats');

    if (!options.groupId) {
      return {};
    }

    try {
      const admin = await this.adminClient();
      const [ends, committed] = await Promise.all([
        admin.fetchTopicOffsets(queue),
        admin.fetchOffsets({ groupId: options.groupId, topics: [queue] }),
      ]);

      const offsets = new Map(committed[0]?.partitions.map((entry) => [entry.partition, Number(entry.offset)]) ?? []);
      let waiting = 0;

      for (const end of ends) {
        // a partition the group never committed to counts from its very beginning
        const at = Math.max(0, offsets.get(end.partition) ?? 0);

        waiting += Math.max(0, Number(end.offset) - at);
      }

      return { waiting };
    } catch (error) {
      throw toQueueError(error, 'Failed to read Kafka offsets', 'stats', { queue });
    }
  }

  /**
   * Disconnects every consumer, the producer and the admin client.
   *
   * @returns {Promise<void>} Resolves once everything is disconnected
   */
  public async close(): Promise<void> {
    // a restart in flight must not bring a consumer back after this
    this.fRoutes.clear();
    await this.fRestart;

    const consumer = this.fConsumer;
    const producer = this.fProducer;
    const admin = this.fAdmin;

    this.fConsumer = null;
    this.fProducer = null;
    this.fAdmin = null;

    try {
      await Promise.all([consumer?.disconnect(), producer?.disconnect(), admin?.disconnect()]);
    } catch (error) {
      this.gLogger?.warn('Vercube/KafkaStrategy::Failed to disconnect', error);
    }
  }

  /**
   * Queues a restart of the consumer behind any restart still running.
   *
   * @returns {Promise<void>} Resolves once the consumer runs on the current routes
   * @throws {Error} When the consumer cannot start
   */
  private restart(): Promise<void> {
    const next = this.fRestart.then(() => this.restartNow());

    this.fRestart = next.catch(() => undefined);

    return next;
  }

  /**
   * Replaces the consumer with one subscribed to every routed topic. The old
   * member leaves first: two members of the group would rebalance twice and
   * both take delivery of the same records in between.
   *
   * @returns {Promise<void>} Resolves once the new consumer runs
   * @throws {Error} When the consumer cannot start
   */
  private async restartNow(): Promise<void> {
    const previous = this.fConsumer;

    this.fConsumer = null;
    await previous?.disconnect().catch(() => undefined);

    if (this.fRoutes.size === 0) {
      return;
    }

    const options = this.requireOptions('consume');
    const routes = [...this.fRoutes.values()];
    const consumer = this.requireClient('consume').consumer({ ...options.consumer, groupId: options.groupId! });

    try {
      await consumer.connect();
      await consumer.subscribe({ topics: routes.map((route) => route.queue), fromBeginning: options.fromBeginning ?? false });

      await consumer.run({
        partitionsConsumedConcurrently: routes.reduce((total, route) => total + Math.max(1, route.concurrency), 0),
        eachMessage: ({ topic, partition, message }) => this.handleMessage(topic, partition, message),
      });
    } catch (error) {
      await consumer.disconnect().catch(() => undefined);

      throw error;
    }

    this.fConsumer = consumer;
  }

  /**
   * Hands a record to the consumer of its topic.
   *
   * @param {string} topic - Topic the record came from
   * @param {number} partition - Partition the record came from
   * @param {KafkaMessage} message - The record
   * @returns {Promise<void>} Resolves once the job is handled
   */
  private async handleMessage(topic: string, partition: number, message: KafkaMessage): Promise<void> {
    const route = this.fRoutes.get(topic);

    if (!route) {
      return;
    }

    const headers = normalizeHeaders(message.headers);

    try {
      await route.dispatch({
        id: `${topic}-${partition}-${message.offset}`,
        job: headers[JOB_HEADER] ?? 'unknown',
        payload: decodePayload(message.value),
        headers,
        attempt: readNumericHeader(headers[ATTEMPT_HEADER], 1),
        raw: message,
      });
    } catch (error) {
      if ((this.fOptions?.onFailure ?? 'skip') === 'crash') {
        throw error;
      }

      // Kafka commits offsets, it cannot single out one message: stopping here
      // would block the whole partition, so the offset moves on.
      this.gLogger?.error(`Vercube/KafkaStrategy::Skipping a failed job of "${topic}"`, error);
    }
  }

  /**
   * Returns the admin client, connecting it on first use.
   *
   * @returns {Promise<Admin>} The connected admin client
   * @throws {QueueError} When the strategy has not been initialized
   */
  private async adminClient(): Promise<Admin> {
    if (!this.fAdmin) {
      this.fAdmin = this.requireClient('stats').admin();
      await this.fAdmin.connect();
    }

    return this.fAdmin;
  }

  /**
   * Returns the options the strategy was initialized with.
   *
   * @param {string} operation - Operation asking for them, reported in the error
   * @returns {KafkaStrategyOptions} The options
   * @throws {QueueError} When the strategy has not been initialized
   */
  private requireOptions(operation: string): KafkaStrategyOptions {
    if (!this.fOptions) {
      throw new QueueError('Kafka strategy is not initialized', operation, undefined, undefined, false);
    }

    return this.fOptions;
  }

  /**
   * Returns the Kafka client.
   *
   * @param {string} operation - Operation asking for it, reported in the error
   * @returns {Kafka} The client
   * @throws {QueueError} When the strategy has not been initialized
   */
  private requireClient(operation: string): Kafka {
    if (!this.fKafka) {
      throw new QueueError('Kafka strategy is not initialized', operation, undefined, undefined, false);
    }

    return this.fKafka;
  }

  /**
   * Returns the connected producer.
   *
   * @param {string} operation - Operation asking for it, reported in the error
   * @returns {Producer} The producer
   * @throws {QueueError} When the strategy has not been initialized
   */
  private requireProducer(operation: string): Producer {
    if (!this.fProducer) {
      throw new QueueError('Kafka strategy is not initialized', operation, undefined, undefined, false);
    }

    return this.fProducer;
  }
}
