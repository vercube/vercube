import type { QueueTypes } from '../Types/QueueTypes';
import type { MaybePromise } from '@vercube/core';

/**
 * Base class every queue transport implements.
 *
 * A strategy owns the connection to a broker and translates between the broker's
 * own vocabulary and the module's job model. It stays deliberately thin: routing
 * jobs to handlers, retries, timeouts and metrics all live in the
 * {@link QueueManager}, so every transport behaves the same way.
 *
 * @typeParam InitOptions - Options the strategy needs to connect. Use `undefined`
 * for strategies that need none.
 *
 * @example
 * ```ts
 * export class LogStrategy extends QueueStrategy {
 *   public readonly transport = 'log';
 *
 *   public initialize(): void {}
 *
 *   public async publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef> {
 *     console.log(request.queue, request.job, request.payload);
 *     return { id: '1', queue: request.queue, job: request.job, strategy: this.transport };
 *   }
 *
 *   public async consume(): Promise<QueueTypes.ConsumerHandle> {
 *     throw new Error('This strategy only publishes');
 *   }
 *
 *   public async close(): Promise<void> {}
 * }
 * ```
 */
export abstract class QueueStrategy<InitOptions = undefined> {
  /**
   * Type-only marker carrying `InitOptions`, so `QueueTypes.Mount` can tell a
   * strategy that needs options from one that does not. Declared, never assigned,
   * and gone at runtime.
   *
   * @internal
   */
  declare public readonly __initOptions: InitOptions;

  /** Transport this strategy talks to, used in logs and in the devtools. */
  public abstract readonly transport: string;

  /**
   * What the transport can do on its own. Anything reported as unsupported is
   * either emulated by the manager or ignored.
   */
  public get capabilities(): QueueTypes.Capabilities {
    return {
      retries: false,
      delay: false,
      priority: false,
      progress: false,
      stats: false,
      peek: false,
    };
  }

  /**
   * Connects to the broker. Called once per mount, before the first publish or
   * consume, and never called again unless the strategy is closed.
   *
   * @param options - Options the strategy was mounted with.
   * @returns Resolves once the strategy is ready to be used.
   * @throws {QueueError} When the connection cannot be established.
   */
  public abstract initialize(options: InitOptions): MaybePromise<void>;

  /**
   * Publishes a single job.
   *
   * @param request - Job to publish, with its headers and options already resolved.
   * @returns Reference to the published job.
   * @throws {QueueError} When the job cannot be published.
   */
  public abstract publish(request: QueueTypes.PublishRequest): Promise<QueueTypes.JobRef>;

  /**
   * Starts consuming a queue. The strategy calls `request.dispatch()` for every
   * job it receives and applies its own failure semantics when the returned
   * promise rejects.
   *
   * @param request - Queue to consume, its concurrency and the dispatch callback.
   * @returns Handle used to stop the consumer again.
   * @throws {QueueError} When the consumer cannot be started.
   */
  public abstract consume(request: QueueTypes.ConsumeRequest): Promise<QueueTypes.ConsumerHandle>;

  /**
   * Closes every connection the strategy holds. Called on shutdown and safe to
   * call more than once.
   *
   * @returns Resolves once everything is closed.
   */
  public abstract close(): Promise<void>;

  /**
   * Publishes many jobs of the same kind. The default implementation publishes
   * them one by one, transports with a batch API should override it.
   *
   * @param requests - Jobs to publish, all targeting the same queue.
   * @returns References to the published jobs, in the same order.
   * @throws {QueueError} When the jobs cannot be published.
   */
  public async publishMany(requests: QueueTypes.PublishRequest[]): Promise<QueueTypes.JobRef[]> {
    const refs: QueueTypes.JobRef[] = [];

    for (const request of requests) {
      refs.push(await this.publish(request));
    }

    return refs;
  }

  /**
   * Reads live counters of a queue, for transports that keep them.
   *
   * @param queue - Queue to read.
   * @returns The counters the transport can report.
   */
  public stats?(queue: string): Promise<QueueTypes.QueueStats>;

  /**
   * Shows what a queue is holding without consuming any of it.
   *
   * Only transports that can be read without side effects implement this: a
   * broker where looking means taking delivery, such as RabbitMQ, leaves it out
   * rather than perturbing the queue it is asked about.
   *
   * @param request - Queue to look at, how many messages to read and which states.
   * @returns The messages found, in the order the transport returned them.
   * @throws {QueueError} When the queue cannot be read.
   */
  public peek?(request: QueueTypes.PeekRequest): Promise<QueueTypes.PeekedMessage[]>;
}
