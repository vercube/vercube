import { BaseDecorator, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { QueueManager } from '../Services/QueueManager';
import { getConsumerOptions } from '../Utils/Metadata';
import type { QueueTypes } from '../Types/QueueTypes';

/** Options a job hook decorator is created with. */
export interface JobHookDecoratorOptions {
  /** Lifecycle event the method listens to. */
  event: 'completed' | 'failed';

  /** Job the hook is limited to, or undefined for every job of the queue. */
  job?: string;
}

/**
 * Registers the decorated method as a lifecycle hook of the queue its
 * `@Consumer()` class reads from. Shared by `@OnJobCompleted()` and `@OnJobFailed()`.
 */
export class JobHookDecorator extends BaseDecorator<JobHookDecoratorOptions> {
  /** Queue manager the hook is registered with */
  @InjectOptional(QueueManager)
  private gQueueManager!: QueueManager | null;

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** The registration handed to the manager, kept so it can be removed again */
  private fRegistration: QueueTypes.HookRegistration | null = null;

  /**
   * Registers the hook with the queue manager.
   *
   * @returns {void}
   */
  public override created(): void {
    const consumer = getConsumerOptions(this.prototype);
    const hook = this.instance[this.propertyName];

    if (!this.gQueueManager) {
      this.warn('QueueManager is not bound in the container, no job hook will run');

      return;
    }

    if (!consumer) {
      this.warn(`Unable to find the queue of "${this.propertyName}". Did you use @Consumer()?`);

      return;
    }

    if (typeof hook !== 'function') {
      this.warn(`"${this.propertyName}" is not a method, a job hook can only decorate methods`);

      return;
    }

    this.fRegistration = {
      strategy: consumer.strategy ?? 'default',
      queue: consumer.queue as string,
      job: this.options.job,
      hook: hook.bind(this.instance),
      source: `${this.instance?.constructor?.name ?? 'anonymous'}.${this.propertyName}`,
    };

    this.gQueueManager.registerHook(this.options.event, this.fRegistration);
  }

  /**
   * Removes the hook again when the container is torn down.
   *
   * @returns {void}
   */
  public override destroyed(): void {
    if (!this.fRegistration) {
      return;
    }

    this.gQueueManager?.unregisterHook(this.options.event, this.fRegistration);
    this.fRegistration = null;
  }

  /**
   * Reports a hook that cannot be wired up.
   *
   * @param {string} message - What is wrong
   * @returns {void}
   */
  private warn(message: string): void {
    const text = `Vercube/Queue::Job hook - ${message}`;

    if (this.gLogger) {
      this.gLogger.warn(text);

      return;
    }

    console.warn(text);
  }
}
