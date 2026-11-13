import { Controller, Get } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { RedisStorage } from '@vercube/storage/drivers/RedisStorage';
import { createTestApp } from '@vercube/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimit, RateLimitPlugin } from '../src';
import type { TestApp } from '@vercube/testing';

/**
 * Two application instances sharing one Redis, when `REDIS_URL` is set:
 * `docker run --rm -p 6379:6379 redis:7-alpine` and `REDIS_URL=redis://127.0.0.1:6379 pnpm test`.
 */
const url = process.env.REDIS_URL;

@Controller('/shared')
class SharedController {
  @Get('/')
  @RateLimit({ limit: 10, window: '1m', storage: 'redis' })
  public index(): string {
    return 'ok';
  }
}

describe.skipIf(!url)('rate limits shared through Redis', () => {
  const prefix = `vercube:ratelimit:test:${crypto.randomUUID()}`;
  const apps: TestApp[] = [];

  beforeAll(async () => {
    for (let i = 0; i < 2; i++) {
      const app = await createTestApp({
        controllers: [SharedController],
        providers: [StorageManager],
        plugins: [RateLimitPlugin],
        config: { rateLimit: { trustProxy: true } },
      });

      await app.resolve(StorageManager).mount({ name: 'redis', storage: RedisStorage, initOptions: { url, prefix } });
      apps.push(app);
    }
  });

  afterAll(async () => {
    await apps[0]?.resolve(StorageManager).clear({ storage: 'redis' });
    await Promise.all(apps.map((app) => app.close()));
  });

  it('should allow exactly the limit across instances, however the requests interleave', async () => {
    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) => apps[i % 2].get('/shared').header('x-forwarded-for', '9.9.9.9').send()),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(10);
    expect(statuses.filter((status) => status === 429)).toHaveLength(30);
  });
});
