import { Body, clearTelemetryContributions, Controller, Delete, Get, Param, Post } from '@vercube/core';
import { afterEach, describe, expect, it } from 'vitest';
import { resetDevtoolsContribution } from '../src/Plugins/DevtoolsPlugin';
import { DevtoolsFrameBus } from '../src/Services/DevtoolsFrameBus';
import { resetDevtoolsTelemetry } from '../src/Telemetry/DevtoolsTelemetry';
import { createDevtoolsApp, devtoolsJson } from './Utils/App';
import type { DevtoolsTypes } from '../src/Types/DevtoolsTypes';
import type { App } from '@vercube/core';

@Controller('/shop')
class ShopController {
  @Get('/orders/:id')
  public read(@Param('id') id: string): Record<string, string> {
    return { id };
  }

  @Post('/orders')
  public create(@Body() body: unknown): unknown {
    return body;
  }

  @Delete('/orders/:id')
  public remove(@Param('id') id: string): Record<string, string> {
    return { removed: id };
  }

  @Get('/admin/stats')
  public stats(): Record<string, number> {
    return { orders: 0 };
  }
}

/** One span, as it appears in an OTLP/JSON payload. */
interface OtlpSpan {
  name: string;
  traceId: string;
  attributes: { key: string; value: { stringValue?: string } }[];
  events?: { name: string; attributes: { key: string; value: { stringValue?: string } }[] }[];
}

/**
 * Boots an app exposing {@link ShopController} with devtools enabled.
 *
 * @param options - Devtools options
 * @returns The running application
 */
function createShopApp(options: DevtoolsTypes.Options = {}): Promise<App> {
  return createDevtoolsApp(options, (app) => {
    app.container.bind(ShopController);
  });
}

/**
 * Reads the buffered spans of one route.
 *
 * @param app - Running application
 * @param name - Span name
 * @returns The span, when it was recorded
 */
async function spanOf(app: App, name: string): Promise<OtlpSpan | undefined> {
  await new Promise((resolve) => setTimeout(resolve, 20));

  const payload = await devtoolsJson<{ resourceSpans?: { scopeSpans?: { spans?: OtlpSpan[] }[] }[] }>(
    app,
    '/_devtools/api/signals/traces',
  );

  return (payload.resourceSpans ?? [])
    .flatMap((resource) => (resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []))
    .find((span) => span.name === name);
}

/**
 * Flattens the attributes of a span or an event.
 *
 * @param list - OTLP attributes
 * @returns The attributes as a record
 */
function record(list: { key: string; value: { stringValue?: string } }[] | undefined): Record<string, string | undefined> {
  return Object.fromEntries((list ?? []).map((entry) => [entry.key, entry.value.stringValue]));
}

describe('route playground', () => {
  afterEach(async () => {
    await resetDevtoolsTelemetry();
    resetDevtoolsContribution();
    clearTelemetryContributions();
  });

  describe('options', () => {
    it('is on by default and leaves out only the devtools routes', async () => {
      const app = await createShopApp();
      const description = await devtoolsJson<DevtoolsTypes.PlaygroundDescription>(app, '/_devtools/api/playground');

      expect(description.enabled).toBe(true);
      expect(description.excluded.length).toBeGreaterThan(0);
      expect(description.excluded.every((id) => id.includes(' /_devtools'))).toBe(true);
    });

    it('is removed by `playground: false`', async () => {
      const app = await createShopApp({ playground: false });

      expect(await devtoolsJson(app, '/_devtools/api/playground')).toEqual({ enabled: false, excluded: [] });
    });

    it('is removed by `playground.enabled: false`', async () => {
      const app = await createShopApp({ playground: { enabled: false, exclude: ['/shop/**'] } });

      expect(await devtoolsJson(app, '/_devtools/api/playground')).toEqual({ enabled: false, excluded: [] });
    });

    it('stays on for `playground: true` and for an object without a switch', async () => {
      const on = await createShopApp({ playground: true });

      expect((await devtoolsJson<DevtoolsTypes.PlaygroundDescription>(on, '/_devtools/api/playground')).enabled).toBe(true);

      await resetDevtoolsTelemetry();

      const narrowed = await createShopApp({ playground: { exclude: [] } });

      expect((await devtoolsJson<DevtoolsTypes.PlaygroundDescription>(narrowed, '/_devtools/api/playground')).enabled).toBe(true);
    });

    it('leaves out the routes the patterns cover', async () => {
      const app = await createShopApp({ playground: { exclude: ['DELETE /shop/orders/:id', '/shop/admin/**'] } });
      const { excluded } = await devtoolsJson<DevtoolsTypes.PlaygroundDescription>(app, '/_devtools/api/playground');

      expect(excluded).toEqual(expect.arrayContaining(['DELETE /shop/orders/:id', 'GET /shop/admin/stats']));
      expect(excluded).not.toContain('GET /shop/orders/:id');
      expect(excluded).not.toContain('POST /shop/orders');
    });

    it('drops patterns that are not usable strings', async () => {
      const app = await createShopApp({
        playground: { exclude: ['', '   ', 42 as unknown as string, '/shop/admin/**'] },
      });
      const { excluded } = await devtoolsJson<DevtoolsTypes.PlaygroundDescription>(app, '/_devtools/api/playground');

      expect(excluded.filter((id) => !id.includes(' /_devtools'))).toEqual(['GET /shop/admin/stats', 'HEAD /shop/admin/stats']);
    });

    it('ignores an exclude list that is not a list', async () => {
      const app = await createShopApp({ playground: { exclude: '/shop/**' as unknown as string[] } });
      const { excluded } = await devtoolsJson<DevtoolsTypes.PlaygroundDescription>(app, '/_devtools/api/playground');

      expect(excluded.every((id) => id.includes(' /_devtools'))).toBe(true);
    });
  });

  describe('marker', () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

    it('records the request under the trace id the playground chose', async () => {
      const app = await createShopApp();

      await app.fetch(
        new Request('http://localhost/shop/orders/7', {
          headers: {
            'x-devtools-request': '1',
            'x-devtools-playground': traceId,
            traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
          },
        }),
      );

      const span = await spanOf(app, 'GET /shop/orders/:id');

      expect(span?.traceId).toBe(traceId);
      expect(record(span?.attributes)['vercube.devtools.playground']).toBe(traceId);
    });

    it('withholds the credentials the playground names, in the snapshot and on the stream', async () => {
      const app = await createShopApp();
      const frames: unknown[] = [];

      app.container.get(DevtoolsFrameBus).subscribe((frame) => frames.push(frame));

      await app.fetch(
        new Request('http://localhost/shop/orders', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-devtools-playground': traceId,
            'x-devtools-playground-redact': 'x-client-id',
            'x-client-id': 'key-that-must-not-leak',
            authorization: 'Bearer also-secret',
          },
          body: '{}',
        }),
      );

      const span = await spanOf(app, 'POST /shop/orders');
      const headers = record(span?.events?.find((event) => event.name === 'http.request.headers')?.attributes);

      expect(headers['x-client-id']).toBe('<redacted>');
      expect(headers.authorization).toBe('<redacted>');
      expect(headers['x-devtools-playground']).toBe(traceId);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(frames.length).toBeGreaterThan(0);
      expect(JSON.stringify(frames)).not.toContain('key-that-must-not-leak');
      expect(JSON.stringify(frames)).toContain('vercube.devtools.playground');
    });

    it('leaves a request without the header unmarked', async () => {
      const app = await createShopApp();

      await app.fetch(new Request('http://localhost/shop/orders/7', { headers: { 'x-client-id': 'visible' } }));

      const span = await spanOf(app, 'GET /shop/orders/:id');
      const headers = record(span?.events?.find((event) => event.name === 'http.request.headers')?.attributes);

      expect(record(span?.attributes)).not.toHaveProperty('vercube.devtools.playground');
      expect(headers['x-client-id']).toBe('visible');
    });

    it('still links by trace id when headers are not captured', async () => {
      const app = await createShopApp({ captureHeaders: false });

      await app.fetch(
        new Request('http://localhost/shop/orders/7', {
          headers: { 'x-devtools-playground': traceId, traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
        }),
      );

      const span = await spanOf(app, 'GET /shop/orders/:id');

      expect(span?.traceId).toBe(traceId);
      expect(record(span?.attributes)).not.toHaveProperty('vercube.devtools.playground');
    });
  });
});
