import { Auth, AuthProvider, recallUser } from '@vercube/auth';
import { Controller, Get, Post } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { createTestApp } from '@vercube/testing';
import { testAuth } from '@vercube/testing/auth';
import { afterEach, describe, expect, it } from 'vitest';
import { RateLimit, RateLimitPlugin } from '../src';
import { withRateLimit } from '../src/Testing';
import type { TestApp } from '@vercube/testing';

@Controller('/auth')
class LoginController {
  @Post('/login')
  @RateLimit({ limit: 2, window: '1m' })
  public login(): string {
    return 'ok';
  }
}

@Controller('/me')
@Auth()
class AccountController {
  @Get('/')
  @RateLimit({
    limit: 1,
    window: '1m',
    key: ({ context }) => (recallUser(context, AuthProvider)?.user as { id: string } | undefined)?.id,
  })
  public me(): string {
    return 'ok';
  }
}

let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('withRateLimit', () => {
  it('should limit test requests, which have no address, and start over after reset()', async () => {
    const limits = withRateLimit();
    app = await createTestApp({ controllers: [LoginController], extensions: [limits] });

    await app.post('/auth/login').expect(200);
    await app.post('/auth/login').expect(200);
    await app.post('/auth/login').expect(429);

    await limits.reset();
    await app.post('/auth/login').expect(200);

    expect(limits.manager).toBeDefined();
    expect(app.resolve(StorageManager).getStorage()).toBeInstanceOf(MemoryStorage);
    expect(app.logs.filter('warn', /not mounted|no client address/)).toEqual([]);
  });

  it('should count a request with an address against it, and take settings', async () => {
    const limits = withRateLimit({ client: 'everyone', trustProxy: true, limit: 1, window: '1m', storage: 'limits' });
    app = await createTestApp({ controllers: [LoginController], extensions: [limits] });

    await app.post('/auth/login').header('x-forwarded-for', '1.1.1.1').expect(200);
    await app.post('/auth/login').header('x-forwarded-for', '1.1.1.1').expect(200);
    await app.post('/auth/login').header('x-forwarded-for', '1.1.1.1').expect(429);
    await app.post('/auth/login').header('x-forwarded-for', '2.2.2.2').expect(200);

    expect(app.resolve(StorageManager).getStorage('limits')).toBeInstanceOf(MemoryStorage);
  });

  it('should keep a storage the test mounted itself', async () => {
    class OwnStorage extends MemoryStorage {}

    app = await createTestApp({
      controllers: [LoginController],
      extensions: [withRateLimit()],
      setup: async (instance) => {
        instance.container.bind(StorageManager);
        await instance.container.get(StorageManager).mount({ storage: OwnStorage });
      },
    });

    await app.post('/auth/login').expect(200);

    expect(app.resolve(StorageManager).getStorage()).toBeInstanceOf(OwnStorage);
  });

  it('should fail clearly when used before the app is created', () => {
    expect(() => withRateLimit().manager).toThrow(/not set up yet/);
  });
});

describe('a key function with @vercube/auth', () => {
  it('should count per authenticated user', async () => {
    app = await createTestApp({
      controllers: [AccountController],
      extensions: [withRateLimit(), testAuth()],
    });

    await app.get('/me').as({ id: 'ada' }).expect(200);
    await app.get('/me').as({ id: 'ada' }).expect(429);
    await app.get('/me').as({ id: 'grace' }).expect(200);
  });
});

describe('withRateLimit with the app settings', () => {
  @Controller('/keys')
  class KeysController {
    @Get('/')
    @RateLimit({ limit: 1, window: '1m' })
    public index(): string {
      return 'ok';
    }
  }

  it('should keep a key from the app config', async () => {
    app = await createTestApp({
      controllers: [KeysController],
      config: { rateLimit: { key: ({ request }) => request.headers.get('x-api-key') } },
      extensions: [withRateLimit()],
    });

    await app.get('/keys').header('x-api-key', 'a').expect(200);
    await app.get('/keys').header('x-api-key', 'b').expect(200);
    await app.get('/keys').header('x-api-key', 'a').expect(429);
  });

  it('should add its settings to a RateLimitPlugin the test registered, keeping its app-wide limit', async () => {
    const limits = withRateLimit();

    app = await createTestApp({
      controllers: [KeysController, LoginController],
      plugins: [[RateLimitPlugin, { limit: 1, window: '1m', storage: 'limits' }]],
      extensions: [limits],
    });

    await app.post('/auth/login').expect(200);
    await app.post('/auth/login').expect(200);
    await app.post('/auth/login').expect(429);
    await app.get('/nowhere').expect(404);
    await app.get('/nowhere').expect(429);

    expect(app.resolve(StorageManager).getStorage('limits')).toBeInstanceOf(MemoryStorage);
  });

  it('should refuse an app-wide limit next to a RateLimitPlugin the test registered', async () => {
    await expect(
      createTestApp({
        controllers: [KeysController],
        plugins: [RateLimitPlugin],
        extensions: [withRateLimit({ limit: 1, window: '1m' })],
      }),
    ).rejects.toThrow(/already registered/);
  });

  it('should mount the storage the app config names', async () => {
    app = await createTestApp({
      controllers: [KeysController],
      config: { rateLimit: { storage: 'limits' } },
      extensions: [withRateLimit()],
    });

    await app.get('/keys').expect(200);

    expect(app.resolve(StorageManager).getStorage('limits')).toBeInstanceOf(MemoryStorage);
    expect(app.logs.filter('warn', /not mounted|failed to count/)).toEqual([]);
  });

  it('should forget the app once it is closed', async () => {
    const limits = withRateLimit();
    const closed = await createTestApp({ controllers: [KeysController], extensions: [limits] });

    expect(limits.manager).toBeDefined();
    await closed.close();
    expect(() => limits.manager).toThrow(/not set up yet/);
  });
});
