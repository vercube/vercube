import { BaseMiddleware, Controller, createApp, Get, GlobalMiddlewareRegistry } from '@vercube/core';
import { afterEach, describe, expect, it } from 'vitest';
import { DevtoolsPlugin } from '../../src/Plugins/DevtoolsPlugin';
import { resetBootstrapProfiler } from '../../src/Services/BootstrapProfiler';
import { createDevtoolsApp, devtoolsFetch, devtoolsJson } from '../Utils/App';
import type { DevtoolsTypes } from '../../src/Types/DevtoolsTypes';

describe('DevtoolsPlugin', () => {
  afterEach(() => {
    resetBootstrapProfiler();
  });

  it('should stay disabled outside of development mode', async () => {
    const app = await createApp({
      cfg: { requestLogging: false, dev: false },
      setup: (app) => {
        app.addPlugin(DevtoolsPlugin);
      },
    });

    const response = await devtoolsFetch(app, '/_devtools');

    expect(response.status).toBe(404);
  });

  it('should stay disabled in production even when dev is also set', async () => {
    const app = await createApp({
      cfg: { requestLogging: false, dev: true, production: true },
      setup: (app) => {
        app.addPlugin(DevtoolsPlugin);
      },
    });

    const response = await devtoolsFetch(app, '/_devtools');

    expect(response.status).toBe(404);
  });

  it('should enable itself automatically in development mode', async () => {
    const app = await createApp({
      cfg: { requestLogging: false, dev: true },
      setup: (app) => {
        app.addPlugin(DevtoolsPlugin);
      },
    });

    const response = await devtoolsFetch(app, '/_devtools');

    expect(response.status).toBe(200);
  });

  it('should serve the UI as a self-contained HTML document', async () => {
    const app = await createDevtoolsApp();
    const response = await devtoolsFetch(app, '/_devtools');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();

    expect(html).toContain('Vercube Devtools');
    expect(html).not.toMatch(/<script[^>]+src="(?!data:)/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
  });

  it('should honour a custom mount path', async () => {
    const app = await createDevtoolsApp({ path: '/__inspect' });

    expect((await devtoolsFetch(app, '/__inspect')).status).toBe(200);
    expect((await devtoolsFetch(app, '/__inspect/api/routes')).status).toBe(200);
    expect((await devtoolsFetch(app, '/_devtools')).status).toBe(404);
  });

  it('should normalise a mount path given without a leading slash', async () => {
    const app = await createDevtoolsApp({ path: 'inspector/' });

    expect((await devtoolsFetch(app, '/inspector')).status).toBe(200);
  });

  it('should reject unauthenticated calls when a token is configured', async () => {
    const app = await createDevtoolsApp({ token: 's3cret' });

    expect((await devtoolsFetch(app, '/_devtools/api/routes')).status).toBe(401);
    expect((await devtoolsFetch(app, '/_devtools/api/routes?token=nope')).status).toBe(401);
    expect((await devtoolsFetch(app, '/_devtools/api/routes?token=s3cret')).status).toBe(200);

    const withHeader = await devtoolsFetch(app, '/_devtools/api/routes', { headers: { 'x-devtools-token': 's3cret' } });
    expect(withHeader.status).toBe(200);
  });

  it('should answer unknown devtools endpoints with a 404', async () => {
    const app = await createDevtoolsApp();

    expect((await devtoolsFetch(app, '/_devtools/api/nope')).status).toBe(404);
  });

  it('should register each endpoint as a real route rather than a catch-all', async () => {
    const app = await createDevtoolsApp();
    const routes = await devtoolsJson<DevtoolsTypes.RouteInfo[]>(app, '/_devtools/api/routes');
    const own = routes.filter((route) => route.internal);

    expect(own.every((route) => route.controller === 'DevtoolsController')).toBe(true);
    expect(own.some((route) => route.path.includes('**'))).toBe(false);
    expect(own.map((route) => `${route.method} ${route.path}`)).toEqual(
      expect.arrayContaining([
        'GET /_devtools/',
        'GET /_devtools/api/graph',
        'GET /_devtools/api/requests/:id',
        'DELETE /_devtools/api/requests',
      ]),
    );
  });

  it('should keep the application global middlewares off its own routes', async () => {
    const seen: string[] = [];

    class TracingMiddleware extends BaseMiddleware {
      public onRequest(request: Request): void {
        seen.push(new URL(request.url).pathname);
      }
    }

    @Controller('/app')
    class AppController {
      @Get('/ping')
      public ping(): string {
        return 'pong';
      }
    }

    const app = await createDevtoolsApp({}, (app) => {
      app.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(TracingMiddleware);
      app.container.bind(AppController);
    });

    // The first request triggers the post-boot pass that detaches global middlewares.
    await app.fetch(new Request('http://localhost/app/ping'));
    await devtoolsFetch(app, '/_devtools/api/overview');
    await devtoolsFetch(app, '/_devtools');

    expect(seen).toEqual(['/app/ping']);
  });

  it('should still run its own token guard after detaching global middlewares', async () => {
    const app = await createDevtoolsApp({ token: 'keep-me' });

    await app.fetch(new Request('http://localhost/whatever'));

    expect((await devtoolsFetch(app, '/_devtools/api/overview')).status).toBe(401);
    expect((await devtoolsFetch(app, '/_devtools/api/overview?token=keep-me')).status).toBe(200);
  });
});
