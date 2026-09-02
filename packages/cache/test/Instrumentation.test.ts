import { Container } from '@vercube/di';
import { StorageManager } from '@vercube/storage';
import { MemoryStorage } from '@vercube/storage/drivers/MemoryStorage';
import { createTestTelemetry } from '@vercube/telemetry/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CacheManager } from '../src/Services/CacheManager';
import type { TestTelemetry } from '@vercube/telemetry/testing';

let container: Container;
let cache: CacheManager;
let telemetry: TestTelemetry;

describe('cache instrumentation', () => {
  beforeAll(async () => {
    telemetry = createTestTelemetry();

    container = new Container();
    container.bind(StorageManager);
    await container.get(StorageManager).mount({ storage: MemoryStorage });
    container.bind(CacheManager);
    cache = container.get(CacheManager);
  });

  afterEach(() => telemetry.reset());

  afterAll(async () => {
    await telemetry.shutdown();
  });

  it('opens a span per lookup', async () => {
    const load = cache.cached(() => 'value', { name: 'demo' });

    await load();

    const span = telemetry.span('cache.demo');

    expect(span).toBeDefined();
    expect(span!.attributes['vercube.cache.name']).toBe('demo');
  });

  it('marks the first lookup as a miss and the next as a hit', async () => {
    const load = cache.cached((id: string) => `value:${id}`, { name: 'users' });

    await load('1');
    const miss = telemetry.span('cache.users')!;

    telemetry.reset();
    await load('1');
    const hit = telemetry.span('cache.users')!;

    expect(miss.attributes['vercube.cache.hit']).toBe(false);
    expect(hit.attributes['vercube.cache.hit']).toBe(true);
  });

  it('nests work done inside the cached function under the lookup', async () => {
    const storage = container.get(StorageManager);
    const load = cache.cached(async () => (await storage.getItem<string>({ key: 'origin' })) ?? 'value', {
      name: 'nested',
    });

    await load();

    const lookup = telemetry.span('cache.nested')!;
    const read = telemetry.span('storage.getItem');

    // This is the point of instrumenting the packages rather than devtools:
    // a cache miss now shows what it did to resolve the value, and nothing
    // involved had to know the other existed.
    expect(read).toBeDefined();
    expect(read!.parentSpanContext?.spanId).toBe(lookup.spanContext().spanId);
  });

  it('keeps the cached function api intact', async () => {
    const load = cache.cached((id: string) => `value:${id}`, { name: 'api' });

    await load('1');

    expect(typeof load.invalidate).toBe('function');
  });
});
