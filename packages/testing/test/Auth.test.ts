import { Auth, AuthProvider, User } from '@vercube/auth';
import { Controller, Get } from '@vercube/core';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../src';
import { testAuth, TestAuthProvider } from '../src/Auth';

interface Account {
  id: string;
  roles?: string[];
  groups?: string[];
}

let seen: Request | null = null;

@Controller('/admin')
@Auth()
class AdminController {
  @Get('/')
  public home(@User() user: Account): unknown {
    return { id: user.id };
  }

  @Get('/settings')
  @Auth({ roles: ['admin'] })
  public settings(): unknown {
    return { ok: true };
  }
}

@Controller('/whoami')
class WhoAmIController {
  @Get('/')
  public whoami(@User() user: Account | null): unknown {
    return { user };
  }
}

/** Records the request the provider is asked about. */
class RecordingProvider extends TestAuthProvider<Account> {
  public override validate(request: Request): string | null {
    seen = request;
    return null;
  }
}

describe('testAuth', () => {
  it('should reject a request sent without .as()', async () => {
    await using app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });

    await app.get('/admin').expect(401);
  });

  it('should let a user in and hand it to @User()', async () => {
    await using app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });

    const res = await app.get('/admin').as({ id: '7' }).expect(200);

    expect(await res.json()).toEqual({ id: '7' });
  });

  it('should hand @User() the user on a route without @Auth()', async () => {
    await using app = await createTestApp({ controllers: [WhoAmIController], extensions: [testAuth()] });

    const res = await app.get('/whoami').as({ id: '7' }).expect(200);
    const anonymous = await app.get('/whoami').expect(200);

    expect(await res.json()).toEqual({ user: { id: '7' } });
    expect(await anonymous.json()).toEqual({ user: null });
  });

  it('should check the roles the route requires', async () => {
    await using app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });

    // @Auth answers 401 for a missing role too
    await app
      .get('/admin/settings')
      .as({ id: '1', roles: ['user'] })
      .expect(401);
    await app.get('/admin/settings').as({ id: '1' }).expect(401);
    await app
      .get('/admin/settings')
      .as({ id: '1', roles: ['admin'] })
      .expect(200);
  });

  it('should read the roles the way it is told', async () => {
    await using app = await createTestApp({
      controllers: [AdminController],
      extensions: [testAuth<Account>({ roles: (user) => user.groups ?? [] })],
    });

    await app
      .get('/admin/settings')
      .as({ id: '1', roles: ['admin'] })
      .expect(401);
    await app
      .get('/admin/settings')
      .as({ id: '1', groups: ['admin'] })
      .expect(200);
  });

  it('should not let in a copy of an authenticated request', async () => {
    await using app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });

    const res = await app.get('/admin').as({ id: '1' }).expect(200);

    // same method, URL and headers, built by hand: nothing marks it
    const copy = new Request(res.request.url, { headers: res.request.headers });
    expect((await app.fetch(copy)).status).toBe(401);
  });

  it('should work through an agent', async () => {
    await using app = await createTestApp({ controllers: [AdminController], extensions: [testAuth()] });

    await app.agent().get('/admin').as({ id: '1' }).expect(200);
  });

  it('should see the very Request the builder made', async () => {
    let built: Request | null = null;
    const users = new WeakMap<Request, Account>();

    await using app = await createTestApp({
      controllers: [AdminController],
      extensions: [
        {
          name: 'recording',
          beforeInitialize: (instance) => instance.container.bindInstance(AuthProvider, new RecordingProvider(users, () => [])),
          ready: (testApp) =>
            testApp.useImpersonator((request) => {
              built = request;
            }),
        },
      ],
    });

    await app.get('/admin/settings').as({ id: '1' });

    expect(seen).not.toBeNull();
    expect(seen).toBe(built);
  });
});
