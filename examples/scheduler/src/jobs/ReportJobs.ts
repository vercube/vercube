import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { Every } from '@vercube/scheduler';
import type { SchedulerTypes } from '@vercube/scheduler';

export class ReportJobs {
  @Inject(Logger)
  private readonly gLogger!: Logger;

  /**
   * Cluster scoped, the default: every replica arms a timer for it, exactly one
   * of them runs each occurrence.
   */
  @Every('10s', { name: 'reports.build' })
  public async build(ctx: SchedulerTypes.JobContext): Promise<void> {
    this.gLogger.info(`[${ctx.instanceId}] built the report for ${ctx.occurrenceId}`);
  }

  /**
   * Instance scoped: every replica runs it, for work that only touches the
   * process itself.
   */
  @Every('30s', { scope: 'instance' })
  public heartbeat(ctx: SchedulerTypes.JobContext): void {
    this.gLogger.info(`[${ctx.instanceId}] still alive at ${ctx.scheduledAt.toISOString()}`);
  }
}
