import type { SchedulerTypes } from '../Types/SchedulerTypes';
import type { MaybePromise } from '@vercube/core';

/**
 * Base class every scheduler store implements.
 *
 * A store holds the claims that decide which replica runs an occurrence of a
 * cluster job, and remembers the last run of every job. It stays deliberately
 * small: timing, overlap, heartbeats and misfires all live in the
 * {@link SchedulerManager}, so every store behaves the same way.
 *
 * Keys are handed over without a prefix, a store adds its own.
 *
 * @typeParam InitOptions - Options the store needs to connect. Use `undefined`
 * for stores that need none.
 *
 * @example
 * ```ts
 * export class FileStore extends SchedulerStore<{ path: string }> {
 *   public readonly name = 'file';
 *
 *   public initialize(options: { path: string }): void {
 *     // open the file
 *   }
 *
 *   public async claim(key: string, owner: string, ttlMs: number): Promise<boolean> {
 *     // create the key unless someone else holds it
 *   }
 *
 *   // extend, release, getState, setState, close...
 * }
 * ```
 */
export abstract class SchedulerStore<InitOptions = undefined> {
  /**
   * Type-only marker carrying `InitOptions`, so `SchedulerTypes.Mount` can tell
   * a store that needs options from one that does not. Declared, never assigned,
   * and gone at runtime.
   *
   * @internal
   */
  declare public readonly __initOptions: InitOptions;

  /** Name of the store, such as `memory`, `redis` or `postgres`. */
  public abstract readonly name: string;

  /**
   * What the store can do. A store that is not `distributed` only coordinates
   * the managers of a single process.
   */
  public get capabilities(): SchedulerTypes.StoreCapabilities {
    return { distributed: false };
  }

  /**
   * Hands the store the clock of the manager it is mounted on. Only stores that
   * keep time themselves use it, a distributed store relies on its server's time.
   *
   * @param clock - Clock of the manager
   * @returns Nothing
   */
  public useClock(clock: SchedulerTypes.Clock): void {
    void clock;
  }

  /**
   * Connects to the backend. Called once per mount, before the first claim.
   *
   * @param options - Options the store was mounted with.
   * @returns Resolves once the store is ready.
   */
  public abstract initialize(options: InitOptions): MaybePromise<void>;

  /**
   * Atomically creates `key`, owned by `owner` for `ttlMs`, when it is absent or expired.
   *
   * @param key - Key to claim
   * @param owner - Token of the claimant
   * @param ttlMs - Lifetime of the claim
   * @returns True when this call created the claim
   */
  public abstract claim(key: string, owner: string, ttlMs: number): Promise<boolean>;

  /**
   * Extends a claim, only while `owner` still holds it.
   *
   * @param key - Claimed key
   * @param owner - Token of the claimant
   * @param ttlMs - New lifetime, counted from now
   * @returns True when the claim was extended
   */
  public abstract extend(key: string, owner: string, ttlMs: number): Promise<boolean>;

  /**
   * Deletes a claim, only while `owner` still holds it.
   *
   * @param key - Claimed key
   * @param owner - Token of the claimant
   * @returns True when the claim was deleted
   */
  public abstract release(key: string, owner: string): Promise<boolean>;

  /**
   * Reads what is known of the last run of a job.
   *
   * @param job - Name of the job
   * @returns The state, or null when the job never ran
   */
  public abstract getState(job: string): Promise<SchedulerTypes.JobState | null>;

  /**
   * Records the last run of a job.
   *
   * @param job - Name of the job
   * @param state - The state to keep
   * @returns Resolves once the state is stored
   */
  public abstract setState(job: string, state: SchedulerTypes.JobState): Promise<void>;

  /**
   * Closes every connection the store holds. Safe to call more than once.
   *
   * @returns Resolves once everything is closed
   */
  public abstract close(): Promise<void>;
}
