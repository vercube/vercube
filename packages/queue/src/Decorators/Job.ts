import { BaseDecorator, createDecorator, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { QueueManager } from '../Services/QueueManager';
import { getConsumerOptions } from '../Utils/Metadata';
import type { QueueTypes } from '../Types/QueueTypes';

/** Options the `@Job()` decorator is created with. */
interface JobDecoratorOptions {
  /** Name of the job the method handles. */
  name: string;

  /** Consumer-side options of this handler. */
  options: QueueTypes.HandlerOptions;
}

/**
 * Registers the decorated method as the handler of a single job.
 * Runs when the container instantiates the consumer class.
 */
export class JobDecorator extends BaseDecorator<JobDecoratorOptions> {
  /** Queue manager the handler is registered with */
  @InjectOptional(QueueManager)
  private gQueueManager!: QueueManager | null;

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** The registration handed to the manager, kept so it can be removed again */
  private fRegistration: QueueTypes.Registration | null = null;

  /**
   * Registers the handler with the queue manager.
   *
   * @returns {void}
   */
  public override created(): void {
    if (!this.gQueueManager) {
      this.warn('QueueManager is not bound in the container, no job will be consumed');

      return;
    }

    const consumer = getConsumerOptions(this.prototype);

    if (!consumer) {
      this.warn(`Unable to find the queue of "${this.propertyName}". Did you use @Consumer()?`);

      return;
    }

    const handler = this.instance[this.propertyName];

    if (typeof handler !== 'function') {
      this.warn(`"${this.propertyName}" is not a method, @Job() can only decorate methods`);

      return;
    }

    this.fRegistration = {
      strategy: consumer.strategy ?? 'default',
      queue: consumer.queue as string,
      job: this.options.name,
      handler: handler.bind(this.instance),
      concurrency: consumer.concurrency,
      options: {
        attempts: this.options.options.attempts ?? consumer.attempts,
        backoff: this.options.options.backoff ?? consumer.backoff,
        timeout: this.options.options.timeout ?? consumer.timeout,
        schema: this.options.options.schema ?? consumer.schema,
      },
      source: `${this.instance?.constructor?.name ?? 'anonymous'}.${this.propertyName}`,
    };

    this.gQueueManager.registerConsumer(this.fRegistration);
  }

  /**
   * Removes the handler again, so rebinding the consumer class does not collide
   * with the handler its previous instance registered.
   *
   * @returns {void}
   */
  public override destroyed(): void {
    if (!this.fRegistration) {
      return;
    }

    this.gQueueManager?.unregisterConsumer(this.fRegistration);
    this.fRegistration = null;
  }

  /**
   * Reports a consumer that cannot be wired up.
   *
   * @param {string} message - What is wrong
   * @returns {void}
   */
  private warn(message: string): void {
    const text = `Vercube/Queue::@Job() - ${message}`;

    if (this.gLogger) {
      this.gLogger.warn(text);

      return;
    }

    console.warn(text);
  }
}

/**
 * Declares the decorated method as the handler of a job.
 *
 * The method receives the job payload as its first argument and a
 * {@link QueueTypes.JobContext} as its second. Returning marks the job as done,
 * throwing marks the attempt as failed and hands it to the retry policy.
 *
 * Options given here override the defaults of the `@Consumer()` class.
 *
 * @param {string} name - Name of the job, as used when adding it to the queue
 * @param {QueueTypes.HandlerOptions} [options] - Retries, timeout and payload schema of this handler
 * @returns {Function} The method decorator
 *
 * @example
 * ```ts
 * @Consumer({ queue: 'emails' })
 * export class EmailConsumer {
 *   @Job('welcome')
 *   public async welcome(payload: { userId: string }): Promise<void> {
 *     await this.mailer.sendWelcome(payload.userId);
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * // three attempts with a growing delay, a validated payload and a hard time limit
 * @Job('digest', {
 *   attempts: 3,
 *   backoff: { type: 'exponential', delay: 1000 },
 *   timeout: 30_000,
 *   schema: DigestSchema,
 * })
 * public async digest(payload: Digest, context: QueueTypes.JobContext<Digest>): Promise<void> {
 *   context.logger?.info(`attempt ${context.attempt} of ${context.attempts}`);
 *   await context.updateProgress(50);
 * }
 * ```
 */
export function Job(name: string, options: QueueTypes.HandlerOptions = {}): Function {
  return createDecorator(JobDecorator, { name, options });
}
