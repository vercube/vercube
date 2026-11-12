import { Controller, Get, IntrospectionRegistry, Post } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { createTestApp } from '@vercube/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimit, RateLimitManager, RateLimitPlugin, SkipRateLimit } from '../src';
import { BrokenStorage } from './Utils/Mock.mock';
import type { RateLimitTypes } from '../src';
import type { IntrospectionTypes } from '@vercube/core';
import type { TestApp } from '@vercube/testing';

@Controller('/auth')
class AuthController {
  @Post('/login')
  @RateLimit({ limit: 2, window: '1m' })
  public login(): { ok: true } {
    return { ok: true };
  }

  @Get('/status')
  public status(): { ok: true } {
    return { ok: true };
  }

  @Get('/health')
  @SkipRateLimit()
  public health(): { ok: true } {
    return { ok: true };
  }
}

@Controller('/reports')
@RateLimit({ limit: 3, window: '1m' })
class ReportsController {
  @Get('/a')
  public a(): string {
    return 'a';
  }

  @Get('/b')
  public b(): string {
    return 'b';
  }

  @Get('/open')
  @RateLimit(false)
  public open(): string {
    return 'open';
  }
}

@Controller('/keyed')
class KeyedController {
  @Get('/')
  @RateLimit({ limit: 1, window: '1m', key: ({ request }) => request.headers.get('x-api-key') })
  public keyed(): string {
    return 'ok';
  }

  @Get('/quiet')
  @RateLimit({ limit: 1, window: '1m', headers: false })
  public quiet(): string {
    return 'ok';
  }

  @Get('/sliding')
  @RateLimit({ limit: 4, window: 1000, algorithm: 'sliding' })
  public sliding(): string {
    return 'ok';
  }
}

let app: TestApp | undefined;

/** Creates an app that trusts `x-forwarded-for`, the only way test requests carry an address. */
async function setup(rateLimit: RateLimitTypes.Config = {}, controllers: Function[] = [AuthController]): Promise<TestApp> {
  app = await createTestApp({
    controllers: controllers as never,
    providers: [StorageManager],
    plugins: [RateLimitPlugin],
    config: { rateLimit: { trustProxy: true, ...rateLimit } },
  });

  await app.resolve(StorageManager).mount({ storage: MemoryStorage });

  return app;
}

/** A request from one client address. */
const from = (ip: string) => ({ 'x-forwarded-for': ip });

afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
  app = undefined;
});

describe('@RateLimit', () => {
  it('should answer 429 with Retry-After once a client is over the limit', async () => {
    const app = await setup();

    const first = await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    const third = await app.post('/auth/login').headers(from('1.1.1.1')).expect(429);

    expect(first.headers.get('ratelimit-limit')).toBe('2');
    expect(first.headers.get('ratelimit-remaining')).toBe('1');
    expect(Number(first.headers.get('ratelimit-reset'))).toBeGreaterThan(0);
    expect(Number(first.headers.get('ratelimit-reset'))).toBeLessThanOrEqual(60);
    expect(first.headers.get('retry-after')).toBeNull();

    expect(third.headers.get('ratelimit-remaining')).toBe('0');
    expect(third.headers.get('retry-after')).toBe(third.headers.get('ratelimit-reset'));
    await expect(third.json()).resolves.toMatchObject({ status: 429, message: 'Too many requests' });
  });

  it('should count each client on its own', async () => {
    const app = await setup();

    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(429);
    await app.post('/auth/login').headers(from('2.2.2.2')).expect(200);
  });

  it('should start over in the next window', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(60_000 * 1000);
    const app = await setup();

    await app.post('/auth/login').headers(from('1.1.1.1'));
    await app.post('/auth/login').headers(from('1.1.1.1'));
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(429);

    now.mockReturnValue(60_000 * 1001);
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
  });

  it('should leave routes without a limit untouched', async () => {
    const app = await setup();
    const response = await app.get('/auth/status').headers(from('1.1.1.1')).expect(200);

    expect(response.headers.get('ratelimit-limit')).toBeNull();
  });

  it('should share a controller-wide limit between its routes, except one that opts out', async () => {
    const app = await setup({}, [ReportsController]);

    await app.get('/reports/a').headers(from('1.1.1.1')).expect(200);
    await app.get('/reports/b').headers(from('1.1.1.1')).expect(200);
    await app.get('/reports/a').headers(from('1.1.1.1')).expect(200);
    await app.get('/reports/b').headers(from('1.1.1.1')).expect(429);

    const open = await app.get('/reports/open').headers(from('1.1.1.1')).expect(200);
    expect(open.headers.get('ratelimit-limit')).toBeNull();
  });

  it('should count against what a key function returns, and leave requests it returns nothing for alone', async () => {
    const app = await setup({}, [KeyedController]);

    await app.get('/keyed').header('x-api-key', 'a').expect(200);
    await app.get('/keyed').header('x-api-key', 'a').expect(429);
    await app.get('/keyed').header('x-api-key', 'b').expect(200);

    // no key: not limited, warned once
    await app.get('/keyed').expect(200);
    await app.get('/keyed').expect(200);
    expect(app.logs.filter('warn', /has no client address/)).toHaveLength(1);
  });

  it('should send no RateLimit headers when they are turned off, but still Retry-After', async () => {
    const app = await setup({}, [KeyedController]);

    const ok = await app.get('/keyed/quiet').headers(from('1.1.1.1')).expect(200);
    const limited = await app.get('/keyed/quiet').headers(from('1.1.1.1')).expect(429);

    expect(ok.headers.get('ratelimit-limit')).toBeNull();
    expect(limited.headers.get('ratelimit-limit')).toBeNull();
    expect(limited.headers.get('retry-after')).not.toBeNull();
  });

  it('should weigh the previous window in with the sliding algorithm', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const app = await setup({}, [KeyedController]);

    for (let i = 0; i < 4; i++) {
      await app.get('/keyed/sliding').headers(from('1.1.1.1')).expect(200);
    }

    // a quarter into the next window, 3 of the 4 previous requests still count
    now.mockReturnValue(1_001_250);
    await app.get('/keyed/sliding').headers(from('1.1.1.1')).expect(200);
    await app.get('/keyed/sliding').headers(from('1.1.1.1')).expect(429);

    // three quarters in, only 1 does
    now.mockReturnValue(1_001_750);
    await app.get('/keyed/sliding').headers(from('1.1.1.1')).expect(200);
  });

  it('should not limit a request without a client address, and warn once', async () => {
    const app = await setup({ trustProxy: false });

    for (let i = 0; i < 4; i++) {
      await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    }

    expect(app.logs.filter('warn', /has no client address/)).toHaveLength(1);
  });

  it('should start a client over after reset()', async () => {
    const app = await setup();

    await app.post('/auth/login').headers(from('1.1.1.1'));
    await app.post('/auth/login').headers(from('1.1.1.1'));
    await app.post('/auth/login').headers(from('2.2.2.2'));
    await app.resolve(StorageManager).setItem({ key: 'app:data', value: 1 });

    await app.resolve(RateLimitManager).reset('AuthController.login', '1.1.1.1');
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    await app.post('/auth/login').headers(from('2.2.2.2')).expect(200);
    await app.post('/auth/login').headers(from('2.2.2.2')).expect(429);

    await app.resolve(RateLimitManager).reset();
    await app.post('/auth/login').headers(from('2.2.2.2')).expect(200);

    // application data in the same mount is never touched
    expect(await app.resolve(StorageManager).getItem({ key: 'app:data' })).toBe(1);
  });

  it('should list the 429 only on routes a limit applies to', async () => {
    const app = await setup({}, [AuthController, ReportsController]);
    const section = await app.resolve(IntrospectionRegistry).describe<IntrospectionTypes.RouteDescription[]>('routes');
    const routes = section!.data;
    const throws = (path: string, method = 'GET') =>
      routes.find((route) => route.path === path && route.method === method)?.throws?.map((error) => error.status) ?? [];

    expect(throws('/auth/login', 'POST')).toContain(429);
    expect(throws('/reports/a')).toContain(429);
    expect(throws('/auth/status')).not.toContain(429);
    expect(throws('/reports/open')).not.toContain(429);
  });
});

describe('app-wide limit', () => {
  it('should limit every route without its own limit, and let a route replace or lift it', async () => {
    const app = await setup({ limit: 1, window: '1m' });

    await app.get('/auth/status').headers(from('1.1.1.1')).expect(200);
    await app.get('/auth/status').headers(from('1.1.1.1')).expect(429);

    // its own limit replaces the app-wide one: 2 allowed, not 1
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
    await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);

    // lifted: never limited
    for (let i = 0; i < 3; i++) {
      await app.get('/auth/health').headers(from('1.1.1.1')).expect(200);
    }
  });

  it('should limit unmatched requests too, and never a CORS preflight', async () => {
    const app = await setup({ limit: 1, window: '1m' });

    await app.get('/nowhere').headers(from('1.1.1.1')).expect(404);
    await app.get('/nowhere').headers(from('1.1.1.1')).expect(429);

    const preflight = await app
      .request('OPTIONS', '/auth/status')
      .headers({ ...from('3.3.3.3'), origin: 'http://example.com', 'access-control-request-method': 'GET' });
    const again = await app
      .request('OPTIONS', '/auth/status')
      .headers({ ...from('3.3.3.3'), origin: 'http://example.com', 'access-control-request-method': 'GET' });

    expect(preflight.status).not.toBe(429);
    expect(again.status).not.toBe(429);
  });

  it('should use config fields as defaults of @RateLimit()', async () => {
    @Controller('/defaults')
    class DefaultsController {
      @Get('/')
      @RateLimit()
      public index(): string {
        return 'ok';
      }
    }

    const app = await setup({ window: '1m', limit: 2, name: 'everything' }, [DefaultsController]);

    await app.get('/defaults').headers(from('1.1.1.1')).expect(200);
    const second = await app.get('/defaults').headers(from('1.1.1.1')).expect(200);
    await app.get('/defaults').headers(from('1.1.1.1')).expect(429);

    expect(second.headers.get('ratelimit-limit')).toBe('2');
  });
});

describe('storage', () => {
  it('should count in a memory storage mounted under the name, with a warning, when nothing is mounted', async () => {
    @Controller('/elsewhere')
    class ElsewhereController {
      @Get('/')
      @RateLimit({ limit: 1, window: '1m', storage: 'limits' })
      public index(): string {
        return 'ok';
      }
    }

    const app = await setup({}, [ElsewhereController]);

    await Promise.all([app.get('/elsewhere').headers(from('1.1.1.1')), app.get('/elsewhere').headers(from('2.2.2.2'))]);
    await app.get('/elsewhere').headers(from('1.1.1.1')).expect(429);

    expect(app.resolve(StorageManager).getStorage('limits')).toBeInstanceOf(MemoryStorage);
    expect(app.logs.filter('warn', /Storage "limits" is not mounted/)).toHaveLength(1);
  });

  it('should let requests through when the storage fails, warning once', async () => {
    const app = await setup({ storage: 'broken' });
    await app.resolve(StorageManager).mount({ name: 'broken', storage: BrokenStorage });

    for (let i = 0; i < 3; i++) {
      const response = await app.post('/auth/login').headers(from('1.1.1.1')).expect(200);
      expect(response.headers.get('ratelimit-limit')).toBeNull();
    }

    expect(app.logs.filter('warn', /failed to count a request/)).toHaveLength(1);
  });

  it('should answer 503 when the storage fails and onStorageError is deny', async () => {
    const app = await setup({ storage: 'broken', onStorageError: 'deny' });
    await app.resolve(StorageManager).mount({ name: 'broken', storage: BrokenStorage });

    await app.post('/auth/login').headers(from('1.1.1.1')).expect(503);
  });
});

describe('without RateLimitPlugin', () => {
  it('should still limit, binding what it needs on first use', async () => {
    app = await createTestApp({ controllers: [KeyedController] });

    await app.get('/keyed').header('x-api-key', 'a').expect(200);
    await app.get('/keyed').header('x-api-key', 'a').expect(429);
  });
});
