import { SchedulerStore } from '../Services/SchedulerStore';
import { SystemClock } from '../Utils/Clock';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** Options of the {@link MemoryStore}. */
export interface MemoryStoreOptions {
  /**
   * Clock the claims expire on. Defaults to the clock of the manager the store
   * is mounted on.
   */
  clock?: SchedulerTypes.Clock;
}

/**
 * Store keeping claims and state in the memory of the process.
 *
 * It coordinates the managers of a single process only, so it is meant for
 * development, tests and deployments that really run one process. Mounted in
 * production with cluster jobs, the manager refuses to start unless
 * `allowLocalCluster` is set.
 *
 * @example
 * ```ts
 * import { MemoryStore } from '@vercube/scheduler/stores/MemoryStore';
 *
 * app.addPlugin(SchedulerPlugin, { store: { store: MemoryStore } });
 * ```
 */
export class MemoryStore extends SchedulerStore<MemoryStoreOptions | undefined> {
  /** @inheritdoc */
  public readonly name: string = 'memory';

  /** Claims, indexed by key */
  private fClaims: Map<string, { owner: string; expiresAt: number }> = new Map();

  /** Last run of every job */
  private fStates: Map<string, SchedulerTypes.JobState> = new Map();

  /** Clock the claims expire on */
  private fClock: SchedulerTypes.Clock | null = null;

  /** Whether the clock was given explicitly, which a manager's clock must not override */
  private fClockPinned: boolean = false;

  /** @inheritdoc */
  public override useClock(clock: SchedulerTypes.Clock): void {
    if (!this.fClockPinned) {
      this.fClock ??= clock;
    }
  }

  /** @inheritdoc */
  public initialize(options?: MemoryStoreOptions): void {
    if (options?.clock) {
      this.fClock = options.clock;
      this.fClockPinned = true;
    }
  }

  /** @inheritdoc */
  public async claim(key: string, owner: string, ttlMs: number): Promise<boolean> {
    if (this.holder(key)) {
      return false;
    }

    this.fClaims.set(key, { owner, expiresAt: this.now() + ttlMs });

    return true;
  }

  /** @inheritdoc */
  public async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
    if (this.holder(key) !== owner) {
      return false;
    }

    this.fClaims.set(key, { owner, expiresAt: this.now() + ttlMs });

    return true;
  }

  /** @inheritdoc */
  public async release(key: string, owner: string): Promise<boolean> {
    if (this.holder(key) !== owner) {
      return false;
    }

    return this.fClaims.delete(key);
  }

  /** @inheritdoc */
  public async getState(job: string): Promise<SchedulerTypes.JobState | null> {
    const state = this.fStates.get(job);

    return state ? { ...state } : null;
  }

  /** @inheritdoc */
  public async setState(job: string, state: SchedulerTypes.JobState): Promise<void> {
    this.fStates.set(job, { ...state });
  }

  /** @inheritdoc */
  public async close(): Promise<void> {
    // nothing to close, the data stays so a store shared by several managers survives one of them closing
  }

  /**
   * Owner of a live claim, dropping it when it has expired.
   *
   * @param key - Claimed key
   * @returns The owner, or undefined when nobody holds the key
   */
  private holder(key: string): string | undefined {
    const claim = this.fClaims.get(key);

    if (!claim) {
      return undefined;
    }

    if (claim.expiresAt <= this.now()) {
      this.fClaims.delete(key);

      return undefined;
    }

    return claim.owner;
  }

  /**
   * Current time on the store's clock.
   *
   * @returns Epoch milliseconds
   */
  private now(): number {
    return (this.fClock ?? SystemClock).now();
  }
}
