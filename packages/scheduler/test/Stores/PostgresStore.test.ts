import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { PostgresStore } from '../../src/Stores/PostgresStore';

const state = vi.hoisted(() => ({ pools: [] as any[], failCreate: false }));

vi.mock('pg', () => ({
  Pool: class {
    public options: unknown;
    public query = vi.fn(async (text: string) => {
      if (state.failCreate && text.includes('CREATE TABLE')) {
        state.failCreate = false;

        throw new Error('permission denied');
      }

      return { rows: [], rowCount: 0 };
    });
    public end = vi.fn(async () => undefined);

    constructor(options: unknown) {
      this.options = options;
      state.pools.push(this);
    }
  },
}));

/** A pool given to the store, answering every query with `result`. */
function givenPool(result?: { rows: any[]; rowCount: number | null }) {
  const answer = result ?? { rows: [], rowCount: 0 };

  return {
    query: vi.fn(async (_text: string, _values?: unknown[]) => answer),
    end: vi.fn(async () => undefined),
  };
}

/** Collapses the whitespace of a query, so assertions read on one line. */
const sql = (text: string): string => text.replaceAll(/\s+/g, ' ').trim();

describe('PostgresStore', () => {
  beforeEach(() => {
    state.pools.length = 0;
    state.failCreate = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is named and distributed', () => {
    const store = new PostgresStore();

    expect(store.name).toBe('postgres');
    expect(store.capabilities.distributed).toBe(true);
  });

  it('creates its pool and tables, and closes the pool it created', async () => {
    const store = new PostgresStore();

    await store.initialize({ connectionString: 'postgres://db/app' });

    const [pool] = state.pools;

    expect(pool.options).toEqual({ connectionString: 'postgres://db/app' });
    expect(sql(pool.query.mock.calls[0][0])).toContain('CREATE TABLE IF NOT EXISTS "vercube_scheduler_locks"');
    expect(sql(pool.query.mock.calls[1][0])).toContain('CREATE TABLE IF NOT EXISTS "vercube_scheduler_state"');

    await store.close();
    await store.close();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('uses a given pool, schema and table prefix, leaving the tables to migrations when asked', async () => {
    const pool = givenPool({ rows: [], rowCount: 1 });
    const store = new PostgresStore();

    await store.initialize({ pool, schema: 'ops', tablePrefix: 'jobs', createTables: false });
    await store.claim('occ:a:1', 'pod-a', 1000);
    await store.close();

    expect(state.pools).toEqual([]);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(sql(pool.query.mock.calls[0][0])).toContain('INSERT INTO "ops"."jobs_locks"');
    expect(pool.end).not.toHaveBeenCalled();
  });

  it('quotes identifiers', async () => {
    const pool = givenPool();

    await new PostgresStore().initialize({ pool, tablePrefix: 'x"y', createTables: false });
    await new PostgresStore().initialize({ pool, tablePrefix: 'x"y' });

    expect(sql(pool.query.mock.calls[0][0])).toContain('"x""y_locks"');
  });

  it('claims, extends and releases on database time, by rows affected', async () => {
    const pool = givenPool({ rows: [{ key: 'k' }], rowCount: 1 });
    const store = new PostgresStore();

    await store.initialize({ pool, createTables: false });

    expect(await store.claim('occ:a:1', 'pod-a', 1500.5)).toBe(true);
    expect(sql(pool.query.mock.calls[0][0])).toContain(
      'VALUES ($1, $2, now() + $3 * interval \'1 millisecond\') ON CONFLICT (key) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at WHERE "vercube_scheduler_locks".expires_at <= now() RETURNING key',
    );
    expect(pool.query.mock.calls[0][1]).toEqual(['occ:a:1', 'pod-a', 1501]);

    expect(await store.extend('active:a', 'pod-a', 30_000)).toBe(true);
    expect(sql(pool.query.mock.calls[1][0])).toContain('WHERE key = $1 AND owner = $2 AND expires_at > now()');

    expect(await store.release('active:a', 'pod-a')).toBe(true);
    expect(sql(pool.query.mock.calls[2][0])).toContain('DELETE FROM "vercube_scheduler_locks" WHERE key = $1 AND owner = $2');

    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

    expect(await store.claim('occ:a:1', 'pod-b', 1000)).toBe(false);
    expect(await store.extend('active:a', 'pod-b', 1000)).toBe(false);
    expect(await store.release('active:a', 'pod-b')).toBe(false);

    pool.query.mockResolvedValue({ rows: [], rowCount: null });
    expect(await store.claim('occ:a:1', 'pod-b', 1000)).toBe(false);
  });

  it('writes the state as epoch milliseconds and reads it back', async () => {
    const pool = givenPool();
    const store = new PostgresStore();

    await store.initialize({ pool, createTables: false });
    await store.setState('report', { lastScheduledAt: 1000, lastStartedAt: 1001, lastOutcome: 'running', lastInstance: 'pod-a' });

    expect(sql(pool.query.mock.calls[0][0])).toContain('to_timestamp($2::float8 / 1000)');
    expect(pool.query.mock.calls[0][1]).toEqual(['report', 1000, 1001, null, 'running', 'pod-a', null]);

    pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await store.getState('missing')).toBeNull();

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          last_scheduled_at: new Date(1000),
          last_started_at: new Date(1001),
          last_finished_at: new Date(1002),
          last_outcome: 'failed',
          last_instance: 'pod-a',
          last_error: 'boom',
        },
      ],
      rowCount: 1,
    });
    expect(await store.getState('report')).toEqual({
      lastScheduledAt: 1000,
      lastStartedAt: 1001,
      lastFinishedAt: 1002,
      lastOutcome: 'failed',
      lastInstance: 'pod-a',
      lastError: 'boom',
    });

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          last_scheduled_at: new Date(1000),
          last_started_at: new Date(1000),
          last_finished_at: null,
          last_outcome: 'running',
          last_instance: 'pod-a',
          last_error: null,
        },
      ],
      rowCount: 1,
    });
    expect(await store.getState('report')).toEqual({
      lastScheduledAt: 1000,
      lastStartedAt: 1000,
      lastOutcome: 'running',
      lastInstance: 'pod-a',
    });
  });

  it('deletes long expired claims every ten minutes, ignoring failures', async () => {
    vi.useFakeTimers();

    const pool = givenPool();
    const store = new PostgresStore();

    await store.initialize({ pool, createTables: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(sql(pool.query.mock.calls[0][0])).toBe(
      `DELETE FROM "vercube_scheduler_locks" WHERE expires_at < now() - interval '1 hour'`,
    );

    pool.query.mockRejectedValueOnce(new Error('down'));
    await expect(store.housekeeping()).resolves.toBeUndefined();

    await store.close();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('closes the pool it created when creating the tables fails, and starts over on retry', async () => {
    const store = new PostgresStore();

    state.failCreate = true;
    await expect(store.initialize({ connectionString: 'postgres://db/app' })).rejects.toThrow('permission denied');

    expect(state.pools[0].end).toHaveBeenCalledTimes(1);
    await expect(store.claim('a', 'b', 1)).rejects.toThrow(SchedulerError);

    await store.initialize({ connectionString: 'postgres://db/app' });
    await store.initialize({ connectionString: 'postgres://db/app' });

    expect(state.pools).toHaveLength(3);
    expect(state.pools[1].end).toHaveBeenCalledTimes(1);
    await store.close();
  });

  it('creates the tables under an advisory lock on one connection', async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (text: string, _values?: unknown[]) => {
        queries.push(sql(text));

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { ...givenPool(), connect: vi.fn(async () => client) };

    await new PostgresStore().initialize({ pool });

    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toBe('SELECT pg_advisory_xact_lock(hashtext($1))');
    expect(client.query.mock.calls[1][1]).toEqual(['"vercube_scheduler_locks"']);
    expect(queries[2]).toContain('CREATE TABLE IF NOT EXISTS "vercube_scheduler_locks"');
    expect(queries[3]).toContain('CREATE TABLE IF NOT EXISTS "vercube_scheduler_state"');
    expect(queries[4]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rolls back and releases the connection when creating the tables fails', async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes('CREATE TABLE')) {
          throw Object.assign(new Error('permission denied'), { code: '42501' });
        }

        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { ...givenPool(), connect: vi.fn(async () => client) };

    await expect(new PostgresStore().initialize({ pool })).rejects.toThrow('permission denied');
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('takes a table created concurrently by another replica as created', async () => {
    const pool = givenPool();

    pool.query.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
    );
    pool.query.mockRejectedValueOnce(Object.assign(new Error('relation already exists'), { code: '42P07' }));

    await expect(new PostgresStore().initialize({ pool })).resolves.toBeUndefined();
  });

  it('refuses to work before it is initialized', async () => {
    await expect(new PostgresStore().claim('a', 'b', 1)).rejects.toThrow(SchedulerError);
  });
});
