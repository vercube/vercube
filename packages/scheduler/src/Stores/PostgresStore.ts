import { Pool } from 'pg';
import { SchedulerError } from '../Errors/SchedulerError';
import { SchedulerStore } from '../Services/SchedulerStore';
import type { SchedulerTypes } from '../Types/SchedulerTypes';

/** What the store needs from a `pg` pool, so any compatible pool fits. */
export interface PostgresQueryable {
  /** Runs a parameterized query. */
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;

  /** Closes the pool. */
  end?(): Promise<void>;
}

/** Options of the {@link PostgresStore}. */
export interface PostgresStoreOptions {
  /** Connection string, such as `postgres://user:pass@localhost:5432/app`. Ignored when `pool` is given. */
  connectionString?: string;

  /** An existing pool. The store never closes a pool it was given. */
  pool?: PostgresQueryable;

  /** Schema holding the tables, the connection's search path when not set. */
  schema?: string;

  /**
   * Prefix of the two tables, which are named `<prefix>_locks` and `<prefix>_state`.
   * @default 'vercube_scheduler'
   */
  tablePrefix?: string;

  /**
   * Create the tables when they do not exist yet. Turn it off when migrations own the schema.
   * @default true
   */
  createTables?: boolean;
}

/** How often expired claims are deleted. */
const HOUSEKEEPING_INTERVAL = 10 * 60_000;

/**
 * Store keeping claims and state in PostgreSQL tables.
 *
 * Claims live in a table rather than in advisory locks: an advisory lock belongs
 * to a session, which breaks behind a connection pool, and a table holds the
 * state of every job as well.
 *
 * Every expiry is computed with the database's `now()`, never the application's
 * clock, so pods whose clocks drift apart still agree on when a claim expires.
 * Expired claims are deleted every ten minutes, by whichever replicas happen to
 * run the cleanup.
 *
 * Requires the optional `pg` dependency.
 *
 * @example
 * ```ts
 * import { PostgresStore } from '@vercube/scheduler/stores/PostgresStore';
 *
 * app.addPlugin(SchedulerPlugin, {
 *   store: { store: PostgresStore, initOptions: { connectionString: process.env.DATABASE_URL } },
 * });
 * ```
 *
 * @example
 * ```sql
 * -- the tables, for teams whose migrations own the schema (createTables: false)
 * CREATE TABLE vercube_scheduler_locks (
 *   key        text PRIMARY KEY,
 *   owner      text NOT NULL,
 *   expires_at timestamptz NOT NULL
 * );
 * CREATE TABLE vercube_scheduler_state (
 *   job                text PRIMARY KEY,
 *   last_scheduled_at  timestamptz NOT NULL,
 *   last_started_at    timestamptz NOT NULL,
 *   last_finished_at   timestamptz,
 *   last_outcome       text NOT NULL,
 *   last_instance      text NOT NULL,
 *   last_error         text
 * );
 * ```
 */
export class PostgresStore extends SchedulerStore<PostgresStoreOptions | undefined> {
  /** @inheritdoc */
  public readonly name: string = 'postgres';

  /** Pool the store talks to */
  private fPool: PostgresQueryable | null = null;

  /** Whether the store created the pool, and therefore has to close it */
  private fOwnsPool: boolean = false;

  /** Qualified, quoted name of the claims table */
  private fLocks: string = '';

  /** Qualified, quoted name of the state table */
  private fState: string = '';

  /** Timer of the periodic cleanup */
  private fHousekeeping: ReturnType<typeof setInterval> | null = null;

  /** @inheritdoc */
  public override get capabilities(): SchedulerTypes.StoreCapabilities {
    return { distributed: true };
  }

  /** @inheritdoc */
  public async initialize(options?: PostgresStoreOptions): Promise<void> {
    // a retried initialization starts from scratch
    await this.close();

    const prefix = options?.tablePrefix ?? 'vercube_scheduler';
    const qualify = (table: string): string => (options?.schema ? `${quote(options.schema)}.${quote(table)}` : quote(table));

    this.fLocks = qualify(`${prefix}_locks`);
    this.fState = qualify(`${prefix}_state`);

    if (options?.pool) {
      this.fPool = options.pool;
      this.fOwnsPool = false;
    } else {
      this.fPool = new Pool({ connectionString: options?.connectionString }) as unknown as PostgresQueryable;
      this.fOwnsPool = true;
    }

    if (options?.createTables ?? true) {
      try {
        await this.createTables();
      } catch (error) {
        // the manager retries initialization, so a failed pool must not linger
        await this.close();

        throw error;
      }
    }

    this.fHousekeeping = setInterval(() => void this.housekeeping(), HOUSEKEEPING_INTERVAL);
    this.fHousekeeping.unref?.();
  }

  /**
   * Creates both tables when they do not exist yet.
   *
   * @returns Resolves once both exist
   */
  private async createTables(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.fLocks} (
        key        text PRIMARY KEY,
        owner      text NOT NULL,
        expires_at timestamptz NOT NULL
      )`,
    );
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.fState} (
        job                text PRIMARY KEY,
        last_scheduled_at  timestamptz NOT NULL,
        last_started_at    timestamptz NOT NULL,
        last_finished_at   timestamptz,
        last_outcome       text NOT NULL,
        last_instance      text NOT NULL,
        last_error         text
      )`,
    );
  }

  /** @inheritdoc */
  public async claim(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO ${this.fLocks} (key, owner, expires_at)
       VALUES ($1, $2, now() + $3 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
       WHERE ${this.fLocks}.expires_at <= now()
       RETURNING key`,
      [key, owner, Math.ceil(ttlMs)],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /** @inheritdoc */
  public async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.fLocks} SET expires_at = now() + $3 * interval '1 millisecond'
       WHERE key = $1 AND owner = $2 AND expires_at > now()`,
      [key, owner, Math.ceil(ttlMs)],
    );

    return (result.rowCount ?? 0) > 0;
  }

  /** @inheritdoc */
  public async release(key: string, owner: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM ${this.fLocks} WHERE key = $1 AND owner = $2 AND expires_at > now()`, [
      key,
      owner,
    ]);

    return (result.rowCount ?? 0) > 0;
  }

  /** @inheritdoc */
  public async getState(job: string): Promise<SchedulerTypes.JobState | null> {
    const { rows } = await this.pool.query(
      `SELECT last_scheduled_at, last_started_at, last_finished_at, last_outcome, last_instance, last_error
       FROM ${this.fState} WHERE job = $1`,
      [job],
    );
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      lastScheduledAt: new Date(row.last_scheduled_at).getTime(),
      lastStartedAt: new Date(row.last_started_at).getTime(),
      ...(row.last_finished_at ? { lastFinishedAt: new Date(row.last_finished_at).getTime() } : {}),
      lastOutcome: row.last_outcome,
      lastInstance: row.last_instance,
      ...(row.last_error === null || row.last_error === undefined ? {} : { lastError: row.last_error }),
    };
  }

  /** @inheritdoc */
  public async setState(job: string, state: SchedulerTypes.JobState): Promise<void> {
    // instants travel as epoch milliseconds, so the session time zone cannot shift them
    await this.pool.query(
      `INSERT INTO ${this.fState}
         (job, last_scheduled_at, last_started_at, last_finished_at, last_outcome, last_instance, last_error)
       VALUES ($1, to_timestamp($2::float8 / 1000), to_timestamp($3::float8 / 1000), to_timestamp($4::float8 / 1000), $5, $6, $7)
       ON CONFLICT (job) DO UPDATE SET
         last_scheduled_at = EXCLUDED.last_scheduled_at,
         last_started_at = EXCLUDED.last_started_at,
         last_finished_at = EXCLUDED.last_finished_at,
         last_outcome = EXCLUDED.last_outcome,
         last_instance = EXCLUDED.last_instance,
         last_error = EXCLUDED.last_error`,
      [
        job,
        state.lastScheduledAt,
        state.lastStartedAt,
        state.lastFinishedAt ?? null,
        state.lastOutcome,
        state.lastInstance,
        state.lastError ?? null,
      ],
    );
  }

  /** @inheritdoc */
  public async close(): Promise<void> {
    if (this.fHousekeeping) {
      clearInterval(this.fHousekeeping);
      this.fHousekeeping = null;
    }

    const pool = this.fPool;

    this.fPool = null;

    if (pool && this.fOwnsPool) {
      await pool.end?.();
    }
  }

  /**
   * Deletes claims that expired more than an hour ago. Occurrence claims are
   * never released, so without this the table would only grow. Failures are
   * ignored, the next round or another replica tries again.
   *
   * @returns Resolves once the cleanup ran
   */
  public async housekeeping(): Promise<void> {
    try {
      await this.fPool?.query(`DELETE FROM ${this.fLocks} WHERE expires_at < now() - interval '1 hour'`);
    } catch {
      // harmless, it only keeps the table small
    }
  }

  /**
   * The pool, once the store is initialized.
   *
   * @returns The pool
   * @throws {SchedulerError} When the store is used before it was initialized
   */
  private get pool(): PostgresQueryable {
    if (!this.fPool) {
      throw new SchedulerError('PostgresStore is not initialized', 'store', undefined, undefined, false);
    }

    return this.fPool;
  }
}

/**
 * Quotes an SQL identifier.
 *
 * @param identifier - Schema or table name
 * @returns The identifier, safe to put in a query
 */
function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
