import { context } from '@opentelemetry/api';
import { Controller, createApp, Get } from '@vercube/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TelemetryPlugin } from '../src/Plugins/TelemetryPlugin';
import { createTestTelemetry } from '../src/Testing';
import type { TestTelemetry } from '../src/Testing';
import type { MetricData, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { App } from '@vercube/core';

@Controller('/ping')
class PingController {
  @Get('/')
  public ping(): unknown {
    return { ok: true };
  }
}

let app: App;
let telemetry: TestTelemetry;
let collected: ResourceMetrics[];

/**
 * Finds a collected instrument by name.
 *
 * @param name - Instrument name
 * @returns The metric data, if it was reported
 */
function metric(name: string): MetricData | undefined {
  return collected
    .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
    .find((data) => data.descriptor.name === name);
}

describe('telemetry metrics', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    app = await createApp({
      cfg: { telemetry: true, requestLogging: false },
      setup: (instance) => {
        instance.container.bind(PingController);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    await app.fetch(new Request('http://localhost/ping'));
    await app.fetch(new Request('http://localhost/ping'));

    collected = await telemetry.collect();
  });

  afterAll(async () => {
    await telemetry.shutdown();
    context.disable();
  });

  it('records the request duration histogram', () => {
    const duration = metric('http.server.request.duration');

    expect(duration).toBeDefined();
    expect(duration!.descriptor.unit).toBe('s');
    expect(duration!.dataPoints[0].attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/ping/',
      'http.response.status_code': 200,
    });
  });

  it('keeps the url out of the metric attributes', () => {
    const duration = metric('http.server.request.duration')!;

    // One time series per URL is how a metrics backend gets destroyed.
    expect(duration.dataPoints[0].attributes['url.path']).toBeUndefined();
    expect(duration.dataPoints[0].attributes['url.query']).toBeUndefined();
  });

  it('reports process gauges', () => {
    expect(metric('process.memory.usage')).toBeDefined();
    expect(metric('v8js.memory.heap.used')).toBeDefined();
    expect((metric('v8js.memory.heap.used')!.dataPoints[0].value as number) > 0).toBe(true);
  });

  it('reports event loop health', () => {
    const delay = metric('nodejs.eventloop.delay.mean');

    expect(delay).toBeDefined();
    // The sampling floor is subtracted, so an idle loop must not claim ~10ms of lag.
    expect(delay!.dataPoints[0].value as number).toBeLessThan(0.005);
  });
});
