import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisStorage } from '../src/Drivers/RedisStorage';
import { StorageError } from '../src/Errors/StorageError';

const state = vi.hoisted(() => ({
  clients: [] as any[],
  failNextConnect: false,
}));

/** Minimal in-memory stand-in for an ioredis client, recording every call. */
const fake = vi.hoisted(() => {
  return class FakeRedis {
    public data: Map<string, string> = new Map();
    public ttls: Map<string, number> = new Map();
    public url?: string;
    public options?: Record<string, unknown>;

    public connect = vi.fn(async () => {
      if (state.failNextConnect) {
        state.failNextConnect = false;

        throw new Error('ECONNREFUSED');
      }
    });

    public disconnect = vi.fn();
    public quit = vi.fn(async () => 'OK');
    public ping = vi.fn(async () => 'PONG');

    public get = vi.fn(async (key: string) => this.data.get(key) ?? null);
    public mget = vi.fn(async (...keys: string[]) => keys.map((key) => this.data.get(key) ?? null));
    public exists = vi.fn(async (key: string) => (this.data.has(key) ? 1 : 0));

    public set = vi.fn(async (key: string, value: string, mode?: string, ttl?: number) => {
      this.data.set(key, value);

      if (mode === 'PX') {
        this.ttls.set(key, ttl!);
      } else {
        this.ttls.delete(key);
      }

      return 'OK';
    });

    public del = vi.fn(async (key: string) => {
      this.ttls.delete(key);

      return this.data.delete(key) ? 1 : 0;
    });

    /** Runs the increment script the way Redis would. */
    public eval = vi.fn(async (_script: string, _keys: number, key: string, by: number, ttl: number) => {
      const value = Number(this.data.get(key) ?? 0) + Number(by);

      this.data.set(key, String(value));

      if (Number(ttl) > 0 && !this.ttls.has(key)) {
        this.ttls.set(key, Number(ttl));
      }

      return value;
    });

    /** Returns the matching keys over two pages, like a real cursor would. */
    public scan = vi.fn(async (cursor: string, _match: string, pattern: string) => {
      const prefix = pattern.slice(0, -1).replaceAll('\\', '');
      const keys = [...this.data.keys()].filter((key) => key.startsWith(prefix));
      const half = Math.ceil(keys.length / 2);

      return cursor === '0' ? [keys.length > half ? '1' : '0', keys.slice(0, half)] : ['0', keys.slice(half)];
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

/** Builds an initialized storage and its fake client. */
async function create(prefix?: string): Promise<{ storage: RedisStorage; client: InstanceType<typeof fake> }> {
  const storage = new RedisStorage();

  await storage.initialize(prefix ? { prefix } : undefined);

  return { storage, client: state.clients.at(-1) };
}

describe('RedisStorage', () => {
  beforeEach(() => {
    state.clients.length = 0;
    state.failNextConnect = false;
  });

  it('should create and connect a lazy client from the url, and quit it once on close', async () => {
    const storage = new RedisStorage();

    await storage.initialize({ url: 'redis://cache:6379' });

    const [client] = state.clients;

    expect(client.url).toBe('redis://cache:6379');
    expect(client.options).toEqual({ lazyConnect: true });
    expect(client.connect).toHaveBeenCalled();
    expect(storage.client).toBe(client);

    await storage.close();
    await storage.close();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('should default to a local Redis', async () => {
    await create();

    expect(state.clients[0].url).toBe('redis://127.0.0.1:6379');
  });

  it('should disconnect a client that failed to connect and rethrow', async () => {
    state.failNextConnect = true;

    await expect(new RedisStorage().initialize(undefined)).rejects.toThrow('ECONNREFUSED');
    expect(state.clients[0].disconnect).toHaveBeenCalled();
  });

  it('should never close a client it was given', async () => {
    const client = new fake();
    const storage = new RedisStorage();

    await storage.initialize({ client: client as never });
    await storage.close();

    expect(client.connect).not.toHaveBeenCalled();
    expect(client.quit).not.toHaveBeenCalled();
  });

  it('should fail loudly when used before it was initialized', async () => {
    await expect(new RedisStorage().getItem('key')).rejects.toThrow(StorageError);
  });

  it('should store values as JSON under the prefix', async () => {
    const { storage, client } = await create('app');

    await storage.setItem('user', { id: 1 });

    expect(client.data.get('app:user')).toBe('{"id":1}');
    expect(await storage.getItem('user')).toEqual({ id: 1 });
    expect(await storage.getItem('missing')).toBeNull();
    expect(await storage.hasItem('user')).toBe(true);
    expect(await storage.hasItem('missing')).toBe(false);
  });

  it('should return a value another client wrote as plain text', async () => {
    const { storage, client } = await create();

    client.data.set('vercube:storage:raw', 'not json');

    expect(await storage.getItem('raw')).toBe('not json');
  });

  it('should expire a value written with a ttl, in milliseconds', async () => {
    const { storage, client } = await create();

    await storage.setItem('session', 'x', { ttl: 1.5 });
    await storage.setItem('forever', 'y', { ttl: 0 });

    expect(client.set).toHaveBeenNthCalledWith(1, 'vercube:storage:session', '"x"', 'PX', 1500);
    expect(client.set).toHaveBeenNthCalledWith(2, 'vercube:storage:forever', '"y"');
  });

  it('should delete the key when the value is undefined', async () => {
    const { storage, client } = await create();

    await storage.setItem('key', 1);
    await storage.setItem('key', undefined);

    expect(client.data.has('vercube:storage:key')).toBe(false);
  });

  it('should read several values in one round trip', async () => {
    const { storage, client } = await create();

    await storage.setItem('a', 1);
    await storage.setItem('b', 2);

    expect(await storage.getItems(['a', 'missing', 'b'])).toEqual([1, null, 2]);
    expect(client.mget).toHaveBeenCalledTimes(1);
    expect(await storage.getItems([])).toEqual([]);
  });

  it('should increment with one script call that also sets the expiry', async () => {
    const { storage, client } = await create();

    expect(await storage.increment('hits', { ttl: 60 })).toBe(1);
    expect(await storage.increment('hits', { by: 4 })).toBe(5);
    expect(await storage.increment('other')).toBe(1);

    expect(client.eval).toHaveBeenNthCalledWith(1, expect.stringContaining('incrby'), 1, 'vercube:storage:hits', 1, 60_000);
    expect(client.eval).toHaveBeenNthCalledWith(2, expect.any(String), 1, 'vercube:storage:hits', 4, 0);
    expect(client.ttls.get('vercube:storage:hits')).toBe(60_000);
    expect(await storage.getItem('hits')).toBe(5);
  });

  it('should list, count and clear only the keys under its prefix', async () => {
    const { storage, client } = await create('app');

    client.data.set('someone-else', '1');
    await storage.setItem('a', 1);
    await storage.setItem('b', 2);
    await storage.setItem('c', 3);

    expect((await storage.getKeys()).toSorted()).toEqual(['a', 'b', 'c']);
    expect(await storage.getKeys({ limit: 2 })).toHaveLength(2);
    expect(await storage.size()).toBe(3);
    expect(storage.cheapSize).toBe(false);

    await storage.clear();

    expect(await storage.size()).toBe(0);
    expect(client.data.get('someone-else')).toBe('1');
  });

  it('should escape glob characters of the prefix when scanning', async () => {
    const { storage, client } = await create('a*b');

    await storage.getKeys();

    expect(client.scan).toHaveBeenCalledWith('0', 'MATCH', String.raw`a\*b:*`, 'COUNT', 500);
  });

  it('should scan every master of a cluster', async () => {
    const first = new fake();
    const second = new fake();
    const cluster = { nodes: vi.fn(() => [first, second]) };

    first.data.set('vercube:storage:a', '1');
    second.data.set('vercube:storage:b', '2');

    const storage = new RedisStorage();
    await storage.initialize({ client: cluster as never });

    expect((await storage.getKeys()).toSorted()).toEqual(['a', 'b']);
    expect(cluster.nodes).toHaveBeenCalledWith('master');
  });

  it('should ping Redis, and fail when it does not answer', async () => {
    const { storage, client } = await create();

    await storage.ping();
    expect(client.ping).toHaveBeenCalledOnce();

    client.ping.mockRejectedValueOnce(new Error('Connection is closed.'));
    await expect(storage.ping()).rejects.toThrow('Connection is closed.');
  });
});
