import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { Controller, createApp, Get, Param } from '@vercube/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Telemetry } from '../src/Common/Telemetry';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';
import type { App } from '@vercube/core';

const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const PARENT_SPAN_ID = 'b7ad6b7169203331';

@Controller('/users')
class UsersController {
  @Get('/:id')
  public byId(@Param('id') id: string): unknown {
    return { id };
  }

  @Get('/boom')
  public boom(): unknown {
    throw new Error('nope');
  }
}

@Controller('/work')
class WorkController {
  @Get('/nested')
  public nested(): unknown {
    // Resolved through the container rather than injected, to keep the test
    // controller free of a hard dependency on telemetry being installed.
    const telemetry = app.container.get(Telemetry);

    return telemetry.span('work.step', (span) => {
      span.setAttribute('work.items', 3);
      return { ok: true };
    });
  }

  @Get('/outgoing')
  public outgoing(): unknown {
    const headers: Record<string, string> = {};
    app.container.get(Telemetry).inject(headers);

    return headers;
  }
}

let app: App;
let telemetry: TestTelemetry;

describe('@vercube/telemetry end to end', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    app = await createApp({
      cfg: { telemetry: true, requestLogging: false },
      setup: (instance) => {
        instance.container.bind(UsersController);
        instance.container.bind(WorkController);
        instance.addPlugin(TelemetryPlugin);
      },
    });
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
    context.disable();
  });

  it('produces one server span per request', async () => {
    const response = await app.fetch(new Request('http://localhost/users/42?full=1'));

    expect(response.status).toBe(200);

    const span = telemetry.span('GET /users/:id');

    expect(span).toBeDefined();
    expect(span!.kind).toBe(SpanKind.SERVER);
    expect(span!.attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/users/:id',
      'http.response.status_code': 200,
      'url.path': '/users/42',
      'url.query': 'full=1',
      'url.scheme': 'http',
      'vercube.controller': 'UsersController',
      'vercube.handler': 'byId',
    });
  });

  it('continues an incoming trace', async () => {
    await app.fetch(
      new Request('http://localhost/users/42', {
        headers: { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` },
      }),
    );

    const span = telemetry.span('GET /users/:id');

    expect(span!.spanContext().traceId).toBe(TRACE_ID);
    expect(span!.parentSpanContext?.spanId).toBe(PARENT_SPAN_ID);
  });

  it('starts a fresh trace without a traceparent', async () => {
    await app.fetch(new Request('http://localhost/users/42'));

    const span = telemetry.span('GET /users/:id');

    expect(span!.parentSpanContext).toBeUndefined();
    expect(span!.spanContext().traceId).not.toBe(TRACE_ID);
  });

  it('records handler exceptions and marks the span failed', async () => {
    const response = await app.fetch(new Request('http://localhost/users/boom'));

    expect(response.status).toBe(500);

    // `/users/boom` is a static route, so it wins over the `/users/:id` pattern.
    const span = telemetry.span('GET /users/boom');

    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.attributes['error.type']).toBe('Error');
    expect(span!.events.map((event) => event.name)).toContain('exception');
  });

  it('spans unmatched traffic without a route attribute', async () => {
    const response = await app.fetch(new Request('http://localhost/missing'));

    expect(response.status).toBe(404);

    const span = telemetry.span('GET');

    expect(span).toBeDefined();
    expect(span!.attributes['http.route']).toBeUndefined();
    expect(span!.attributes['url.path']).toBe('/missing');
  });

  it('withholds credential-bearing query parameters', async () => {
    await app.fetch(new Request('http://localhost/users/42?access_token=super-secret&page=2'));

    const span = telemetry.span('GET /users/:id')!;
    const query = String(span.attributes['url.query']);

    // A secret in the query string is as sensitive as one in a header, and it
    // travels to every exporter that shares the pipeline.
    expect(query).not.toContain('super-secret');
    expect(query).toContain('page=2');
    expect(query).toContain('%3Credacted%3E');
  });

  it('leaves an ordinary query string untouched', async () => {
    await app.fetch(new Request('http://localhost/users/42?page=2&sort=name'));

    expect(telemetry.span('GET /users/:id')!.attributes['url.query']).toBe('page=2&sort=name');
  });

  it('does not mark a 4xx as a failed span', async () => {
    await app.fetch(new Request('http://localhost/missing'));

    const span = telemetry.span('GET')!;

    // The exception is still recorded; what a 404 must not do is report the
    // server as broken.
    expect(span.attributes['error.type']).toBe('NotFoundError');
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('nests application spans under the server span', async () => {
    await app.fetch(new Request('http://localhost/work/nested'));

    const server = telemetry.span('GET /work/nested');
    const step = telemetry.span('work.step');

    expect(step).toBeDefined();
    expect(step!.attributes['work.items']).toBe(3);
    expect(step!.parentSpanContext?.spanId).toBe(server!.spanContext().spanId);
    expect(step!.spanContext().traceId).toBe(server!.spanContext().traceId);
  });

  it('injects trace context for outgoing calls', async () => {
    const response = await app.fetch(new Request('http://localhost/work/outgoing'));
    const headers = (await response.json()) as Record<string, string>;
    const server = telemetry.span('GET /work/outgoing');

    expect(headers.traceparent).toBe(`00-${server!.spanContext().traceId}-${server!.spanContext().spanId}-01`);
  });

  it('produces nothing for an excluded path', async () => {
    const excluded = await createApp({
      cfg: { telemetry: { exclude: ['/internal'] }, requestLogging: false },
      setup: (instance) => {
        instance.container.bind(UsersController);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    telemetry.reset();
    await excluded.fetch(new Request('http://localhost/internal/health'));

    expect(telemetry.spans()).toEqual([]);
  });

  it('has no active span once the request is done', async () => {
    await app.fetch(new Request('http://localhost/users/42'));

    expect(trace.getActiveSpan()).toBeUndefined();
  });
});
