import type { SchedulerManager } from '../Services/SchedulerManager';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** Outcomes a CLI run treats as a success. */
const SUCCESSFUL: Set<SchedulerTypes.RunOutcome> = new Set([
  'completed',
  'enqueued',
  'skipped-claimed',
  'skipped-overlap',
  'skipped-paused',
]);

/**
 * Describes every job of a manager as table rows.
 *
 * @param manager - The manager to list
 * @returns A header row followed by one row per job
 */
export function listJobs(manager: SchedulerManager): string[][] {
  const rows = [['NAME', 'SCHEDULE', 'TIMEZONE', 'SCOPE', 'TARGET', 'NEXT RUNS']];

  for (const job of manager.list()) {
    const target = job.target === 'inline' ? 'inline' : `queue:${job.target.queue}`;
    const next = job.external
      ? 'external only'
      : manager
          .nextRuns(job.name, 3)
          .map((date) => date.toISOString())
          .join(', ');

    rows.push([job.name, job.schedule, job.timezone ?? '-', job.scope, target, next || '-']);
  }

  return rows;
}

/**
 * Runs a job once for an external trigger, claiming the occurrence its schedule
 * is at, so two triggers of the same occurrence run it once across the cluster.
 *
 * @param manager - The manager running the job
 * @param name - Job to run
 * @param force - Skip the occurrence claim
 * @returns How the run ended, and the exit code a CLI should end with
 */
export async function runJob(
  manager: SchedulerManager,
  name: string,
  force: boolean = false,
): Promise<{ result: SchedulerTypes.RunResult; exitCode: number }> {
  const scheduledAt = manager.currentOccurrence(name) ?? undefined;
  const result = await manager.trigger(name, { source: 'external', force, ...(scheduledAt ? { scheduledAt } : {}) });

  return { result, exitCode: SUCCESSFUL.has(result.outcome) ? 0 : 1 };
}

/**
 * Lays rows out as an aligned text table.
 *
 * @param rows - Rows, the first one being the header
 * @returns The table, one line per row
 */
export function formatTable(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));

  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}
