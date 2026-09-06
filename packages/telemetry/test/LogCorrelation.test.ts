import { context } from '@opentelemetry/api';
import { Controller, createApp, Get } from '@vercube/core';
import { Logger } from '@vercube/logger';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';
import type { App } from '@vercube/core';
import type { WideEvent } from '@vercube/logger';

@Controller('/reports')
class ReportsController {
  @Get('/:id')
  public byId(): unknown {
    app.container.get(Logger).info('reports', 'generating');
    return { ok: true };
  }
}

let app: App;
let telemetry: TestTelemetry;
let events: WideEvent[];

describe('log and trace correlation', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    app = await createApp({
      cfg: { telemetry: true, logLevel: 'debug' },
      setup: (instance) => {
        instance.container.bind(ReportsController);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    app.container.get(Logger).configure({ logLevel: 'debug', silent: true });
    app.container.get(Logger).addDrain('test', ({ event }) => {
      events.push(event);
    });
  });

  beforeEach(() => {
    events = [];
    telemetry.reset();
  });

  afterAll(async () => {
    await telemetry.shutdown();
    context.disable();
  });

  it('stamps a plain log line with the active span', async () => {
    await app.fetch(new Request('http://localhost/reports/7'));

    const span = telemetry.span('GET /reports/:id')!;
    const line = events.find((event) => event.message === 'generating');

    expect(line).toBeDefined();
    expect(line!.traceId).toBe(span.spanContext().traceId);
    expect(line!.spanId).toBe(span.spanContext().spanId);
  });

  it('keys the request wide event by the trace id', async () => {
    await app.fetch(new Request('http://localhost/reports/7'));

    const span = telemetry.span('GET /reports/:id')!;
    const wideEvent = events.find((event) => event.path === '/reports/7');

    expect(wideEvent).toBeDefined();
    expect(wideEvent!.requestId).toBe(span.spanContext().traceId);
    expect(wideEvent!.traceId).toBe(span.spanContext().traceId);
  });

  it('carries an inbound trace id into the logs', async () => {
    const traceId = '0af7651916cd43dd8448eb211c80319c';

    await app.fetch(
      new Request('http://localhost/reports/7', {
        headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` },
      }),
    );

    expect(events.filter((event) => event.traceId !== undefined).map((event) => event.traceId)).toContain(traceId);
  });

  it('leaves log lines outside a request without span ids', () => {
    app.container.get(Logger).info('offline', 'no request here');

    const line = events.find((event) => event.message === 'no request here');

    expect(line).toBeDefined();
    expect(line!.traceId).toBeUndefined();
  });
});
