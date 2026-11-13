import { Controller, Get } from '@vercube/core';
import { StorageManager } from '@vercube/storage';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { createTestApp } from '@vercube/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RateLimit, RateLimitPlugin } from '../src';
import { BrokenStorage } from './Utils/Mock.mock';
import type { TestTelemetry } from '@vercube/telemetry/testing';
import type { TestApp } from '@vercube/testing';

@Controller('/metered')
class MeteredController {
  @Get('/')
  @RateLimit({ limit: 1, window: '1m' })
  public index(): string {
    return 'ok';
  }

  @Get('/broken')
  @RateLimit({ limit: 1, window: '1m', storage: 'broken' })
  public broken(): string {
    return 'ok';
  }
}

/**
 * Reads a counter's data points.
 *
 * @param collected - What the meter provider reported
 * @param name - Name of the instrument
 * @returns Its data points
 */
function points(collected: Awaited<ReturnType<TestTelemetry['collect']>>, name: string) {
  return collected
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
    .flatMap((metric) => metric.dataPoints as { value: number; attributes: Record<string, unknown> }[]);
}

describe('rate limit instrumentation', () => {
  let telemetry: TestTelemetry;
  let app: TestApp;

  beforeAll(async () => {
    telemetry = createTestTelemetry();
    app = await createTestApp({
      controllers: [MeteredController],
      providers: [StorageManager],
      plugins: [RateLimitPlugin],
      config: { rateLimit: { trustProxy: true } },
    });
    await app.resolve(StorageManager).mount({ name: 'broken', storage: BrokenStorage });
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await app.close();
    await telemetry.shutdown();
  });

  it('should count rejected requests by counter name, never by client', async () => {
    await app.get('/metered').header('x-forwarded-for', '1.1.1.1').expect(200);
    await app.get('/metered').header('x-forwarded-for', '1.1.1.1').expect(429);
    await app.get('/metered').header('x-forwarded-for', '1.1.1.1').expect(429);

    expect(points(await telemetry.collect(), 'vercube.ratelimit.limited')).toEqual([
      expect.objectContaining({ value: 2, attributes: { 'vercube.ratelimit.name': 'MeteredController.index' } }),
    ]);
  });

  it('should count requests the storage failed to count', async () => {
    await app.get('/metered/broken').header('x-forwarded-for', '1.1.1.1').expect(200);

    expect(points(await telemetry.collect(), 'vercube.ratelimit.errors')).toEqual([
      expect.objectContaining({ value: 1, attributes: { 'vercube.ratelimit.name': 'MeteredController.broken' } }),
    ]);
  });
});
