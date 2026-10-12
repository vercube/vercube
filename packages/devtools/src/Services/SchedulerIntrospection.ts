import { Container, describeKey, Inject } from '@vercube/di';
import type { IntrospectionTypes } from '@vercube/core';

/** Most recent runs listed. */
const MAX_EVENTS = 200;

/** Outcome of a run, as `@vercube/scheduler` reports it. */
export type SchedulerOutcome =
  | 'completed'
  | 'failed'
  | 'skipped-claimed'
  | 'skipped-overlap'
  | 'skipped-paused'
  | 'aborted'
  | 'enqueued'
  | 'missed';

/** A run this replica recorded. */
export interface SchedulerRun {
  name: string;
  occurrenceId: string;
  scheduledAt: string;
  outcome: SchedulerOutcome;
  attempts: number;
  durationMs: number;
  trigger: string;
  instanceId: string;
  at: number;
  error?: { name: string; message: string; operation?: string };
}

/** The last run of a job anywhere in the cluster, as the store remembers it. */
export interface SchedulerState {
  lastScheduledAt: number;
  lastStartedAt: number;
  lastFinishedAt?: number;
  lastOutcome: SchedulerOutcome | 'running';
  lastInstance: string;
  lastError?: string;
}

/** A registered job. */
export interface SchedulerJob {
  name: string;
  source: string;
  kind: 'cron' | 'every';
  schedule: string;
  timezone?: string;
  scope: 'instance' | 'cluster';
  overlap: string;
  misfire: string;
  target: 'inline' | { queue: string; strategy?: string };
  external: boolean;
  paused: boolean;
  running: number;
  nextRun: string | null;
  lastRun?: SchedulerRun;

  /** Last run anywhere in the cluster, null when the store knows none or there is no store. */
  cluster: SchedulerState | null;
}

/** What the scheduler section reports. */
export interface SchedulerDescription {
  /** Whether a scheduler is active in this application. */
  available: boolean;

  /** Whether the timers are armed. */
  started: boolean;

  /** Id of this replica. */
  instanceId: string;

  /** The mounted store. */
  store: { name: string; distributed: boolean; status: string; error?: string } | null;

  /** Registered jobs. */
  jobs: SchedulerJob[];

  /** Recent runs on this replica, newest first. */
  events: SchedulerRun[];

  /** Why the cluster state could not be read, when it could not. */
  stateError?: string;
}

/** What running a job from the inspector answers with. */
export interface SchedulerRunResult {
  outcome?: SchedulerOutcome;
  occurrenceId?: string;
  durationMs?: number;
  error?: string;
}

/** Full picture of the scheduler, as `@vercube/scheduler` reports it. */
interface SchedulerSnapshot {
  started: boolean;
  instanceId: string;
  store: SchedulerDescription['store'];
  jobs: (Omit<SchedulerJob, 'cluster' | 'nextRun'> & { nextRun: Date | string | null })[];
  events: SchedulerRun[];
}

/** Public surface of `@vercube/scheduler`'s manager that this reads. */
interface SchedulerManagerLike {
  inspect?: () => SchedulerSnapshot;
  getStates?: (names?: string[]) => Promise<Record<string, SchedulerState | null>>;
  trigger?: (
    name: string,
  ) => Promise<{ outcome: SchedulerOutcome; occurrenceId: string; durationMs: number; error?: { message: string } }>;
}

/**
 * Describes the scheduler: which jobs run when, where their work runs, and how
 * their last runs ended, both on this replica and anywhere in the cluster.
 *
 * Runs themselves are traced by `@vercube/scheduler` as `scheduler.run` spans,
 * so they show up in Requests like every other operation. This is the
 * structural half.
 *
 * `@vercube/scheduler` is optional and devtools does not depend on it, so the
 * manager is found among the services the application has **already
 * instantiated** and read through its public `inspect()`.
 */
export class SchedulerIntrospection implements IntrospectionTypes.Provider<SchedulerDescription> {
  /** @inheritdoc */
  public readonly id = 'scheduler';

  /** @inheritdoc */
  public readonly title = 'Scheduler';

  @Inject(Container)
  private readonly gContainer!: Container;

  /** @inheritdoc */
  public revision(): number {
    // Next runs move with the clock, so the section is rebuilt on every read.
    return Date.now();
  }

  /** @inheritdoc */
  public async describe(): Promise<SchedulerDescription> {
    const manager = this.resolveLive<SchedulerManagerLike>('SchedulerManager');
    const snapshot = this.readSnapshot(manager);

    if (!manager || !snapshot) {
      return { available: false, started: false, instanceId: '', store: null, jobs: [], events: [] };
    }

    // Read only while somebody is looking: this is one store round trip per job.
    const { states, error } = await this.readStates(manager, snapshot);

    return {
      available: true,
      started: Boolean(snapshot.started),
      instanceId: snapshot.instanceId,
      store: snapshot.store ?? null,
      jobs: (snapshot.jobs ?? []).map((job) => ({
        ...job,
        nextRun: job.nextRun ? new Date(job.nextRun).toISOString() : null,
        cluster: states[job.name] ?? null,
      })),
      events: (snapshot.events ?? []).slice(0, MAX_EVENTS),
      ...(error ? { stateError: error } : {}),
    };
  }

  /**
   * Runs a job now, through the scheduler's normal pipeline: a cluster job
   * still claims its run, and a paused job is still skipped.
   *
   * @param name - Name of the job
   * @returns How the run ended, or why it could not start
   */
  public async run(name: string): Promise<SchedulerRunResult> {
    const manager = this.resolveLive<SchedulerManagerLike>('SchedulerManager');

    if (typeof manager?.trigger !== 'function') {
      return { error: 'The scheduler is not in use.' };
    }

    // Only jobs this application declared, the name comes from the client.
    if (!(this.readSnapshot(manager)?.jobs ?? []).some((job) => job.name === name)) {
      return { error: `No job is registered as "${name}".` };
    }

    try {
      const result = await manager.trigger(name);

      return {
        outcome: result.outcome,
        occurrenceId: result.occurrenceId,
        durationMs: result.durationMs,
        ...(result.error ? { error: result.error.message } : {}),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Reads what the store remembers of every job, which covers runs done by
   * other replicas.
   *
   * @param manager - The live scheduler
   * @param snapshot - What the scheduler currently holds
   * @returns The states, and why they could not be read when they could not
   */
  private async readStates(
    manager: SchedulerManagerLike,
    snapshot: SchedulerSnapshot,
  ): Promise<{ states: Record<string, SchedulerState | null>; error?: string }> {
    if (!snapshot.store || typeof manager.getStates !== 'function') {
      return { states: {} };
    }

    try {
      return { states: await manager.getStates((snapshot.jobs ?? []).map((job) => job.name)) };
    } catch (error) {
      return { states: {}, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Asks the manager what it holds, tolerating a manager that predates the
   * inspection API or fails while answering.
   *
   * @param manager - The live scheduler, when there is one
   * @returns The snapshot, or null when it cannot be read
   */
  private readSnapshot(manager: SchedulerManagerLike | null): SchedulerSnapshot | null {
    if (typeof manager?.inspect !== 'function') {
      return null;
    }

    try {
      return manager.inspect() ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Finds an already-constructed service by the name of its binding key.
   *
   * @param name - Display name of the binding key
   * @returns The instance, or null when it is not bound or not yet built
   */
  private resolveLive<T>(name: string): T | null {
    for (const [key] of this.gContainer.services) {
      if (describeKey(key) === name && this.gContainer.hasInstance(key)) {
        return this.gContainer.get<T>(key as never);
      }
    }

    return null;
  }
}
