import { beforeEach, describe, expect, it } from 'vitest';
import { Controller, createApp, Get, Post, TelemetryRegistry } from '../../../src';
import { defaultConfig } from '../../../src/Config/DefaultConfig';
import { HttpServer } from '../../../src/Services/HttpServer/HttpServer';
import { RequestHandler } from '../../../src/Services/Router/RequestHandler';
import { Router } from '../../../src/Services/Router/Router';
import { resolveTelemetryOptions } from '../../../src/Services/Telemetry/TelemetryOptions';
import type { App } from '../../../src';
import type { TelemetryTypes } from '../../../src/Types/TelemetryTypes';

@Controller('/telemetry')
class TelemetryController {
  @Get('/plain')
  public plain(): unknown {
    return { ok: true };
  }

  @Get('/boom')
  public boom(): unknown {
    throw new Error('handler exploded');
  }

  @Post('/echo')
  public echo(): unknown {
    return { ok: true };
  }
}

/**
 * Records every span the seam opens, without any OpenTelemetry involvement.
 *
 * @returns The recorder and the hooks to install
 */
function createRecorder(): {
  calls: TelemetryTypes.ServerSpanContext[];
  errors: unknown[];
  hooks: TelemetryTypes.Hooks;
} {
  const calls: TelemetryTypes.ServerSpanContext[] = [];
  const errors: unknown[] = [];

  return {
    calls,
    errors,
    hooks: {
      server(context, fn) {
        calls.push(context);
        return fn();
      },
      recordError(error) {
        errors.push(error);
      },
      traceId() {
        return undefined;
      },
      flush() {
        return Promise.resolve();
      },
    },
  };
}

describe('telemetry seam in core', () => {
  let app: App;

  beforeEach(async () => {
    app = await createApp({
      cfg: { ...defaultConfig, requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(TelemetryController);
      },
    });
  });

  it('leaves the fast path synchronous when nothing is installed', () => {
    const router = app.container.get(Router);
    const handler = app.container.get(RequestHandler);
    const route = router.match('GET', '/telemetry/plain');

    expect(route).toBeDefined();
    expect(app.container.get(TelemetryRegistry).hooks).toBeNull();

    // A route with no middlewares must produce its Response without ever
    // creating a promise - see RequestHandler.handleSimpleRequest.
    const result = handler.handleRequest(new Request('http://localhost/telemetry/plain'), route!);

    expect(result).toBeInstanceOf(Response);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('precomputes the span name and route template at registration time', () => {
    const routes = app.container.get(Router).routes;
    const plain = routes.find((route) => route.path === '/telemetry/plain' && route.method === 'GET');

    expect(plain?.handler.spanName).toBe('GET /telemetry/plain');
    expect(plain?.handler.path).toBe('/telemetry/plain');
    expect(plain?.handler.controller).toBe('TelemetryController');

    // @Get registers HEAD as well, and the two must not share a span name.
    const head = routes.find((route) => route.path === '/telemetry/plain' && route.method === 'HEAD');
    expect(head?.handler.spanName).toBe('HEAD /telemetry/plain');
  });

  it('opens one span per matched request once hooks are installed', async () => {
    const recorder = createRecorder();
    app.container.get(TelemetryRegistry).install(recorder.hooks);

    const response = await app.container.get(HttpServer).handleRequest(new Request('http://localhost/telemetry/plain?page=2'));

    expect(response.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      name: 'GET /telemetry/plain',
      route: '/telemetry/plain',
      controller: 'TelemetryController',
      handler: 'plain',
    });
  });

  it('reports handler exceptions through recordError', async () => {
    const recorder = createRecorder();
    app.container.get(TelemetryRegistry).install(recorder.hooks);

    await app.container.get(HttpServer).handleRequest(new Request('http://localhost/telemetry/boom'));

    expect(recorder.errors).toHaveLength(1);
    expect((recorder.errors[0] as Error).message).toBe('handler exploded');
  });

  it('spans unmatched traffic too', async () => {
    const recorder = createRecorder();
    app.container.get(TelemetryRegistry).install(recorder.hooks);

    const response = await app.container.get(HttpServer).handleRequest(new Request('http://localhost/nope'));

    expect(response.status).toBe(404);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].route).toBeUndefined();
    expect(recorder.calls[0].name).toBe('GET');
  });

  it('refuses a second implementation', () => {
    const registry = app.container.get(TelemetryRegistry);
    registry.install(createRecorder().hooks);

    expect(() => registry.install(createRecorder().hooks)).toThrow(/already installed/);
  });
});

describe('resolveTelemetryOptions', () => {
  it('defaults to on outside production', () => {
    expect(resolveTelemetryOptions({}).enabled).toBe(true);
    expect(resolveTelemetryOptions({ production: true }).enabled).toBe(false);
  });

  it('accepts the boolean shorthand', () => {
    expect(resolveTelemetryOptions({ telemetry: true, production: true }).enabled).toBe(true);
    expect(resolveTelemetryOptions({ telemetry: false }).enabled).toBe(false);
  });

  it('keeps the rest of the options', () => {
    const resolved = resolveTelemetryOptions({ telemetry: { sampler: { ratio: 0.1 }, metrics: false } });

    expect(resolved).toMatchObject({ enabled: true, sampler: { ratio: 0.1 }, metrics: false });
  });
});
