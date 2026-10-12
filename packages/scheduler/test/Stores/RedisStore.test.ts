import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerError } from '../../src/Errors/SchedulerError';
import { RedisStore } from '../../src/Stores/RedisStore';

const state = vi.hoisted(() => ({ clients: [] as any[] }));

/** Minimal in-memory stand-in for an ioredis client, recording every call. */
const fake = vi.hoisted(() => {
  return class FakeRedis {
    public data: Map<string, string> = new Map();
    public hashes: Map<string, Record<string, string>> = new Map();
    public url?: string;
    public options?: Record<string, unknown>;

    public connect = vi.fn(async () => undefined);
    public quit = vi.fn(async () => 'OK');

    public set = vi.fn(async (key: string, value: string, _px: string, _ttl: number, _nx: string) => {
      if (this.data.has(key)) {
        return null;
      }

      this.data.set(key, value);

      return 'OK';
    });

    public eval = vi.fn(async (script: string, _keys: number, key: string, owner: string) => {
      if (this.data.get(key) !== owner) {
        return 0;
      }

      if (script.includes("'del'")) {
        this.data.delete(key);
      }

      return 1;
    });

    public hgetall = vi.fn(async (key: string) => ({ ...this.hashes.get(key) }));

    public multi = vi.fn(() => {
      const ops: (() => void)[] = [];
      const chain = {
        del: (key: string) => {
          ops.push(() => this.hashes.delete(key));

          return chain;
        },
        hset: (key: string, fields: Record<string, string>) => {
          ops.push(() => this.hashes.set(key, { ...fields }));

          return chain;
        },
        exec: async () => {
          for (const op of ops) {
            op();
          }
        },
      };

      return chain;
    });

    constructor(url?: string, options?: Record<string, unknown>) {
      this.url = url;
      this.options = options;
    }
  };
});

vi.mock('ioredis', () => ({
  Redis: class extends fake {
    constructor(url?: string, options?: Record<string, unknown>) {
      super(url, options);
      state.clients.push(this);
    }
  },
}));

describe('RedisStore', () => {
  beforeEach(() => {
    state.clients.length = 0;
  });

  it('is named and distributed', () => {
    const store = new RedisStore();

    expect(store.name).toBe('redis');
    expect(store.capabilities.distributed).toBe(true);
  });

  it('creates and connects a lazy client from the url, and quits it on close', async () => {
    const store = new RedisStore();

    await store.initialize({ url: 'redis://cache:6379' });

    const [client] = state.clients;

    expect(client.url).toBe('redis://cache:6379');
    expect(client.options).toEqual({ lazyConnect: true });
    expect(client.connect).toHaveBeenCalled();

    await store.close();
    await store.close();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('defaults to a local Redis', async () => {
    await new RedisStore().initialize(undefined);

    expect(state.clients[0].url).toBe('redis://127.0.0.1:6379');
  });

  it('reuses a given client and never closes it', async () => {
    const client = new fake();
    const store = new RedisStore();

    await store.initialize({ client: client as never });
    await store.claim('occ:a:1', 'owner', 1000);
    await store.close();

    expect(state.clients).toEqual([]);
    expect(client.set).toHaveBeenCalled();
    expect(client.quit).not.toHaveBeenCalled();
  });

  it('claims with SET NX PX under its prefix', async () => {
    const store = new RedisStore();

    await store.initialize({ prefix: 'myapp' });

    expect(await store.claim('occ:report:1', 'pod-a', 1500.2)).toBe(true);
    expect(await store.claim('occ:report:1', 'pod-b', 1500)).toBe(false);
    expect(state.clients[0].set).toHaveBeenCalledWith('myapp:occ:report:1', 'pod-a', 'PX', 1501, 'NX');
  });

  it('extends and releases through owner-checking scripts', async () => {
    const store = new RedisStore();

    await store.initialize(undefined);
    await store.claim('active:report', 'pod-a', 1000);

    const client = state.clients[0];

    expect(await store.extend('active:report', 'pod-b', 1000)).toBe(false);
    expect(await store.extend('active:report', 'pod-a', 2000)).toBe(true);
    expect(client.eval).toHaveBeenLastCalledWith(
      expect.stringContaining('pexpire'),
      1,
      'vercube:scheduler:active:report',
      'pod-a',
      2000,
    );

    expect(await store.release('active:report', 'pod-b')).toBe(false);
    expect(await store.release('active:report', 'pod-a')).toBe(true);
    expect(client.eval).toHaveBeenLastCalledWith(expect.stringContaining("'del'"), 1, 'vercube:scheduler:active:report', 'pod-a');
  });

  it('stores the state as a hash and reads numbers back', async () => {
    const store = new RedisStore();

    await store.initialize(undefined);

    expect(await store.getState('report')).toBeNull();

    await store.setState('report', {
      lastScheduledAt: 1000,
      lastStartedAt: 1001,
      lastFinishedAt: 1002,
      lastOutcome: 'completed',
      lastInstance: 'pod-a',
    });

    expect(state.clients[0].hashes.get('vercube:scheduler:state:report')).toEqual({
      lastScheduledAt: '1000',
      lastStartedAt: '1001',
      lastFinishedAt: '1002',
      lastOutcome: 'completed',
      lastInstance: 'pod-a',
    });

    await store.setState('report', { lastScheduledAt: 2000, lastStartedAt: 2000, lastOutcome: 'running', lastInstance: 'pod-b' });

    expect(await store.getState('report')).toEqual({
      lastScheduledAt: 2000,
      lastStartedAt: 2000,
      lastOutcome: 'running',
      lastInstance: 'pod-b',
    });
  });

  it('refuses to work before it is initialized', async () => {
    await expect(new RedisStore().claim('a', 'b', 1)).rejects.toThrow(SchedulerError);
  });
});
