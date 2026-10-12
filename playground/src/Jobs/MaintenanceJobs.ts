import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Every } from '@vercube/scheduler';
import type { SchedulerTypes } from '@vercube/scheduler';

/**
 * Example scheduled jobs. Instance scoped, so every process runs them and no
 * store is needed.
 *
 * Run one by hand with `vercube scheduler run maintenance.heartbeat`.
 */
export class MaintenanceJobs {
  @Inject(Logger)
  private readonly gLogger!: Logger;

  @Every('1m', { name: 'maintenance.heartbeat', scope: 'instance' })
  public heartbeat(ctx: SchedulerTypes.JobContext): void {
    this.gLogger.info(`Scheduler heartbeat ${ctx.occurrenceId} (${ctx.trigger})`);
  }
}
