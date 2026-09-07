import { Controller, createApp, Get } from '@vercube/core';
import { Inject } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { TelemetryPlugin } from '@vercube/telemetry';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '@vercube/core';
import type { TestTelemetry } from '@vercube/telemetry/testing';

/**
 * Every instrumented package reaches OpenTelemetry through
 * `@vercube/telemetry/instrument` rather than depending on it directly. That
 * indirection is only correct if the active context still crosses it, so this
 * asserts the thing that would break silently: a storage span produced from a
 * request handler has to land under that request's server span.
 */
@Controller('/telemetry')
class TelemetryController {
  @Inject(StorageManager)
  private gStorage!: StorageManager;

  @Get('/item')
  public async item(): Promise<{ value: string | null }> {
    await this.gStorage.setItem({ key: 'probe', value: 'value' });

    return { value: await this.gStorage.getItem<string>({ key: 'probe' }) };
  }
}

describe('telemetry propagation across packages', () => {
  let telemetry: TestTelemetry;
  let app: App;

  beforeAll(async () => {
    telemetry = createTestTelemetry();

    app = await createApp({
      cfg: { telemetry: { enabled: true, spans: { di: false } }, requestLogging: false },
      setup: (instance) => {
        instance.container.bind(StorageManager);
        instance.container.bind(TelemetryController);
        instance.addPlugin(TelemetryPlugin);
      },
    });

    await app.container.get(StorageManager).mount({ storage: MemoryStorage });
  });

  afterAll(() => telemetry.shutdown());

  it('nests storage spans under the server span that caused them', async () => {
    const response = await app.fetch(new Request('http://localhost/telemetry/item'));

    expect(response.status).toBe(200);
    await telemetry.settle();

    const server = telemetry.span('GET /telemetry/item');
    const setItem = telemetry.span('storage.setItem');
    const getItem = telemetry.span('storage.getItem');

    expect(server).toBeDefined();
    expect(setItem).toBeDefined();
    expect(getItem).toBeDefined();

    // Same trace, and parented on the handler span nested in the server span
    // rather than floating as roots of their own.
    expect(setItem?.spanContext().traceId).toBe(server?.spanContext().traceId);
    expect(getItem?.spanContext().traceId).toBe(server?.spanContext().traceId);
    expect(setItem?.parentSpanContext?.spanId).toBeDefined();
    expect(getItem?.parentSpanContext?.spanId).toBeDefined();
  });
});
