import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisStorage } from '../src/Drivers/RedisStorage';

/**
 * Runs against a real Redis when `REDIS_URL` is set, for example:
 * `docker run --rm -p 6379:6379 redis:7-alpine` and `REDIS_URL=redis://127.0.0.1:6379 pnpm test`.
 */
const url = process.env.REDIS_URL;

describe.skipIf(!url)('RedisStorage against Redis', () => {
  const prefix = `vercube:storage:test:${crypto.randomUUID()}`;
  const storage = new RedisStorage();
  const other = new RedisStorage();

  beforeAll(async () => {
    await storage.initialize({ url, prefix });
    await other.initialize({ url, prefix });
  });

  afterAll(async () => {
    await storage.clear();
    await storage.close();
    await other.close();
  });

  it('should round-trip values and report missing keys', async () => {
    await storage.setItem('user', { id: 1, tags: ['a'] });

    expect(await storage.getItem('user')).toEqual({ id: 1, tags: ['a'] });
    expect(await storage.getItem('missing')).toBeNull();
    expect(await storage.getItems(['user', 'missing'])).toEqual([{ id: 1, tags: ['a'] }, null]);
    expect(await storage.hasItem('user')).toBe(true);
  });

  it('should expire a value written with a ttl', async () => {
    await storage.setItem('short', 1, { ttl: 0.2 });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(await storage.getItem('short')).toBeNull();
  });

  it('should count exactly once per increment across two clients', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => (i % 2 ? storage : other).increment('hits', { ttl: 60 })),
    );

    expect(results.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(await storage.getItem('hits')).toBe(100);
  });

  it('should set the expiry when the counter is created and never extend it', async () => {
    await storage.increment('window', { ttl: 10 });
    const before = await storage.client.pttl(`${prefix}:window`);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await storage.increment('window', { ttl: 10 });
    const after = await storage.client.pttl(`${prefix}:window`);

    expect(before).toBeGreaterThan(9000);
    expect(after).toBeLessThan(before);
  });

  it('should list and clear its own keys only', async () => {
    await storage.client.set('vercube:storage:test:outsider', '1');

    expect(await storage.getKeys()).toEqual(expect.arrayContaining(['user', 'hits', 'window']));
    expect(await storage.size()).toBeGreaterThanOrEqual(3);

    await storage.clear();

    expect(await storage.size()).toBe(0);
    expect(await storage.client.get('vercube:storage:test:outsider')).toBe('1');
    await storage.client.del('vercube:storage:test:outsider');
  });

  it('should answer a ping', async () => {
    await expect(storage.ping()).resolves.toBeUndefined();
  });
});
