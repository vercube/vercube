import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BaseMiddleware,
  Controller,
  createApp,
  Get,
  GlobalMiddlewareRegistry,
  resolveHealthOptions,
  resolveHealthPaths,
  resolveShutdownDefaults,
  resolveTelemetryOptions,
  Router,
  timingSafeEqualString,
  UnauthorizedError,
} from '../../src';
import type { App, ConfigTypes } from '../../src';

@Controller('/_health')
class CollidingController {
  @Get('/ready')
  public ready(): string {
    return 'mine';
  }
}

@Controller('/users')
class UsersController {
  @Get('/')
  public list(): string[] {
    return ['ada'];
  }
}

class DenyAll extends BaseMiddleware {
  public override onRequest(): void {
    throw new UnauthorizedError('nope');
  }
}

/**
 * Asks the OS for a port nothing listens on.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

describe('resolveHealthOptions', () => {
  it('should be null when health is off', () => {
    expect(resolveHealthOptions({})).toBeNull();
    expect(resolveHealthOptions({ health: false })).toBeNull();
    expect(resolveHealthPaths({})).toEqual([]);
  });

  it('should use /_health by default', () => {
    expect(resolveHealthOptions({ health: true })).toEqual({
      endpoints: { live: '/_health/live', ready: '/_health/ready', startup: '/_health/startup' },
      checks: [],
      details: 'summary',
      token: undefined,
      timeout: undefined,
      cacheTtl: undefined,
      telemetry: false,
    });
  });

  it('should build the endpoints from the base path', () => {
    expect(resolveHealthPaths({ health: { path: '/internal/health/' } })).toEqual([
      '/internal/health/live',
      '/internal/health/ready',
      '/internal/health/startup',
    ]);
    expect(resolveHealthPaths({ health: { path: '/' } })).toEqual(['/live', '/ready', '/startup']);
  });

  it('should take each override as a full path and leave out false', () => {
    const resolved = resolveHealthOptions({
      health: { path: '/ignored', endpoints: { live: '/livez', ready: '/internal/k8s/ready/', startup: false } },
    });

    expect(resolved?.endpoints).toEqual({ live: '/livez', ready: '/internal/k8s/ready', startup: null });
  });

  it('should refuse two endpoints on one path', () => {
    expect(() => resolveHealthOptions({ health: { endpoints: { live: '/probe', ready: '/probe/' } } })).toThrow(
      'the live and ready endpoints are both set to /probe',
    );
    expect(() => resolveHealthOptions({ health: { path: '/x', endpoints: { startup: '/x/live' } } })).toThrow(
      'the live and startup endpoints are both set to /x/live',
    );
  });

  it.each([
    [{ path: '' }, 'health.path must be a non-empty path'],
    [{ path: 'health' }, 'health.path must start with a slash'],
    [{ endpoints: { ready: '' } }, 'health.endpoints.ready must be a non-empty path'],
    [{ endpoints: { ready: '/ready/:id' } }, 'without parameters'],
    [{ endpoints: { live: '/live?x=1' } }, 'without parameters'],
    [{ details: 'all' }, 'health.details must be one of'],
    [{ details: 'full' }, 'Set health.token'],
    [{ token: '' }, 'health.token must be a non-empty string'],
  ] as [ConfigTypes.Config['health'], string][])('should refuse %j', (health, message) => {
    expect(() => resolveHealthOptions({ health })).toThrow(message);
  });

  it('should accept full details with a token', () => {
    expect(resolveHealthOptions({ health: { details: 'full', token: 'secret' } })?.details).toBe('full');
  });
});

describe('resolveShutdownDefaults', () => {
  it('should not drain or handle signals without health', () => {
    expect(resolveShutdownDefaults({})).toEqual({ drainDelay: 0, handleSignals: false });
  });

  it('should drain for 5s and handle signals with health', () => {
    expect(resolveShutdownDefaults({ health: true })).toEqual({ drainDelay: 5000, handleSignals: true });
  });

  it('should not drain the vercube dev worker by default', () => {
    expect(resolveShutdownDefaults({ health: true }, { VERCUBE_DEV_SERVER: '1' })).toEqual({
      drainDelay: 0,
      handleSignals: true,
    });
    expect(resolveShutdownDefaults({ health: true, shutdown: { drainDelay: 100 } }, { VERCUBE_DEV_SERVER: '1' }).drainDelay).toBe(
      100,
    );
  });

  it('should keep what the application set', () => {
    expect(resolveShutdownDefaults({ health: true, shutdown: { drainDelay: 0, handleSignals: false } })).toEqual({
      drainDelay: 0,
      handleSignals: false,
    });
  });
});

describe('telemetry exclusion', () => {
  it('should leave the probes out of telemetry', () => {
    expect(resolveTelemetryOptions({ telemetry: true, health: { endpoints: { live: '/livez' } } }).excludeExact).toEqual([
      '/livez',
      '/_health/ready',
      '/_health/startup',
    ]);
  });

  it('should keep the exclusions the application set', () => {
    const options = resolveTelemetryOptions({ telemetry: { exclude: ['/metrics'], excludeExact: ['/ping'] }, health: true });

    expect(options.exclude).toEqual(['/metrics']);
    expect(options.excludeExact).toEqual(['/ping', '/_health/live', '/_health/ready', '/_health/startup']);
  });

  it('should trace the probes when asked to', () => {
    expect(resolveTelemetryOptions({ telemetry: true, health: { telemetry: true } }).excludeExact).toBeUndefined();
  });

  it('should exclude nothing without health', () => {
    expect(resolveTelemetryOptions({ telemetry: true }).excludeExact).toBeUndefined();
  });
});

describe('timingSafeEqualString', () => {
  it('should compare strings', () => {
    expect(timingSafeEqualString('secret', 'secret')).toBe(true);
    expect(timingSafeEqualString('secreT', 'secret')).toBe(false);
    expect(timingSafeEqualString('secret!', 'secret')).toBe(false);
    expect(timingSafeEqualString('', 'secret')).toBe(false);
  });
});

describe('health routes', () => {
  let app: App | null = null;

  const boot = async (cfg: ConfigTypes.Config, setup?: (app: App) => void): Promise<App> => {
    app = await createApp({
      cfg: { requestLogging: false, server: { static: undefined }, ...cfg },
      configFile: false,
      setup,
    });

    return app;
  };

  const get = async (path: string, headers?: HeadersInit): Promise<{ status: number; body: any; response: Response }> => {
    const response = await app!.fetch(new Request(`http://localhost${path}`, { headers }));
    const text = await response.text();

    return { status: response.status, body: text ? JSON.parse(text) : null, response };
  };

  afterEach(async () => {
    await app?.close({ drainDelay: 0 }).catch(() => {});
    app = null;
  });

  it('should register no routes when health is off', async () => {
    await boot({});
    await app!.start();

    expect((await get('/_health/live')).status).toBe(404);
    expect(app!.container.getOptional(GlobalMiddlewareRegistry)).not.toBeNull();
  });

  it('should answer liveness with no dependency checks', async () => {
    const check = vi.fn(() => Promise.reject(new Error('down')));

    await boot({ health: true });
    app!.health.register({ name: 'db', check });

    const { status, body, response } = await get('/_health/live');

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(check).not.toHaveBeenCalled();
  });

  it('should answer HEAD', async () => {
    await boot({ health: true });

    const response = await app!.fetch(new Request('http://localhost/_health/live', { method: 'HEAD' }));

    expect(response.status).toBe(200);
  });

  it('should report starting until the start hooks finished', async () => {
    await boot({ health: true });

    const gate = Promise.withResolvers<void>();
    app!.onStart(() => gate.promise);

    const started = app!.start();

    expect(await get('/_health/ready')).toMatchObject({ status: 503, body: { status: 'starting' } });
    expect(await get('/_health/startup')).toMatchObject({ status: 503, body: { status: 'starting' } });

    gate.resolve();
    await started;

    expect(await get('/_health/ready')).toMatchObject({ status: 200, body: { status: 'ok', checks: {} } });
    expect(await get('/_health/startup')).toMatchObject({ status: 200, body: { status: 'ok' } });
  });

  it('should fail readiness when a critical check fails', async () => {
    await boot({ health: { cacheTtl: 0 } });
    await app!.start();

    app!.health.register({ name: 'db', check: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.3')) });
    app!.health.register({ name: 'cache', critical: false, check: () => {} });

    const { status, body } = await get('/_health/ready');

    expect(status).toBe(503);
    // summary: names and status, never the error message
    expect(body).toEqual({ status: 'down', checks: { db: { status: 'down' }, cache: { status: 'ok' } } });
  });

  it('should stay ready when only a non-critical check fails', async () => {
    await boot({ health: true });
    await app!.start();

    app!.health.register({ name: 'cache', critical: false, check: () => Promise.reject(new Error('miss')) });

    expect(await get('/_health/ready')).toMatchObject({ status: 200, body: { status: 'degraded' } });
  });

  it('should register the checks from the config', async () => {
    await boot({ health: { checks: [{ name: 'config', check: () => ({ status: 'down' }) }] } });
    await app!.start();

    expect(await get('/_health/ready')).toMatchObject({ status: 503, body: { checks: { config: { status: 'down' } } } });
  });

  it('should apply the timeout from the config', async () => {
    await boot({ health: { timeout: 10, details: 'full', token: 't' } });
    await app!.start();

    app!.health.register({ name: 'slow', check: () => new Promise(() => {}) });

    const { body } = await get('/_health/ready', { authorization: 'Bearer t' });

    expect(body.checks.slow).toMatchObject({ status: 'down', error: 'Timed out after 10ms' });
  });

  it('should show only the status with details none', async () => {
    await boot({ health: { details: 'none' } });
    await app!.start();

    app!.health.register({ name: 'db', check: () => {} });

    expect((await get('/_health/ready')).body).toEqual({ status: 'ok' });
  });

  it('should show the full report only to requests with the token', async () => {
    await boot({ health: { token: 'secret', cacheTtl: 0 } });
    await app!.start();

    app!.health.register({ name: 'db', check: () => Promise.reject(new Error('ECONNREFUSED')) });

    const anonymous = await get('/_health/ready');
    const wrong = await get('/_health/ready', { authorization: 'Bearer nope' });
    const authorized = await get('/_health/ready', { authorization: 'bearer secret' });

    expect(anonymous.body.checks.db).toEqual({ status: 'down' });
    expect(wrong.body.checks.db).toEqual({ status: 'down' });
    expect(authorized.body.checks.db).toMatchObject({ status: 'down', critical: true, error: 'ECONNREFUSED' });
    expect(authorized.body.timestamp).toEqual(expect.any(String));
  });

  it('should not run global middlewares on the probes', async () => {
    await boot({ health: true }, (instance) => {
      instance.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(DenyAll);
      instance.container.bind(UsersController);
    });
    await app!.start();

    expect((await get('/users')).status).toBe(401);
    expect((await get('/_health/live')).status).toBe(200);
    expect((await get('/_health/ready')).status).toBe(200);
  });

  it('should serve custom paths and leave out disabled endpoints', async () => {
    await boot({ health: { endpoints: { live: '/livez', ready: '/internal/k8s/ready', startup: false } } });
    await app!.start();

    expect((await get('/livez')).status).toBe(200);
    expect((await get('/internal/k8s/ready')).status).toBe(200);
    expect((await get('/_health/live')).status).toBe(404);
    expect((await get('/_health/startup')).status).toBe(404);
  });

  it('should list the probes in the route introspection', async () => {
    await boot({ health: true });

    const routes = (await app!.inspect('routes')) as { data: { method: string; path: string; controller: string }[] };

    expect(
      routes.data.filter((route) => route.controller === 'HealthController').map((route) => `${route.method} ${route.path}`),
    ).toEqual([
      'GET /_health/live',
      'HEAD /_health/live',
      'GET /_health/ready',
      'HEAD /_health/ready',
      'GET /_health/startup',
      'HEAD /_health/startup',
    ]);
  });

  it('should fail the boot when an application route collides with a probe', async () => {
    await expect(
      boot({ health: true }, (instance) => {
        instance.container.bind(CollidingController);
      }),
    ).rejects.toThrow(
      'GET /_health/ready (CollidingController.ready) collides with the health ready endpoint. Move the route, or the probe with health.endpoints.ready.',
    );
  });

  it('should fail a route registered after the start on a probe path', async () => {
    await boot({ health: true });
    await app!.start();

    app!.container.bind(CollidingController);

    expect(() => app!.container.flushQueue()).toThrow('collides with the health ready endpoint');
    expect((await get('/_health/ready')).body).toEqual({ status: 'ok', checks: {} });
  });

  it('should fail a HEAD-only route on a probe path', () => {
    const router = new Router();

    (router as unknown as { gHooksService: { trigger: () => void } }).gHooksService = { trigger: () => {} };
    void router.initialize();
    router.reserve('/_health/live', { owner: 'the probe', hint: '', owns: () => false });

    const route = (method: 'HEAD' | 'POST' | 'get', path: string) => () =>
      router.addRoute({ method: method as 'HEAD', path, handler: { instance: {}, propertyName: 'x' } as never });

    expect(route('HEAD', '/_health/live/')).toThrow('collides with the probe');
    expect(route('get', '/_health/live')).toThrow('collides with the probe');
    expect(route('POST', '/_health/live')).not.toThrow();
    expect(route('HEAD', '/_health/live/x')).not.toThrow();
  });

  it('should keep the probes of two applications in one process apart', async () => {
    const first = await createApp({
      cfg: { requestLogging: false, server: { static: undefined }, health: { endpoints: { live: '/one' } } },
      configFile: false,
    });
    const second = await createApp({
      cfg: { requestLogging: false, server: { static: undefined }, health: { endpoints: { live: '/two' } } },
      configFile: false,
    });

    expect((await first.fetch(new Request('http://localhost/one'))).status).toBe(200);
    expect((await first.fetch(new Request('http://localhost/two'))).status).toBe(404);
    expect((await second.fetch(new Request('http://localhost/two'))).status).toBe(200);

    await Promise.all([first.close(), second.close()]);
  });

  it('should treat a malformed authorization header as anonymous', async () => {
    await boot({ health: { token: 'secret', cacheTtl: 0 } });
    await app!.start();

    app!.health.register({ name: 'db', check: () => Promise.reject(new Error('ECONNREFUSED')) });

    for (const authorization of ['Bearer', 'Bearer ', 'Basic secret', 'secret', 'Bearer secret extra']) {
      expect((await get('/_health/ready', { authorization })).body.checks.db).toEqual({ status: 'down' });
    }
  });

  it('should not collide once the probe moved', async () => {
    await boot({ health: { endpoints: { ready: '/readyz' } } }, (instance) => {
      instance.container.bind(CollidingController);
    });

    await app!.start();

    // the application route keeps its path
    expect((await get('/_health/ready')).body).toBe('mine');
    expect((await get('/readyz')).status).toBe(200);
  });

  it('should fail createApp on an invalid option', async () => {
    await expect(boot({ health: { endpoints: { live: '/x', ready: '/x' } } })).rejects.toThrow('both set to /x');
  });

  describe('over the network', () => {
    it('should fail readiness at once on close and keep serving liveness until the server closed', async () => {
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;

      await boot({
        health: true,
        shutdown: { drainDelay: 300, handleSignals: false },
        server: { host: '127.0.0.1', port, static: undefined },
      });
      await app!.listen();

      expect((await fetch(`${base}/_health/ready`)).status).toBe(200);

      const closing = app!.close();

      const ready = await fetch(`${base}/_health/ready`);
      const live = await fetch(`${base}/_health/live`);

      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: 'draining' });
      expect(live.status).toBe(200);

      await closing;

      await expect(fetch(`${base}/_health/live`)).rejects.toThrow();
      expect(app!.state).toBe('closed');
    });

    it('should handle SIGTERM by default with health on', async () => {
      const port = await freePort();
      const before = process.listenerCount('SIGTERM');

      await boot({ health: true, server: { host: '127.0.0.1', port, static: undefined } });
      await app!.listen();

      expect(process.listenerCount('SIGTERM')).toBe(before + 1);

      await app!.close({ drainDelay: 0 });

      expect(process.listenerCount('SIGTERM')).toBe(before);
    });
  });
});
