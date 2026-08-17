import { BaseMiddleware, Body, Controller, Get, Head, Middleware, Post, QueryParam } from '@vercube/core';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { afterEach, describe, expect, it } from 'vitest';
import { resetBootstrapProfiler } from '../src/Services/BootstrapProfiler';
import { createDevtoolsApp, devtoolsFetch, devtoolsJson } from './Utils/App';
import type { DevtoolsTypes } from '../src/Types/DevtoolsTypes';
import type { App } from '@vercube/core';

class SlowMiddleware extends BaseMiddleware {
  public async onRequest(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}

class TouchMiddleware extends BaseMiddleware {
  public onResponse(): void {
    /* records an "after" span */
  }
}

class Numbers {
  /** @returns a fixed value used in dependency wiring tests */
  public value(): number {
    return 42;
  }
}

@Controller('/demo')
@Middleware(TouchMiddleware)
export class DemoController {
  @Inject(Numbers)
  private readonly gNumbers!: Numbers;

  @Inject(Logger)
  private readonly gLogger!: Logger;

  @Get('/ok')
  public ok(@QueryParam({ name: 'name' }) name: string): Record<string, unknown> {
    return { ok: true, name, value: this.gNumbers.value() };
  }

  @Get('/slow')
  @Middleware(SlowMiddleware)
  public slow(): Record<string, boolean> {
    return { slow: true };
  }

  @Get('/boom')
  public boom(): never {
    throw new Error('handler exploded');
  }

  @Get('/chatty')
  public chatty(): Record<string, boolean> {
    this.gLogger.info('handling chatty', { attempt: 1 });
    this.gLogger.warn('nearly out of widgets');
    return { logged: true };
  }

  @Post('/echo')
  public echo(@Body() body: unknown): unknown {
    return body;
  }

  @Head('/probe')
  public probe(): void {}
}

/**
 * Boots an app exposing {@link DemoController} with devtools enabled.
 * @returns the running application
 */
function createDemoApp(): Promise<App> {
  return createDevtoolsApp({}, (app) => {
    app.container.bind(Numbers);
    app.container.bind(DemoController);
  });
}

/**
 * Boots the demo app with a small body capture cap.
 * @returns the running application
 */
function createCappedApp(): Promise<App> {
  return createDevtoolsApp({ maxBodyBytes: 16 }, (app) => {
    app.container.bind(Numbers);
    app.container.bind(DemoController);
  });
}

/**
 * Waits for async body previews to attach to their records.
 */
function settleBodies(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('devtools API', () => {
  afterEach(() => {
    resetBootstrapProfiler();
  });

  it('should describe the application on the overview endpoint', async () => {
    const app = await createDemoApp();
    const overview = await devtoolsJson<DevtoolsTypes.Overview>(app, '/_devtools/api/overview');

    expect(overview.counts.controllers).toBeGreaterThanOrEqual(1);
    expect(overview.counts.routes).toBeGreaterThanOrEqual(4);
    expect(overview.runtime.name).toBeTruthy();
    expect(overview.requests.total).toBe(0);
  });

  it('should list routes with their arguments and middleware chain', async () => {
    const app = await createDemoApp();
    const routes = await devtoolsJson<DevtoolsTypes.RouteInfo[]>(app, '/_devtools/api/routes');
    const slow = routes.find((route) => route.method === 'GET / HEAD' && route.path === '/demo/slow');
    const echo = routes.find((route) => route.method === 'POST' && route.path === '/demo/echo');
    const headTwin = routes.find((route) => route.method === 'HEAD' && route.path === '/demo/slow');

    expect(headTwin).toBeUndefined();
    expect(routes.find((route) => route.path === '/demo/probe')?.method).toBe('HEAD');

    expect(slow?.controller).toBe('DemoController');
    expect(slow?.middlewares.map((middleware) => middleware.name)).toContain('SlowMiddleware');
    // Exact equality: guard against duplicated argument metadata on shared prototypes.
    expect(echo?.args).toEqual([expect.objectContaining({ idx: 0, type: 'body', validated: false })]);
  });

  it('should mark its own routes as internal', async () => {
    const app = await createDemoApp();
    const routes = await devtoolsJson<DevtoolsTypes.RouteInfo[]>(app, '/_devtools/api/routes');

    expect(routes.filter((route) => route.internal).length).toBeGreaterThan(0);
    expect(routes.every((route) => !route.internal || route.path.startsWith('/_devtools'))).toBe(true);
  });

  it('should record requests with a span for every middleware and the handler', async () => {
    const app = await createDemoApp();

    await app.fetch(new Request('http://localhost/demo/slow'));

    const records = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');
    const [record] = records;

    expect(records).toHaveLength(1);
    expect(record).toMatchObject({ method: 'GET', path: '/demo/slow', status: 200, controller: 'DemoController' });
    expect(record.durationMs).toBeGreaterThanOrEqual(10);

    const spans = record.spans.map((span) => span.name);
    expect(spans).toContain('SlowMiddleware');
    expect(spans).toContain('DemoController.slow');
    expect(record.spans.find((span) => span.name === 'SlowMiddleware')?.durationMs).toBeGreaterThanOrEqual(10);
    expect(record.spans.some((span) => span.kind === 'middleware:after')).toBe(true);
  });

  it('should capture query parameters and redact sensitive headers', async () => {
    const app = await createDemoApp();

    await app.fetch(
      new Request('http://localhost/demo/ok?name=vercube', { headers: { authorization: 'Bearer super-secret', 'x-trace': '1' } }),
    );

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record.query).toEqual({ name: 'vercube' });
    expect(record.requestHeaders.authorization).toBe('<redacted>');
    expect(record.requestHeaders['x-trace']).toBe('1');
  });

  it('should capture request and response bodies', async () => {
    const app = await createDemoApp();

    await app.fetch(
      new Request('http://localhost/demo/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"hello":"vercube"}',
      }),
    );

    // Bodies resolve asynchronously after the response is delivered.
    await settleBodies();

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record.requestBody).toMatchObject({ text: '{"hello":"vercube"}', truncated: false, size: 19 });
    expect(record.requestBody?.contentType).toContain('application/json');
    expect(JSON.parse(record.responseBody?.text ?? 'null')).toEqual({ hello: 'vercube' });
  });

  it('should not capture bodies when the option is off', async () => {
    const app = await createDevtoolsApp({ captureBodies: false }, (instance) => {
      instance.container.bind(Numbers);
      instance.container.bind(DemoController);
    });

    await app.fetch(
      new Request('http://localhost/demo/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"hello":"vercube"}',
      }),
    );

    await settleBodies();

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record.requestBody).toBeUndefined();
    expect(record.responseBody).toBeUndefined();
  });

  it('should truncate an undeclared body that overruns the cap', async () => {
    const app = await createCappedApp();
    const body = JSON.stringify({ hello: 'a much longer value than the cap allows' });

    await app.fetch(
      new Request('http://localhost/demo/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
    );

    await settleBodies();

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    // Undeclared length: body is buffered then truncated to the cap.
    expect(record.requestBody?.truncated).toBe(true);
    expect(record.requestBody?.size).toBe(body.length);
    expect(record.requestBody?.text).toBe(body.slice(0, 16));
  });

  it('should skip a body that declares a length over the cap', async () => {
    const app = await createCappedApp();
    const body = JSON.stringify({ hello: 'a much longer value than the cap allows' });

    await app.fetch(
      new Request('http://localhost/demo/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
        body,
      }),
    );

    await settleBodies();

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    // Declared length over the cap: body is skipped without buffering.
    expect(record.requestBody?.omitted).toBe('too-large');
    expect(record.requestBody?.text).toBeUndefined();
    expect(record.requestBody?.size).toBe(body.length);
  });

  it('should capture logs and tie them to the request that produced them', async () => {
    const app = await createDemoApp();

    await app.fetch(new Request('http://localhost/demo/chatty'));

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');
    const logs = await devtoolsJson<DevtoolsTypes.LogEntry[]>(app, '/_devtools/api/logs');
    const mine = logs.filter((entry) => entry.requestId === record.id);

    expect(mine.map((entry) => entry.message)).toEqual(['nearly out of widgets', 'handling chatty']);
    expect(mine.map((entry) => entry.level)).toEqual(['warn', 'info']);
    expect(mine.at(-1)?.context).toEqual({ attempt: 1 });
  });

  it('should leave logs emitted outside a request unattributed', async () => {
    const app = await createDemoApp();

    app.container.get(Logger).info('booted without a request');

    const logs = await devtoolsJson<DevtoolsTypes.LogEntry[]>(app, '/_devtools/api/logs');
    const entry = logs.find((candidate) => candidate.message === 'booted without a request');

    expect(entry).toBeDefined();
    expect(entry?.requestId).toBeUndefined();
  });

  it('should not capture logs when the option is off', async () => {
    const app = await createDevtoolsApp({ captureLogs: false }, (instance) => {
      instance.container.bind(Numbers);
      instance.container.bind(DemoController);
    });

    await app.fetch(new Request('http://localhost/demo/chatty'));

    expect(await devtoolsJson<DevtoolsTypes.LogEntry[]>(app, '/_devtools/api/logs')).toEqual([]);
  });

  it('should record the error behind a failed request', async () => {
    const app = await createDemoApp();

    await app.fetch(new Request('http://localhost/demo/boom'));

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record.status).toBeGreaterThanOrEqual(500);
    expect(record.error?.message).toBe('handler exploded');
  });

  it('should mark unmatched requests', async () => {
    const app = await createDemoApp();

    await app.fetch(new Request('http://localhost/nothing-here'));

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record).toMatchObject({ matched: false, status: 404 });
    expect(record.controller).toBeUndefined();
  });

  it('should not record its own traffic', async () => {
    const app = await createDemoApp();

    await devtoolsFetch(app, '/_devtools/api/overview');
    await devtoolsFetch(app, '/_devtools');

    const records = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(records).toEqual([]);
  });

  it('should evict the oldest records once the buffer is full', async () => {
    const app = await createDevtoolsApp({ maxRequests: 3 }, (app) => {
      app.container.bind(Numbers);
      app.container.bind(DemoController);
    });

    for (let i = 0; i < 5; i++) {
      await app.fetch(new Request(`http://localhost/demo/ok?name=${i}`));
    }

    const records = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.query.name)).toEqual(['4', '3', '2']);
  });

  it('should look up a single record and clear the buffer', async () => {
    const app = await createDemoApp();

    await app.fetch(new Request('http://localhost/demo/ok'));
    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    const single = await devtoolsJson<DevtoolsTypes.RequestRecord>(app, `/_devtools/api/requests/${record.id}`);
    expect(single.id).toBe(record.id);

    expect((await devtoolsFetch(app, '/_devtools/api/requests/9999')).status).toBe(404);

    const cleared = await devtoolsFetch(app, '/_devtools/api/requests', { method: 'DELETE' });
    expect(cleared.status).toBe(200);

    await expect(devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests')).resolves.toEqual([]);
  });

  it('should report a bootstrap profile', async () => {
    const app = await createDemoApp();
    const profile = await devtoolsJson<DevtoolsTypes.BootstrapProfile>(app, '/_devtools/api/bootstrap');

    expect(profile.count).toBeGreaterThan(0);
    expect(profile.tree.length).toBeGreaterThan(0);
    expect(profile.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('should surface unvalidated input and server errors in the audit', async () => {
    const app = await createDemoApp();

    await app.fetch(new Request('http://localhost/demo/boom'));

    const report = await devtoolsJson<DevtoolsTypes.AuditReport>(app, '/_devtools/api/audit');
    const rules = report.issues.map((issue) => issue.rule);

    expect(rules).toContain('validation/missing-schema');
    expect(rules).toContain('runtime/server-errors');
    expect(report.score).toBeLessThan(100);
    expect(report.issues[0].severity).toBe('error');
  });

  it('should resolve which route handles a method and path', async () => {
    const app = await createDemoApp();
    const route = await devtoolsJson<DevtoolsTypes.RouteInfo>(app, '/_devtools/api/route?method=GET&path=/demo/ok');

    expect(route).toMatchObject({ controller: 'DemoController', handler: 'ok' });
    expect((await devtoolsFetch(app, '/_devtools/api/route?method=GET&path=/missing')).status).toBe(404);
  });

  it('should bundle everything into a downloadable snapshot', async () => {
    const app = await createDemoApp();
    const response = await devtoolsFetch(app, '/_devtools/api/snapshot');

    expect(response.headers.get('content-disposition')).toContain('vercube-devtools-snapshot.json');

    const snapshot = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(snapshot).sort()).toEqual([
      'audit',
      'bootstrap',
      'config',
      'generatedAt',
      'graph',
      'logs',
      'overview',
      'requests',
      'routes',
    ]);
  });

  it('should push recorded requests over the event stream', async () => {
    const app = await createDemoApp();
    const stream = await devtoolsFetch(app, '/_devtools/api/stream');

    expect(stream.headers.get('content-type')).toContain('text/event-stream');

    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();

    const hello = decoder.decode((await reader.read()).value);
    expect(hello).toContain('event: hello');

    await app.fetch(new Request('http://localhost/demo/ok?name=stream'));

    const frame = decoder.decode((await reader.read()).value);
    expect(frame).toContain('event: request');
    expect(frame).toContain('/demo/ok');

    await reader.cancel();
  });

  it('should skip request recording when tracking is disabled', async () => {
    const app = await createDevtoolsApp({ trackRequests: false }, (app) => {
      app.container.bind(Numbers);
      app.container.bind(DemoController);
    });

    await app.fetch(new Request('http://localhost/demo/ok'));

    await expect(devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests')).resolves.toEqual([]);
  });

  it('should omit headers when capturing them is disabled', async () => {
    const app = await createDevtoolsApp({ captureHeaders: false }, (app) => {
      app.container.bind(Numbers);
      app.container.bind(DemoController);
    });

    await app.fetch(new Request('http://localhost/demo/ok', { headers: { 'x-trace': '1' } }));

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record.requestHeaders).toEqual({});
  });

  it('should redact extra headers listed in the options', async () => {
    const app = await createDevtoolsApp({ redactHeaders: ['x-trace'] }, (app) => {
      app.container.bind(Numbers);
      app.container.bind(DemoController);
    });

    await app.fetch(new Request('http://localhost/demo/ok', { headers: { 'x-trace': 'abc' } }));

    const [record] = await devtoolsJson<DevtoolsTypes.RequestRecord[]>(app, '/_devtools/api/requests');

    expect(record.requestHeaders['x-trace']).toBe('<redacted>');
  });
});
