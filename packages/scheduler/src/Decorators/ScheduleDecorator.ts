import { BaseDecorator, InjectOptional } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { SchedulerManager } from '../Services/SchedulerManager';
import { markGeneratedName } from '../Utils/Metadata';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** Options the `@Cron()` and `@Every()` decorators are created with. */
export interface ScheduleDecoratorOptions {
  /** Name of the decorator, for warnings. */
  decorator: '@Cron()' | '@Every()';

  /** When the job runs. */
  schedule: SchedulerTypes.ScheduleDefinition;

  /** Options of the job. */
  options: SchedulerTypes.JobOptions;
}

/**
 * Registers the decorated method as a scheduled job.
 * Runs when the container instantiates the class.
 */
export class ScheduleDecorator extends BaseDecorator<ScheduleDecoratorOptions> {
  /** Scheduler the job is registered with */
  @InjectOptional(SchedulerManager)
  private gScheduler!: SchedulerManager | null;

  /** Logger instance */
  @InjectOptional(Logger)
  private gLogger!: Logger | null;

  /** Name the job was registered under, kept so it can be removed again */
  private fName: string | null = null;

  /**
   * Registers the job with the scheduler.
   *
   * @returns {void}
   * @throws {SchedulerError} When the schedule or an option is invalid, or the name is taken
   */
  public override created(): void {
    if (!this.gScheduler) {
      this.warn('SchedulerManager is not bound in the container, the job will never run. Did you add SchedulerPlugin?');

      return;
    }

    const handler = this.instance[this.propertyName];

    if (typeof handler !== 'function') {
      this.warn(`"${this.propertyName}" is not a method, ${this.options.decorator} can only decorate methods`);

      return;
    }

    const source = `${this.instance?.constructor?.name ?? 'anonymous'}.${this.propertyName}`;
    const { name, ...options } = this.options.options;

    const definition: SchedulerTypes.JobDefinition = {
      ...options,
      name: name ?? source,
      schedule: this.options.schedule,
      handler: handler.bind(this.instance),
      source,
    };

    this.gScheduler.add(name ? definition : markGeneratedName(definition));

    this.fName = name ?? source;
  }

  /**
   * Removes the job again, so rebinding the class does not collide with the job
   * its previous instance registered.
   *
   * @returns {void}
   */
  public override destroyed(): void {
    if (!this.fName) {
      return;
    }

    this.gScheduler?.remove(this.fName);
    this.fName = null;
  }

  /**
   * Reports a job that cannot be wired up.
   *
   * @param {string} message - What is wrong
   * @returns {void}
   */
  private warn(message: string): void {
    const text = `Vercube/Scheduler::${this.options.decorator} - ${message}`;

    if (this.gLogger) {
      this.gLogger.warn(text);

      return;
    }

    console.warn(text);
  }
}
