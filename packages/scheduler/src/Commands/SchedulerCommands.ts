/* eslint-disable unicorn/no-process-exit */
// The application imported to run a job may hold open handles of its own,
// database pools or queue connections, and a CronJob pod that never exits is
// worse than a hard exit once the scheduler is closed.
import { Arg, BaseCommand, Command, Flag } from '@vercube/cli/toolkit';
import { formatTable, listJobs, runJob } from './Actions';
import { loadScheduler } from './Loader';

/**
 * Lists the jobs of the application with their next runs.
 *
 * @example
 * ```sh
 * vercube scheduler list
 * ```
 */
@Command({ name: 'list', description: 'List scheduled jobs and their next runs' })
export class SchedulerListCommand extends BaseCommand {
  /** Built entry of the application. */
  @Flag({ name: 'entry', description: 'Built entry of the application', default: 'dist/index.mjs' })
  public entry!: string;

  /** Build the application first. */
  @Flag({ name: 'build', description: 'Build the application first', default: false })
  public build!: boolean;

  /**
   * @returns Resolves once the table is printed
   */
  public override async run(): Promise<void> {
    const manager = await loadScheduler({ cwd: process.cwd(), entry: this.entry, build: this.build });

    console.log(formatTable(listJobs(manager)));

    await manager.close();
    process.exit(0);
  }
}

/**
 * Runs one job now, through the same claim as its timer, for a Kubernetes
 * CronJob or any other external scheduler. Exits with 0 when the job completed,
 * was enqueued or was skipped because another replica has it, 1 when it failed.
 *
 * @example
 * ```sh
 * vercube scheduler run billing.close-day
 * vercube scheduler run billing.close-day --force
 * ```
 */
@Command({ name: 'run', description: 'Run a scheduled job now' })
export class SchedulerRunCommand extends BaseCommand {
  /** Job to run. */
  @Arg({ name: 'name', description: 'Name of the job', required: true })
  public name!: string;

  /** Skip the occurrence claim. */
  @Flag({ name: 'force', description: 'Run even when the occurrence was already claimed', default: false })
  public force!: boolean;

  /** Built entry of the application. */
  @Flag({ name: 'entry', description: 'Built entry of the application', default: 'dist/index.mjs' })
  public entry!: string;

  /** Build the application first. */
  @Flag({ name: 'build', description: 'Build the application first', default: false })
  public build!: boolean;

  /**
   * @returns Resolves once the job ran, before the process exits with its outcome
   */
  public override async run(): Promise<void> {
    const manager = await loadScheduler({ cwd: process.cwd(), entry: this.entry, build: this.build });
    const { result, exitCode } = await runJob(manager, this.name, this.force);

    console.log(JSON.stringify(result));

    await manager.close();
    process.exit(exitCode);
  }
}

/**
 * Groups the scheduler commands under `vercube scheduler`.
 */
@Command({
  name: 'scheduler',
  description: 'Inspect and run scheduled jobs',
  subCommands: [SchedulerListCommand, SchedulerRunCommand],
})
export class SchedulerCommand extends BaseCommand {
  /**
   * Prints nothing, citty shows the help of the subcommands.
   *
   * @returns Resolves immediately
   */
  public override async run(): Promise<void> {}
}
