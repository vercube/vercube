import { BaseMiddleware, Body, Controller, ContainerProvider, Get, Middleware, Post, QueryParam } from '@vercube/core';
import { Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetDevtoolsTelemetry } from '../src/Telemetry/DevtoolsTelemetry';
import { createDevtoolsApp, devtoolsFetch, devtoolsJson } from './Utils/App';
import type { DevtoolsTypes } from '../src/Types/DevtoolsTypes';
import type { App, IntrospectionTypes } from '@vercube/core';

class TouchMiddleware extends BaseMiddleware {
  public onResponse(): void {
    /* exercises the after phase */
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

  @Get('/boom')
  public boom(): never {
    throw new Error('handler exploded');
  }

  @Get('/chatty')
  public chatty(): Record<string, boolean> {
    this.gLogger.info('handling chatty', { attempt: 1 });
    return { logged: true };
  }

  @Post('/echo')
  public echo(@Body() body: unknown): unknown {
    return body;
  }
}

/** One span, as it appears in an OTLP/JSON payload. */
interface OtlpSpan {
  name: string;
  attributes: { key: string; value: Record<string, unknown> }[];
  events?: { name: string; attributes: { key: string; value: Record<string, unknown> }[] }[];
}

/**
 * Boots an app exposing {@link DemoController} with devtools enabled.
 *
 * @returns The running application
 */
function createDemoApp(): Promise<App> {
  return createDevtoolsApp({}, (app) => {
    app.container.bind(Numbers);
    app.container.bind(DemoController);
  });
}

/**
 * Flattens the spans out of an OTLP trace payload.
 *
 * @param payload - The OTLP export request
 * @returns Every span it contains
 */
function spansOf(payload: unknown): OtlpSpan[] {
  const resourceSpans = (payload as { resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[] }).resourceSpans ?? [];

  return resourceSpans.flatMap((resource) => (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []));
}

/**
 * Reads a span attribute.
 *
 * @param span - The span
 * @param key - Attribute key
 * @returns The attribute value, whatever type it carries
 */
function attribute(span: OtlpSpan, key: string): unknown {
  return Object.values(span.attributes.find((entry) => entry.key === key)?.value ?? {})[0];
}

/**
 * Lets deferred span ends and batched frames settle.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('devtools API', () => {
  afterEach(async () => {
    await resetDevtoolsTelemetry();
  });

  it('serves the overview', async () => {
    const app = await createDemoApp();
    const overview = await devtoolsJson<DevtoolsTypes.Overview>(app, '/_devtools/api/overview');

    expect(overview.counts.controllers).toBeGreaterThan(0);
    expect(overview.runtime.name).toBe('node');
    expect(overview.score).toBeLessThanOrEqual(100);
  });

  it('lists the introspection sections', async () => {
    const app = await createDemoApp();
    const { sections } = await devtoolsJson<{ sections: { id: string }[] }>(app, '/_devtools/api/introspect');

    expect(sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(['config', 'container', 'plugins', 'routes', 'storage']),
    );
  });

  it('describes routes through introspection', async () => {
    const app = await createDemoApp();
    const section = await devtoolsJson<{ data: IntrospectionTypes.RouteDescription[] }>(app, '/_devtools/api/introspect/routes');

    const ok = section.data.find((route) => route.id === 'GET /demo/ok');

    expect(ok).toMatchObject({ controller: 'DemoController', handler: 'ok', basePath: '/demo' });
    expect(ok!.middlewares.some((middleware) => middleware.name === 'TouchMiddleware')).toBe(true);
  });

  it('revalidates a section with its revision', async () => {
    const app = await createDemoApp();
    const first = await devtoolsFetch(app, '/_devtools/api/introspect/routes');
    const etag = first.headers.get('etag');

    expect(etag).toBeTruthy();

    const second = await devtoolsFetch(app, '/_devtools/api/introspect/routes', {
      headers: { 'if-none-match': etag! },
    });

    expect(second.status).toBe(304);
  });

  it('rejects an unknown section', async () => {
    const app = await createDemoApp();

    expect((await devtoolsFetch(app, '/_devtools/api/introspect/nope')).status).toBe(404);
  });

  it('records requests as OTLP spans', async () => {
    const app = await createDemoApp();
    await app.fetch(new Request('http://localhost/demo/ok?name=ada'));
    await settle();

    const spans = spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces'));
    const request = spans.find((span) => span.name === 'GET /demo/ok');

    expect(request).toBeDefined();
    expect(attribute(request!, 'http.route')).toBe('/demo/ok');
    expect(attribute(request!, 'vercube.controller')).toBe('DemoController');
    expect(attribute(request!, 'url.query')).toBe('name=ada');
  });

  it('records the failing handler on the span', async () => {
    const app = await createDemoApp();
    await app.fetch(new Request('http://localhost/demo/boom'));
    await settle();

    const spans = spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces'));
    const failed = spans.find((span) => span.name === 'GET /demo/boom')!;

    expect(attribute(failed, 'error.type')).toBe('Error');
    expect(failed.events?.some((event) => event.name === 'exception')).toBe(true);
  });

  it('captures request and response bodies as span events', async () => {
    const app = await createDemoApp();
    await app.fetch(
      new Request('http://localhost/demo/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hello: 'world' }),
      }),
    );
    await settle();

    const spans = spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces'));
    const echo = spans.find((span) => span.name === 'POST /demo/echo')!;
    const body = echo.events?.find((event) => event.name === 'http.request.body');

    expect(body).toBeDefined();
    expect(Object.values(body!.attributes.find((entry) => entry.key === 'body.text')!.value)[0]).toBe('{"hello":"world"}');
  });

  it('captures headers and withholds credentials', async () => {
    const app = await createDemoApp();
    await app.fetch(
      new Request('http://localhost/demo/ok', {
        headers: { authorization: 'Bearer super-secret', 'x-tenant': 'acme' },
      }),
    );
    await settle();

    const spans = spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces'));
    const events = spans.find((span) => span.name === 'GET /demo/ok')!.events ?? [];
    const headers = events.find((event) => event.name === 'http.request.headers');

    expect(headers).toBeDefined();

    const byKey = Object.fromEntries(headers!.attributes.map((entry) => [entry.key, Object.values(entry.value)[0]]));

    expect(byKey['x-tenant']).toBe('acme');
    expect(byKey.authorization).toBe('<redacted>');
  });

  it('never records its own traffic', async () => {
    const app = await createDemoApp();
    await devtoolsFetch(app, '/_devtools/api/overview');
    await settle();

    const spans = spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces'));

    expect(spans.some((span) => String(attribute(span, 'url.path') ?? '').startsWith('/_devtools'))).toBe(false);
  });

  it('records log lines correlated with their span', async () => {
    const app = await createDemoApp();
    await app.fetch(new Request('http://localhost/demo/chatty'));
    await settle();

    const payload = (await devtoolsJson(app, '/_devtools/api/signals/logs')) as {
      resourceLogs: { scopeLogs: { logRecords: { body: { stringValue: string }; traceId?: string }[] }[] }[];
    };

    const records = payload.resourceLogs.flatMap((resource) => resource.scopeLogs.flatMap((scope) => scope.logRecords));
    const line = records.find((record) => record.body.stringValue.includes('handling chatty'));

    expect(line).toBeDefined();
    expect(line!.traceId).toBeTruthy();
  });

  it('clears a signal buffer', async () => {
    const app = await createDemoApp();
    await app.fetch(new Request('http://localhost/demo/ok'));
    await settle();

    expect(spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces')).length).toBeGreaterThan(0);

    await devtoolsFetch(app, '/_devtools/api/signals/traces/clear');

    expect(spansOf(await devtoolsJson(app, '/_devtools/api/signals/traces'))).toEqual([]);
  });

  it('rejects an unknown signal', async () => {
    const app = await createDemoApp();

    expect((await devtoolsFetch(app, '/_devtools/api/signals/nope')).status).toBe(404);
  });

  it('collects metrics on demand', async () => {
    const app = await createDemoApp();
    await app.fetch(new Request('http://localhost/demo/ok'));
    await settle();

    const payload = (await devtoolsJson(app, '/_devtools/api/signals/metrics')) as {
      resourceMetrics: { scopeMetrics: { metrics: { name: string }[] }[] }[];
    };

    const names = payload.resourceMetrics.flatMap((resource) =>
      resource.scopeMetrics.flatMap((scope) => scope.metrics.map((metric) => metric.name)),
    );

    expect(names).toEqual(expect.arrayContaining(['http.server.request.duration', 'v8js.memory.heap.used']));
  });

  it('builds the container graph once per overview request', async () => {
    const app = await createDemoApp();
    const provider = app.container.get(ContainerProvider);
    const describe = vi.spyOn(provider, 'describe');

    await devtoolsJson(app, '/_devtools/api/overview');

    // The overview aggregates counts, the audit and the health score, and all
    // three used to rebuild the dependency graph independently. The
    // introspection cache is what collapses them into one build.
    expect(describe).toHaveBeenCalledTimes(1);
  });

  it('runs the audit rules', async () => {
    const app = await createDemoApp();
    const report = await devtoolsJson<DevtoolsTypes.AuditReport>(app, '/_devtools/api/audit');

    expect(report.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it('bundles everything into a downloadable snapshot', async () => {
    const app = await createDemoApp();
    const response = await devtoolsFetch(app, '/_devtools/api/snapshot');

    expect(response.headers.get('content-disposition')).toContain('vercube-devtools-snapshot.json');

    const payload = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(payload)).toEqual(expect.arrayContaining(['overview', 'audit', 'introspection', 'signals', 'protocol']));
  });

  it('streams versioned frames', async () => {
    const app = await createDemoApp();
    const response = await devtoolsFetch(app, '/_devtools/api/stream');

    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    await app.fetch(new Request('http://localhost/demo/ok'));

    let buffer = '';
    let trace: Record<string, unknown> | undefined;
    const seen: Record<string, unknown>[] = [];

    while (!trace) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const frame = JSON.parse(line.slice(6)) as Record<string, unknown>;
        seen.push(frame);

        if (frame.ch === 'trace') {
          trace = frame;
        }
      }
    }

    await reader.cancel();

    // The greeting is addressed to the connection that just opened, so it has
    // to be the very first thing it receives.
    expect(seen[0]).toMatchObject({ ch: 'control', data: { type: 'hello' } });
    expect(trace).toMatchObject({ v: 1, ch: 'trace' });
    expect(typeof trace!.seq).toBe('number');
    expect(spansOf(trace!.data).some((span) => span.name === 'GET /demo/ok')).toBe(true);
  });
});
